# PMC Donut Bot
A Slack bot that facilitates weekly donuts in your workspace's specified channel. Existing free marketplace solutions are capped at ~20 members at a time, hence the need. 

Members of the channel are automatically synced each round; members can join the channel to be eligible and leave to opt out.

## We used
- Supabase: Edge Functions (Deno), PSQL, pg_cron
- Slack web API

## Setup & Deploy

### 1. Create Slack App

Go to [api.slack.com/apps](https://api.slack.com/apps) > **Create New App** > **From a manifest**. Paste the contents of [`docs/sample_manifest.json`](docs/sample_manifest.json), replacing `YOUR_PROJECT_REF` with your Supabase project ref. This configures the required scopes (`chat:write`, `mpim:write`, `users:read`, `channels:read`, `groups:read`) and interactivity URL automatically.

> **Private channels**: The bot must be invited to the channel (`/invite @Donut Bot`) to access its member list.

After creating, install the app to your workspace. Copy the **Bot User OAuth Token** (`xoxb-...`) and **Signing Secret** from the app's Basic Information page.

### 2. Prerequisites
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed
- A Supabase project with **pg_cron** and **pg_net** enabled (Dashboard > Database > Extensions)

### 3. Link & push schema
Project ref can be found under Dashboard > Project Settings > General Settings.
```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

### 4. Set Vault secrets (SQL Editor)
Used by `pg_cron` to call Edge Functions. Get the publishable key from Dashboard > Project Settings > API.
```sql
SELECT vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
SELECT vault.create_secret('YOUR_PUBLISHABLE_KEY', 'pub_key');
```

### 5. Set Edge Function secrets
```bash
supabase secrets set SLACK_BOT_TOKEN=xoxb-your-bot-token
supabase secrets set SLACK_SIGNING_SECRET=your-signing-secret
```

### 6. Configure channel
Get the channel ID: right-click `#chosen-channel` in Slack > **View channel details** > copy the ID at the bottom.
```sql
UPDATE config SET value = '"C_YOUR_CHANNEL_ID"'::jsonb WHERE key = 'round_channel_id';
```

### 7. Deploy functions
```bash
supabase functions deploy create-pairs post-reminder weekly-summary slack-events
```

### 8. Test
Trigger a manual run to verify the full flow (sync users from channel, create matches, send DMs):
```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/create-pairs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_PUBLISHABLE_KEY"
```

Then test the reminder:
```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/post-reminder \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_PUBLISHABLE_KEY"
```

Check `users` and `matches` in Dashboard > Table Editor. Click a Yes/No button in Slack and confirm `matches.met_status` updates.

## Configuration

`pg_cron` calls the Edge Functions on the following schedule:

| Function | Cron | When |
|----------|------|------|
| `create-pairs` | `0 9 * * 1` | Mondays 09:00 UTC -- syncs users, creates pairings, opens group DMs |
| `post-reminder` | `0 17 * * 0` | Sundays 17:00 UTC -- sends "did you meet?" message |
| `weekly-summary` | `0 17 * * 5` | Fridays 17:00 UTC -- posts stats to channel |

### Changing the schedule

To change how often pairings happen, run the following in the SQL Editor. Replace the cron expression with your desired frequency.

**Common presets:**

| Frequency | Cron expression |
|-----------|----------------|
| Every Monday 9am UTC | `0 9 * * 1` |
| Every other Monday 9am UTC | `0 9 1-7,15-21 * 1` |
| First Monday of each month | `0 9 1-7 * 1` |
| Every weekday 9am UTC | `0 9 * * 1-5` |

```sql
-- 1. Update stored frequency
UPDATE config SET value = '"0 9 * * 1"'::jsonb WHERE key = 'frequency';

-- 2. Replace the cron job
SELECT cron.unschedule('donut-create-pairs');
SELECT cron.schedule(
  'donut-create-pairs',
  (SELECT value #>> '{}' FROM config WHERE key = 'frequency'),
  $$ SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/create-pairs',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pub_key')),
    body    := '{}'::jsonb
  ) AS request_id; $$
);
```

You can verify the current schedule with:
```sql
SELECT jobname, schedule FROM cron.job WHERE jobname LIKE 'donut-%';
```

## Optional: Avoid List

To prevent specific users from being paired:
```sql
INSERT INTO user_avoid_list (user_id, avoid_user_id) VALUES ('U01234567', 'U07654321');
```
A client-side interface for this is still a WIP.

## Local Development
Docker Desktop is needed to spin up dependencies locally.
```bash
supabase start
supabase functions serve
```

Lint by running `deno lint`.
