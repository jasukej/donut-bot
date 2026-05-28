/** 
 * Posts a reminder to pending matches from the latest round. 
 * Collects data on no. of pairs that have met to post in weekly summary. *
 */

import { supabase, postMessage } from "@shared";
import { serve, jsonResponse, errorResponse, requireEnv } from "@shared/handler";
import {
  buildDidYouMeetBlocks,
  buildMidpointNudgeBlocks,
  MEET_REMINDER_FALLBACK,
  MIDPOINT_REMINDER_FALLBACK,
} from "@shared/messages";
import type { ConfigValue } from "@shared";

serve(async () => {
  const slackToken = requireEnv("SLACK_BOT_TOKEN");
  if (slackToken instanceof Response) return slackToken;

  const { data: latestRound, error: roundError } = await supabase
    .from("rounds")
    .select("id, round_date")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (roundError || !latestRound) {
    return jsonResponse({ message: "No rounds found" });
  }

  const round = latestRound as { id: string; round_date: string };

  const { data: intervalRow } = await supabase
    .from("config")
    .select("value")
    .eq("key", "pairing_interval_days")
    .single();

  const intervalDays = parseIntervalDays((intervalRow as ConfigValue | null)?.value);
  const midpointDay = Math.max(1, Math.floor(intervalDays / 2));
  const daysSinceRound = Math.floor(
    (Date.now() - new Date(round.round_date).getTime()) / 86_400_000,
  );

  const { data: pendingData, error: matchesError } = await supabase
    .from("matches")
    .select("id, slack_channel_id, participant_ids, midpoint_reminder_sent_at, final_reminder_sent_at")
    .eq("round_id", round.id)
    .eq("met_status", "pending")
    .not("slack_channel_id", "is", null);

  if (matchesError) {
    return errorResponse("Failed to fetch matches", 500, matchesError);
  }

  type PendingMatch = {
    id: string;
    slack_channel_id: string;
    participant_ids: string[];
    midpoint_reminder_sent_at: string | null;
    final_reminder_sent_at: string | null;
  };

  const matches = (pendingData ?? []) as PendingMatch[];
  let midpointSent = 0;
  let finalSent = 0;

  for (const match of matches) {
    const shouldSendMidpoint = daysSinceRound >= midpointDay &&
      match.midpoint_reminder_sent_at === null &&
      daysSinceRound < intervalDays;
    const shouldSendFinal = daysSinceRound >= intervalDays &&
      match.final_reminder_sent_at === null;

    if (shouldSendMidpoint) {
      const assigned = pickRandom(match.participant_ids);
      const blocks = buildMidpointNudgeBlocks(assigned);
      const ok = await postMessage(
        slackToken,
        match.slack_channel_id,
        MIDPOINT_REMINDER_FALLBACK,
        blocks,
      );
      if (ok) {
        midpointSent++;
        await supabase
          .from("matches")
          .update({ midpoint_reminder_sent_at: new Date().toISOString() })
          .eq("id", match.id);
      }
      continue;
    }

    if (shouldSendFinal) {
      const blocks = buildDidYouMeetBlocks(match.id);
      const ok = await postMessage(slackToken, match.slack_channel_id, MEET_REMINDER_FALLBACK, blocks);
      if (ok) {
        finalSent++;
        await supabase
          .from("matches")
          .update({ final_reminder_sent_at: new Date().toISOString() })
          .eq("id", match.id);
      }
    }
  }

  return jsonResponse({
    message: "Reminders processed",
    round_id: round.id,
    interval_days: intervalDays,
    days_since_round: daysSinceRound,
    pending_count: matches.length,
    midpoint_sent: midpointSent,
    final_sent: finalSent,
  });
});

function parseIntervalDays(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
    return Math.floor(value);
  }

  if (typeof value === "string") {
    const unquoted = value.replace(/^"|"$/g, "").trim();
    const parsed = Number(unquoted);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.floor(parsed);
    }
  }

  return 7;
}

function pickRandom(userIds: string[]): string {
  if (!userIds || userIds.length === 0) return "";
  const idx = Math.floor(Math.random() * userIds.length);
  return userIds[idx];
}
