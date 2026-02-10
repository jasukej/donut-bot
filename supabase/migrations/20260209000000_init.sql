CREATE TYPE met_status AS ENUM ('pending', 'yes', 'no');

CREATE TABLE users (
  slack_user_id  TEXT PRIMARY KEY,
  display_name   TEXT        NOT NULL,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rounds (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_date DATE        NOT NULL DEFAULT current_date,
  status     TEXT        NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE matches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id        UUID        NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  slack_channel_id TEXT,
  participant_ids TEXT[]      NOT NULL,
  matched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  met_status      met_status  NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT matches_min_participants CHECK (array_length(participant_ids, 1) >= 2)
);

CREATE INDEX idx_matches_round_id        ON matches(round_id);
CREATE INDEX idx_matches_participant_ids  ON matches USING GIN(participant_ids);

CREATE TABLE config (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

INSERT INTO config (key, value) VALUES
  ('frequency',        '"0 9 * * 1"'::jsonb),
  ('round_channel_id', '""'::jsonb);

CREATE TABLE user_avoid_list (
  user_id       TEXT NOT NULL REFERENCES users(slack_user_id) ON DELETE CASCADE,
  avoid_user_id TEXT NOT NULL REFERENCES users(slack_user_id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, avoid_user_id),
  CONSTRAINT no_self_avoid CHECK (user_id != avoid_user_id)
);

CREATE INDEX idx_avoid_user    ON user_avoid_list(user_id);
CREATE INDEX idx_avoid_target  ON user_avoid_list(avoid_user_id);

-- row-level security
ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds          ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches         ENABLE ROW LEVEL SECURITY;
ALTER TABLE config          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_avoid_list ENABLE ROW LEVEL SECURITY;

-- least recently matched pairing function
CREATE OR REPLACE FUNCTION compute_coffee_chat_matches(p_round_id UUID)
RETURNS TABLE(user_ids TEXT[], match_type TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_pool        TEXT[];
  v_best_pair   RECORD;
  v_u1          TEXT;
  v_u2          TEXT;
  v_odd_one     TEXT;
  v_result      RECORD;
  v_last_row_id INT;
BEGIN
  SELECT ARRAY_AGG(slack_user_id ORDER BY slack_user_id)
    INTO v_pool
    FROM users WHERE is_active = true;

  IF v_pool IS NULL OR array_length(v_pool, 1) < 2 THEN RETURN; END IF;

  CREATE TEMP TABLE _match_results (
    row_id          SERIAL PRIMARY KEY,
    participant_ids TEXT[] NOT NULL,
    match_type      TEXT   NOT NULL
  );

  LOOP
    EXIT WHEN v_pool IS NULL OR array_length(v_pool, 1) < 2;

    SELECT ep.u1, ep.u2 INTO v_best_pair
    FROM (
      SELECT
        u1.slack_user_id AS u1,
        u2.slack_user_id AS u2,
        COALESCE(
          (SELECT MAX(m.matched_at) FROM matches m
           WHERE m.participant_ids @> ARRAY[u1.slack_user_id, u2.slack_user_id]
              OR m.participant_ids @> ARRAY[u2.slack_user_id, u1.slack_user_id]),
          '1970-01-01'::timestamptz
        ) AS last_matched_at
      FROM users u1 CROSS JOIN users u2
      WHERE u1.slack_user_id < u2.slack_user_id
        AND u1.is_active AND u2.is_active
        AND u1.slack_user_id = ANY(v_pool)
        AND u2.slack_user_id = ANY(v_pool)
        AND NOT EXISTS (
          SELECT 1 FROM user_avoid_list a
          WHERE (a.user_id = u1.slack_user_id AND a.avoid_user_id = u2.slack_user_id)
             OR (a.user_id = u2.slack_user_id AND a.avoid_user_id = u1.slack_user_id)
        )
    ) ep ORDER BY ep.last_matched_at ASC LIMIT 1;

    EXIT WHEN v_best_pair IS NULL;

    v_u1 := v_best_pair.u1;
    v_u2 := v_best_pair.u2;

    INSERT INTO _match_results (participant_ids, match_type)
    VALUES (ARRAY[v_u1, v_u2], 'pair');

    v_pool := array_remove(array_remove(v_pool, v_u1), v_u2);
  END LOOP;

  -- if one user remains, add to last pair to form a tri
  IF v_pool IS NOT NULL AND array_length(v_pool, 1) = 1 THEN
    v_odd_one := v_pool[1];
    SELECT row_id INTO v_last_row_id FROM _match_results ORDER BY row_id DESC LIMIT 1;
    IF v_last_row_id IS NOT NULL THEN
      UPDATE _match_results
        SET participant_ids = participant_ids || v_odd_one, match_type = 'trio'
        WHERE row_id = v_last_row_id;
    END IF;
  END IF;

  FOR v_result IN SELECT mr.participant_ids, mr.match_type FROM _match_results mr ORDER BY mr.row_id
  LOOP
    user_ids   := v_result.participant_ids;
    match_type := v_result.match_type;
    RETURN NEXT;
  END LOOP;

  DROP TABLE _match_results;
END;
$$;

-- pg_cron + pg_net (extensions + schedules)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- create-pairs
SELECT cron.schedule(
  'donut-create-pairs', '0 9 * * 1',
  $$ SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/create-pairs',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pub_key')),
    body    := '{}'::jsonb
  ) AS request_id; $$
);

-- post-reminder
SELECT cron.schedule(
  'donut-post-reminder', '0 17 * * 0',
  $$ SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/post-reminder',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pub_key')),
    body    := '{}'::jsonb
  ) AS request_id; $$
);

-- weekly-summary
SELECT cron.schedule(
  'donut-weekly-summary', '0 17 * * 5',
  $$ SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/weekly-summary',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pub_key')),
    body    := '{}'::jsonb
  ) AS request_id; $$
);
