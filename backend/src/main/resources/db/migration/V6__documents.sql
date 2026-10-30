-- v2 Part D (docs/v2-contract.md, Documents): PDFs shared as tracked links. File contents, names and labels
-- are AES-256-GCM ciphertext (_enc), like the other sensitive columns. A link belongs to one email ("Insert
-- tracked file") or to none (a share link with a label). Views come from the viewer's heartbeats and are
-- decided at once (no self-view hold), so the feed and notifications get them within seconds.
CREATE TABLE document (
    id         UUID PRIMARY KEY,
    name_enc   BYTEA       NOT NULL,
    size_bytes INT         NOT NULL CHECK (size_bytes > 0),
    page_count INT CHECK (page_count > 0),
    version    INT         NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

-- Only the latest version is kept: a new version replaces the file and every existing link serves it.
CREATE TABLE document_file (
    document_id UUID PRIMARY KEY REFERENCES document (id) ON DELETE CASCADE,
    version     INT   NOT NULL,
    content_enc BYTEA NOT NULL
);

CREATE TABLE document_link (
    id               UUID PRIMARY KEY,
    document_id      UUID        NOT NULL REFERENCES document (id) ON DELETE CASCADE,
    token            VARCHAR(24) NOT NULL UNIQUE,
    tracked_email_id UUID REFERENCES tracked_email (id) ON DELETE CASCADE,
    label_enc        BYTEA,
    allow_download   BOOLEAN     NOT NULL DEFAULT TRUE,
    expires_at       TIMESTAMPTZ,
    revoked_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL
);
CREATE INDEX document_link_document_idx ON document_link (document_id, created_at);
CREATE INDEX document_link_email_idx ON document_link (tracked_email_id, document_id);

-- One row per viewer page load (viewId). A new page from the same reader within the duplicate window joins
-- the earlier view (merged_into), so a reload adds its reading time there instead of counting a second view.
-- own_ms is the time accepted from this viewId (the wall-clock guard); visible_ms the view's total.
CREATE TABLE document_view (
    id            BIGSERIAL PRIMARY KEY,
    link_id       UUID        NOT NULL REFERENCES document_link (id) ON DELETE CASCADE,
    view_uuid     UUID        NOT NULL,
    merged_into   BIGINT REFERENCES document_view (id) ON DELETE CASCADE,
    source_key    VARCHAR(80) NOT NULL,
    counted       BOOLEAN     NOT NULL,
    first_beat_at TIMESTAMPTZ NOT NULL,
    last_beat_at  TIMESTAMPTZ NOT NULL,
    own_ms        BIGINT      NOT NULL DEFAULT 0 CHECK (own_ms >= 0),
    visible_ms    BIGINT      NOT NULL DEFAULT 0 CHECK (visible_ms >= 0),
    pages_viewed  INT[]       NOT NULL DEFAULT '{}',
    page_count    INT,
    read_at       TIMESTAMPTZ,
    UNIQUE (link_id, view_uuid)
);
CREATE INDEX document_view_recent_idx ON document_view (link_id, source_key, last_beat_at) WHERE merged_into IS NULL;

-- seq_number: for a counted view and its read, the n-th counted view of the link; for a counted download, the
-- n-th counted download. seq_previous_at: when the one before it happened (repeat-notification setting).
CREATE TABLE document_event (
    id              BIGSERIAL PRIMARY KEY,
    link_id         UUID        NOT NULL REFERENCES document_link (id) ON DELETE CASCADE,
    view_id         BIGINT REFERENCES document_view (id) ON DELETE CASCADE,
    type            VARCHAR(12) NOT NULL CHECK (type IN ('DOC_VIEW', 'DOC_READ', 'DOC_DOWNLOAD')),
    received_at     TIMESTAMPTZ NOT NULL,
    http_method     VARCHAR(8)  NOT NULL,
    user_agent      VARCHAR(512),
    ip_prefix       VARCHAR(64),
    source          VARCHAR(16) NOT NULL,
    source_key      VARCHAR(80) NOT NULL,
    verdict         VARCHAR(8)  NOT NULL CHECK (verdict IN ('COUNTED', 'IGNORED')),
    reason          VARCHAR(16),
    seq_number      INT,
    seq_previous_at TIMESTAMPTZ
);
CREATE INDEX document_event_link_idx ON document_event (link_id, received_at);
CREATE INDEX document_event_view_idx ON document_event (view_id) WHERE view_id IS NOT NULL;

-- Document events and DOC_VIEWS alerts reach the feed and notifications; a share link has no email.
ALTER TABLE activity DROP CONSTRAINT activity_kind_check;
ALTER TABLE activity ALTER COLUMN kind TYPE VARCHAR(12);
ALTER TABLE activity ADD CONSTRAINT activity_kind_check
    CHECK (kind IN ('OPEN', 'CLICK', 'ALERT', 'DOC_VIEW', 'DOC_READ', 'DOC_DOWNLOAD'));
ALTER TABLE activity ALTER COLUMN tracked_email_id DROP NOT NULL;
ALTER TABLE activity ADD COLUMN document_event_id BIGINT REFERENCES document_event (id) ON DELETE CASCADE;
CREATE INDEX activity_document_event_idx ON activity (document_event_id) WHERE document_event_id IS NOT NULL;

ALTER TABLE alert DROP CONSTRAINT alert_type_check;
ALTER TABLE alert ADD CONSTRAINT alert_type_check CHECK (type IN ('FOLLOW_UP', 'OPEN_SPIKE', 'REVIVAL', 'DOC_VIEWS'));
ALTER TABLE alert ALTER COLUMN tracked_email_id DROP NOT NULL;
ALTER TABLE alert ADD COLUMN document_link_id UUID REFERENCES document_link (id) ON DELETE CASCADE;
ALTER TABLE alert ADD CONSTRAINT alert_about_check CHECK (tracked_email_id IS NOT NULL OR document_link_id IS NOT NULL);
CREATE INDEX alert_document_link_idx ON alert (document_link_id) WHERE document_link_id IS NOT NULL;
