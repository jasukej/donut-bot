/** 
 * Creates pairings, opens Slack group DMs, sends intro message.
 * Called by pg_cron schedule.
 */

import { supabase, openMPIM, postMessage, getChannelMembers, getUserInfo } from "@shared";
import { serve, jsonResponse, errorResponse, requireEnv } from "@shared/handler";
import { MATCH_INTRO } from "@shared/messages";
import type { RoundIdResult, MatchIdResult, ComputeMatchGroup, ConfigValue } from "@shared";

serve(async () => {
  const slackToken = requireEnv("SLACK_BOT_TOKEN");
  if (slackToken instanceof Response) return slackToken;

  // check if enough time has passed since last round before writing to db
  const { data: intervalRow } = await supabase
    .from("config")
    .select("value")
    .eq("key", "pairing_interval_days")
    .single();

  const intervalDays = intervalRow ? Number((intervalRow as ConfigValue).value) : 7;

  const { data: lastRound } = await supabase
    .from("rounds")
    .select("round_date")
    .order("round_date", { ascending: false })
    .limit(1)
    .single();

  if (lastRound) {
    const lastDate = new Date((lastRound as { round_date: string }).round_date);
    const daysSince = Math.floor((Date.now() - lastDate.getTime()) / 86_400_000);
    if (daysSince < intervalDays - 1) {
      return jsonResponse({
        message: "Skipping — not yet time for next round",
        days_since_last: daysSince,
        interval_days: intervalDays,
      });
    }
  }

  const { data: configRow } = await supabase
    .from("config")
    .select("value")
    .eq("key", "round_channel_id")
    .single();

  const channelId = (configRow as ConfigValue | null)?.value
    ? String((configRow as ConfigValue).value).replace(/^"|"$/g, "")
    : null;

  if (!channelId) {
    return errorResponse("round_channel_id not configured in config table");
  }

  // Before matching, syncs /users with any members who have newly joined or left
  const memberIds = await getChannelMembers(slackToken, channelId);
  if (memberIds.length === 0) {
    return errorResponse("No members found in channel");
  }

  const humanMembers: { id: string; display_name: string }[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const uid of memberIds) {
    const info = await getUserInfo(slackToken, uid);
    if (!info) {
      skipped.push({ id: uid, reason: "users.info failed" });
    } else if (info.is_bot) {
      skipped.push({ id: uid, reason: "bot" });
    } else {
      humanMembers.push({ id: info.id, display_name: info.display_name });
    }
  }

  if (humanMembers.length < 2) {
    return jsonResponse({
      error: "Not enough humans to match",
      channel_members: memberIds.length,
      humans: humanMembers.length,
      skipped,
    }, 400);
  }

  for (const member of humanMembers) {
    const { error: upsertError } = await supabase.from("users").upsert(
      { slack_user_id: member.id, display_name: member.display_name, is_active: true },
      { onConflict: "slack_user_id" }
    );
    if (upsertError) console.error("Upsert failed for", member.id, upsertError);
  }

  const activeIds = humanMembers.map((m) => m.id);
  const { data: allUsers } = await supabase.from("users").select("slack_user_id").eq("is_active", true);
  const currentUsers = (allUsers ?? []) as { slack_user_id: string }[];
  for (const u of currentUsers) {
    if (!activeIds.includes(u.slack_user_id)) {
      await supabase.from("users").update({ is_active: false }).eq("slack_user_id", u.slack_user_id);
    }
  }

  const { data: roundData, error: roundError } = await supabase
    .from("rounds")
    .insert({ status: "active" })
    .select("id")
    .single();

  if (roundError || !roundData) {
    return errorResponse("Failed to create round", 500, roundError);
  }

  const roundId = (roundData as RoundIdResult).id;

  /**
  * Calls a procedure to compute matches and store them under /matches
  * Greedily matches pairs based on last matched date and avoids users in the ban list
  */
  const { data: matchesData, error: matchesError } = await supabase.rpc(
    "compute_coffee_chat_matches",
    { p_round_id: roundId }
  );

  if (matchesError) {
    return errorResponse("Matching failed", 500, matchesError);
  }

  const groups = (matchesData ?? []) as ComputeMatchGroup[];
  if (groups.length === 0) {
    return jsonResponse({ message: "No matches this round", round_id: roundId });
  }

  for (const group of groups) {
    const participantIds = group.user_ids;
    if (!participantIds || participantIds.length < 2) continue;

    const { data: matchData, error: matchInsertError } = await supabase
      .from("matches")
      .insert({ round_id: roundId, participant_ids: participantIds, met_status: "pending" })
      .select("id")
      .single();

    if (matchInsertError || !matchData) {
      console.error("Failed to insert match:", matchInsertError);
      continue;
    }

    const matchId = (matchData as MatchIdResult).id;

    const mpimId = await openMPIM(slackToken, participantIds);
    if (!mpimId) {
      console.error("Failed to open MPIM for:", participantIds);
      continue;
    }

    await supabase.from("matches").update({ slack_channel_id: mpimId }).eq("id", matchId);
    await postMessage(slackToken, mpimId, MATCH_INTRO);
  }

  return jsonResponse({ message: "Matches created", round_id: roundId, groups_count: groups.length });
});
