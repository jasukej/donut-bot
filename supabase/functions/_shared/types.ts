/**
 * Database and API types for Donut bot.
 * Mirrors the schema in supabase/migrations/001_initial_schema.sql
 */

export type MetStatus = "pending" | "yes" | "no";

export interface User {
  slack_user_id: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Round {
  id: string;
  round_date: string;
  status: string;
  created_at: string;
}

export interface Match {
  id: string;
  round_id: string;
  slack_channel_id: string | null;
  participant_ids: string[];
  matched_at: string;
  met_status: MetStatus;
  created_at: string;
  updated_at: string;
}

export interface Config {
  key: string;
  value: unknown;
}

export interface UserAvoidList {
  user_id: string;
  avoid_user_id: string;
  created_at: string;
}

// Query result types
export type RoundIdResult = Pick<Round, "id">;
export type MatchIdResult = Pick<Match, "id">;
export type RoundWithDate = Pick<Round, "id" | "round_date">;
export type ConfigValue = Pick<Config, "value">;
export type MatchMetStatus = Pick<Match, "met_status">;

// RPC return types
export interface ComputeMatchGroup {
  user_ids: string[];
  match_type: string;
}

// Insert payload
export interface MatchInsert {
  round_id: string;
  participant_ids: string[];
  met_status: MetStatus;
}
