-- MailPulse schema v1. All times are UTC (timestamptz).
-- Columns ending in _enc hold AES-256-GCM ciphertext; _hash columns hold HMAC-SHA256 blind indexes.

CREATE TABLE owner_account (
    id                  SMALLINT PRIMARY KEY CHECK (id = 1),
    password_hash       TEXT        NOT NULL,
    password_changed_at TIMESTAMPTZ NOT NULL,
    failed_logins       INT         NOT NULL DEFAULT 0,
    locked_until        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL
);

CREATE TABLE api_token (
    id           UUID PRIMARY KEY,
    name         VARCHAR(60) NOT NULL,
    token_hash   BYTEA       NOT NULL UNIQUE,
    token_prefix VARCHAR(12) NOT NULL,
    scope        VARCHAR(20) NOT NULL CHECK (scope IN ('EXTENSION')),
    created_at   TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ
);

CREATE TABLE settings (
    id                       SMALLINT PRIMARY KEY CHECK (id = 1),
    tracking_default         BOOLEAN     NOT NULL DEFAULT TRUE,
    link_tracking_default    BOOLEAN     NOT NULL DEFAULT FALSE,
    send_grace_seconds       INT         NOT NULL DEFAULT 10,
    self_view_window_seconds INT         NOT NULL DEFAULT 30,
    dedupe_window_seconds    INT         NOT NULL DEFAULT 60,
    follow_up_hours          INT         NOT NULL DEFAULT 48,
    spike_opens              INT         NOT NULL DEFAULT 3,
    spike_window_minutes     INT         NOT NULL DEFAULT 60,
    revival_days             INT         NOT NULL DEFAULT 7,
    retention_days           INT         NOT NULL DEFAULT 365,
    ip_mode                  VARCHAR(12) NOT NULL DEFAULT 'TRUNCATED' CHECK (ip_mode IN ('TRUNCATED', 'OFF')),
    count_apple_prefetch     BOOLEAN     NOT NULL DEFAULT FALSE,
    notify_opens             BOOLEAN     NOT NULL DEFAULT TRUE,
    notify_clicks            BOOLEAN     NOT NULL DEFAULT TRUE,
    notify_alerts            BOOLEAN     NOT NULL DEFAULT TRUE,
    time_zone                VARCHAR(64) NOT NULL DEFAULT 'UTC',
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO settings (id) VALUES (1);

CREATE TABLE gmail_account (
    id           UUID PRIMARY KEY,
    address_enc  BYTEA       NOT NULL,
    address_hash BYTEA       NOT NULL UNIQUE,
    created_at   TIMESTAMPTZ NOT NULL
);

CREATE TABLE tracked_email (
    id                     UUID PRIMARY KEY,
    gmail_account_id       UUID        NOT NULL REFERENCES gmail_account (id),
    client_ref             UUID        NOT NULL UNIQUE,
    status                 VARCHAR(12) NOT NULL CHECK (status IN ('DRAFT', 'SENT', 'SCHEDULED', 'CANCELLED')),
    subject_enc            BYTEA,
    track_opens            BOOLEAN     NOT NULL,
    track_links            BOOLEAN     NOT NULL,
    tracking_enabled       BOOLEAN     NOT NULL DEFAULT TRUE,
    notify                 BOOLEAN     NOT NULL DEFAULT TRUE,
    follow_up_hours        INT CHECK (follow_up_hours IN (24, 48, 72)),
    open_status_unreliable BOOLEAN     NOT NULL DEFAULT FALSE,
    gmail_message_id       VARCHAR(64),
    gmail_thread_id        VARCHAR(64),
    created_at             TIMESTAMPTZ NOT NULL,
    sent_at                TIMESTAMPTZ,
    cancelled_at           TIMESTAMPTZ,
    open_count             INT         NOT NULL DEFAULT 0,
    click_count            INT         NOT NULL DEFAULT 0,
    first_opened_at        TIMESTAMPTZ,
    last_opened_at         TIMESTAMPTZ,
    last_clicked_at        TIMESTAMPTZ
);
CREATE INDEX tracked_email_thread_idx ON tracked_email (gmail_account_id, gmail_thread_id);
CREATE INDEX tracked_email_message_idx ON tracked_email (gmail_account_id, gmail_message_id);
CREATE INDEX tracked_email_sent_idx ON tracked_email (sent_at DESC);

CREATE TABLE contact (
    id               UUID PRIMARY KEY,
    address_enc      BYTEA       NOT NULL,
    address_hash     BYTEA       NOT NULL UNIQUE,
    display_name_enc BYTEA,
    first_seen_at    TIMESTAMPTZ NOT NULL,
    last_emailed_at  TIMESTAMPTZ
);

CREATE TABLE recipient (
    id               UUID PRIMARY KEY,
    tracked_email_id UUID       NOT NULL REFERENCES tracked_email (id) ON DELETE CASCADE,
    contact_id       UUID       NOT NULL REFERENCES contact (id),
    kind             VARCHAR(3) NOT NULL CHECK (kind IN ('TO', 'CC', 'BCC')),
    position         SMALLINT   NOT NULL
);
CREATE INDEX recipient_email_idx ON recipient (tracked_email_id);
CREATE INDEX recipient_contact_idx ON recipient (contact_id);

CREATE TABLE tracking_token (
    token            VARCHAR(24) PRIMARY KEY,
    tracked_email_id UUID        NOT NULL REFERENCES tracked_email (id) ON DELETE CASCADE,
    recipient_id     UUID REFERENCES recipient (id) ON DELETE CASCADE,
    kind             VARCHAR(8)  NOT NULL CHECK (kind IN ('PIXEL')),
    created_at       TIMESTAMPTZ NOT NULL
);
CREATE INDEX tracking_token_email_idx ON tracking_token (tracked_email_id);

CREATE TABLE tracked_link (
    id               UUID PRIMARY KEY,
    tracked_email_id UUID        NOT NULL REFERENCES tracked_email (id) ON DELETE CASCADE,
    token            VARCHAR(24) NOT NULL UNIQUE,
    url_enc          BYTEA       NOT NULL,
    url_hash         BYTEA       NOT NULL,
    used             BOOLEAN     NOT NULL DEFAULT TRUE,
    click_count      INT         NOT NULL DEFAULT 0,
    first_clicked_at TIMESTAMPTZ,
    last_clicked_at  TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL,
    UNIQUE (tracked_email_id, url_hash)
);

CREATE TABLE tracking_event (
    id               BIGSERIAL PRIMARY KEY,
    tracked_email_id UUID        NOT NULL REFERENCES tracked_email (id) ON DELETE CASCADE,
    tracked_link_id  UUID REFERENCES tracked_link (id) ON DELETE CASCADE,
    type             VARCHAR(5)  NOT NULL CHECK (type IN ('OPEN', 'CLICK')),
    received_at      TIMESTAMPTZ NOT NULL,
    http_method      VARCHAR(8)  NOT NULL,
    user_agent       VARCHAR(512),
    ip_prefix        VARCHAR(64),
    source           VARCHAR(16) NOT NULL,
    source_key       VARCHAR(80) NOT NULL,
    verdict          VARCHAR(8)  NOT NULL CHECK (verdict IN ('PENDING', 'COUNTED', 'IGNORED')),
    reason           VARCHAR(16),
    decided_at       TIMESTAMPTZ
);
CREATE INDEX tracking_event_email_idx ON tracking_event (tracked_email_id, received_at);
CREATE INDEX tracking_event_pending_idx ON tracking_event (received_at) WHERE verdict = 'PENDING';

CREATE TABLE self_view (
    id               BIGSERIAL PRIMARY KEY,
    tracked_email_id UUID        NOT NULL REFERENCES tracked_email (id) ON DELETE CASCADE,
    received_at      TIMESTAMPTZ NOT NULL,
    context          VARCHAR(8)  NOT NULL CHECK (context IN ('THREAD', 'COMPOSE', 'OTHER'))
);
CREATE INDEX self_view_email_idx ON self_view (tracked_email_id, received_at);

CREATE TABLE activity (
    id               BIGSERIAL PRIMARY KEY,
    kind             VARCHAR(8)  NOT NULL CHECK (kind IN ('OPEN', 'CLICK', 'ALERT')),
    tracked_email_id UUID        NOT NULL REFERENCES tracked_email (id) ON DELETE CASCADE,
    event_id         BIGINT REFERENCES tracking_event (id) ON DELETE CASCADE,
    created_at       TIMESTAMPTZ NOT NULL
);
CREATE INDEX activity_email_idx ON activity (tracked_email_id);
