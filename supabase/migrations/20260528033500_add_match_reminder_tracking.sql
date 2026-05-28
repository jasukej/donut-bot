ALTER TABLE matches
ADD COLUMN IF NOT EXISTS midpoint_reminder_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS final_reminder_sent_at TIMESTAMPTZ;
