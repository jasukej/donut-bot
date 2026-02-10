-- add interval-based pairing (freq in days).
-- create-pairs checks this value and skips if not enough days have passed.
INSERT INTO config (key, value) VALUES ('pairing_interval_days', '7'::jsonb)
ON CONFLICT (key) DO NOTHING;
