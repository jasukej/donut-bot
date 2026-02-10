/**
 * All Slack message templates and block kit payloads.
 * 
 * 1. Match intro message 
 * 2. Meet reminder message
 * 3. Did you meet? message
 * 4. Weekly summary text
 */

export const MATCH_INTRO =
  "You've been matched for a donut! Schedule a time to meet :)";

export const MEET_REMINDER_FALLBACK =
  "Reminder: Did you have your coffee chat this week?";

export function buildDidYouMeetBlocks(
  matchId: string,
  introText = "Were you able to meet this week?"
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
          text: { type: "plain_text", text: "Yes", emoji: true },
          value: matchId,
        },
        {
          type: "button",
          action_id: "did_you_meet_no",
          text: { type: "plain_text", text: "No", emoji: true },
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
  return [
    "This week's donut dates:",
    `_Round ${roundDate}_`,
    "",
    `${counts.met} out of ${counts.total} met. Let's get that to 100% this week!`,
  ].join("\n");
}

// action ids & responses

export const ACTION_DID_YOU_MEET_YES = "did_you_meet_yes";
export const ACTION_DID_YOU_MEET_NO = "did_you_meet_no";

export const RESPONSE_YES = "Awesome to hear! Hope you had fun :)";
export const RESPONSE_NO = "Aw, always a next time!";
