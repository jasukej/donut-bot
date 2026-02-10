/** 
 * Webhook receiver for slack events ie button clicks.
*/

import { supabase, verifySlackSignature } from "@shared";
import { serve, jsonResponse, errorResponse, requireEnv } from "@shared/handler";
import {
  ACTION_DID_YOU_MEET_YES,
  ACTION_DID_YOU_MEET_NO,
  RESPONSE_YES,
  RESPONSE_NO,
} from "@shared/messages";

interface BlockAction {
  action_id: string;
  value?: string;
}

interface InteractivityPayload {
  type: string;
  actions?: BlockAction[];
  response_url?: string;
}

serve(async (req) => {
  const signingSecret = requireEnv("SLACK_SIGNING_SECRET");
  if (signingSecret instanceof Response) return signingSecret;

  const signature = req.headers.get("x-slack-signature");
  const timestamp = req.headers.get("x-slack-request-timestamp");
  const rawBody = await req.text();

  const isValid = await verifySlackSignature(rawBody, signature, timestamp, signingSecret);
  if (!isValid) return jsonResponse({ error: "Invalid signature" }, 401);

  const payloadStr = new URLSearchParams(rawBody).get("payload");
  if (!payloadStr) return jsonResponse({ error: "Missing payload" }, 400);

  let payload: InteractivityPayload;
  try {
    payload = JSON.parse(payloadStr) as InteractivityPayload;
  } catch {
    return jsonResponse({ error: "Invalid payload" }, 400);
  }

  if (payload.type !== "block_actions" || !payload.actions?.length) {
    return new Response(null, { status: 200 });
  }

  const action = payload.actions.find(
    (a) => a.action_id === ACTION_DID_YOU_MEET_YES || a.action_id === ACTION_DID_YOU_MEET_NO
  );

  if (!action?.value) return new Response(null, { status: 200 });

  const matchId = action.value;
  const isYes = action.action_id === ACTION_DID_YOU_MEET_YES;
  const metStatus = isYes ? "yes" : "no";

  const { error } = await supabase
    .from("matches")
    .update({ met_status: metStatus, updated_at: new Date().toISOString() })
    .eq("id", matchId);

  if (error) console.error("Failed to update match:", error);

  if (payload.response_url) {
    await fetch(payload.response_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        replace_original: true,
        text: isYes ? RESPONSE_YES : RESPONSE_NO,
      }),
    });
  }

  return new Response(null, { status: 200 });
});
