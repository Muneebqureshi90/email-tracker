-- Phase 5: alerts (follow-up, open spike, revival). An alert also becomes an activity item, so it
-- reaches desktop notifications and the live dashboard like opens and clicks do.
CREATE TABLE alert (
    id               UUID PRIMARY KEY,
    type             VARCHAR(12) NOT NULL CHECK (type IN ('FOLLOW_UP', 'OPEN_SPIKE', 'REVIVAL')),
    tracked_email_id UUID        NOT NULL REFERENCES tracked_email (id) ON DELETE CASCADE,
    created_at       TIMESTAMPTZ NOT NULL,
    status           VARCHAR(10) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'SEEN', 'DISMISSED', 'SNOOZED')),
    snoozed_until    TIMESTAMPTZ,
    details          JSONB       NOT NULL DEFAULT '{}'
);
CREATE INDEX alert_email_idx ON alert (tracked_email_id, type, created_at);
CREATE INDEX alert_status_idx ON alert (status, created_at DESC);

ALTER TABLE activity ADD COLUMN alert_id UUID REFERENCES alert (id) ON DELETE CASCADE;
