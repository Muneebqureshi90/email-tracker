-- "PC was off" detection: the backend saves a heartbeat every minute. When the previous heartbeat is more than
-- three minutes old (at startup or on a beat), MailPulse was not running in between, so opens then were not
-- recorded: that gap is kept as a downtime window for 90 days.
CREATE TABLE heartbeat (
    id        SMALLINT PRIMARY KEY CHECK (id = 1),
    last_seen TIMESTAMPTZ NOT NULL
);

CREATE TABLE downtime_window (
    id         BIGSERIAL PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at   TIMESTAMPTZ NOT NULL CHECK (ended_at >= started_at)
);
CREATE INDEX downtime_window_ended_idx ON downtime_window (ended_at);
