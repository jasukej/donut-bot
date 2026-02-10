/** 
 * Posts a reminder to pending matches from the latest round. 
 * Collects data on no. of pairs that have met to post in weekly summary. *
 */

import { supabase, postMessage } from "@shared";
import { serve, jsonResponse, errorResponse, requireEnv } from "@shared/handler";
import { buildDidYouMeetBlocks, MEET_REMINDER_FALLBACK } from "@shared/messages";

serve(async () => {
  const slackToken = requireEnv("SLACK_BOT_TOKEN");
  if (slackToken instanceof Response) return slackToken;

  const { data: latestRound, error: roundError } = await supabase
    .from("rounds")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (roundError || !latestRound) {
    return jsonResponse({ message: "No rounds found" });
  }

  const round = latestRound as { id: string };

  const { data: pendingData, error: matchesError } = await supabase
    .from("matches")
    .select("id, slack_channel_id")
    .eq("round_id", round.id)
    .eq("met_status", "pending")
    .not("slack_channel_id", "is", null);

  if (matchesError) {
    return errorResponse("Failed to fetch matches", 500, matchesError);
  }

  const matches = (pendingData ?? []) as { id: string; slack_channel_id: string }[];
  let sent = 0;

  for (const match of matches) {
    const blocks = buildDidYouMeetBlocks(match.id);
    const ok = await postMessage(slackToken, match.slack_channel_id, MEET_REMINDER_FALLBACK, blocks);
    if (ok) sent++;
  }

  return jsonResponse({
    message: "Meet reminders sent",
    round_id: round.id,
    pending_count: matches.length,
    sent,
  });
});
