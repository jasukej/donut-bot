/**
 * All Slack message templates and block kit payloads.
 * 
 * 1. Match intro message 
 * 2. Meet reminder message
 * 3. Did you meet? message
 * 4. Weekly summary text
 */

export const MATCH_INTRO =
  "🍩 *You have been matched for a donut!* Pick a time soon and make it happen :sparkles:";

export const MIDPOINT_REMINDER_FALLBACK =
  "⏰ Midpoint check-in: have you scheduled your donut yet?";

export const MEET_REMINDER_FALLBACK =
  "☕ Quick check-in: did you have your donut chat?";

export function buildMidpointNudgeBlocks(
  assignedUserId: string
): Record<string, unknown>[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          "⏰ *Midpoint check-in!* Have you scheduled your donut yet?\n" +
          `If not, <@${assignedUserId}>, you have been randomly assigned to schedule a time this round. :calendar:`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Suggestion: Drop 2-3 time options so it is easy to lock in a slot.",
        },
      ],
    },
  ];
}

export function buildDidYouMeetBlocks(
  matchId: string,
  introText = "☕ *Were you able to meet this round?*"
): Record<string, unknown>[] {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: introText },
    },
    {
      type: "actions",
      block_id: "did_you_meet_block",
      elements: [
        {
          type: "button",
          action_id: "did_you_meet_yes",
          text: { type: "plain_text", text: "Yes, we met! 🎉", emoji: true },
          value: matchId,
          style: "primary",
        },
        {
          type: "button",
          action_id: "did_you_meet_no",
          text: { type: "plain_text", text: "Not yet", emoji: true },
          value: matchId,
        },
      ],
    },
  ];
}

export interface SummaryCounts {
  met: number;
  not_met: number;
  pending: number;
  total: number;
}

export function buildSummaryText(roundDate: string, counts: SummaryCounts): string {
  const completion = counts.total > 0
    ? Math.round((counts.met / counts.total) * 100)
    : 0;

  return [
    "📊 *Donut round recap*",
    `_${roundDate}_`,
    "",
    `✅ Met: *${counts.met}*`,
    `⏳ Pending: *${counts.pending}*`,
    `❌ Not met: *${counts.not_met}*`,
    `🏁 Completion: *${completion}%* (${counts.met}/${counts.total})`,
  ].join("\n");
}

// action ids & responses

export const ACTION_DID_YOU_MEET_YES = "did_you_meet_yes";
export const ACTION_DID_YOU_MEET_NO = "did_you_meet_no";

export const RESPONSE_YES = "Amazing! 🎉 Love to hear it.";
export const RESPONSE_NO = "No worries - there is always next round 💪";
