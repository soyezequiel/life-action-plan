CREATE TABLE IF NOT EXISTS "interactive_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "status" text NOT NULL,
  "current_pause_id" text,
  "runtime_snapshot" jsonb NOT NULL,
  "user_id" text,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL,
  "expires_at" text NOT NULL,
  CONSTRAINT "interactive_sessions_status_check" CHECK ("interactive_sessions"."status" IN ('active', 'completed', 'abandoned', 'error'))
);

CREATE INDEX IF NOT EXISTS "interactive_sessions_status_idx"
  ON "interactive_sessions" ("status");

CREATE INDEX IF NOT EXISTS "interactive_sessions_expires_at_idx"
  ON "interactive_sessions" ("expires_at");

CREATE INDEX IF NOT EXISTS "interactive_sessions_user_id_idx"
  ON "interactive_sessions" ("user_id");
