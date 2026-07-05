CREATE TABLE IF NOT EXISTS "referral_review_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "referral_attribution_id" uuid NOT NULL,
  "decision" text NOT NULL,
  "reason_code" text NOT NULL,
  "notes" text,
  "actor_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "referral_review_decision_valid"
    CHECK ("decision" IN ('PENDING', 'QUALIFIED', 'REJECTED', 'HELD')),
  CONSTRAINT "referral_review_reason_valid"
    CHECK ("reason_code" ~ '^[A-Z][A-Z0-9_]{2,49}$'),
  CONSTRAINT "referral_review_attribution_fk"
    FOREIGN KEY ("referral_attribution_id")
    REFERENCES "public"."referral_attributions"("id"),
  CONSTRAINT "referral_review_actor_fk"
    FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id")
);

CREATE INDEX IF NOT EXISTS "referral_review_history"
  ON "referral_review_events" USING btree ("referral_attribution_id", "created_at");

CREATE OR REPLACE FUNCTION prevent_referral_review_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'referral_review_events are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "referral_review_events_append_only" ON "referral_review_events";
CREATE TRIGGER "referral_review_events_append_only"
BEFORE UPDATE OR DELETE ON "referral_review_events"
FOR EACH ROW EXECUTE FUNCTION prevent_referral_review_event_mutation();
