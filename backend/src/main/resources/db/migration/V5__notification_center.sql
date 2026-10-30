-- v2: the dashboard's notification center remembers how far the owner has read (one row).
CREATE TABLE notification_state (
    id           SMALLINT PRIMARY KEY CHECK (id = 1),
    last_read_id BIGINT      NOT NULL DEFAULT 0 CHECK (last_read_id >= 0),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO notification_state (id) VALUES (1);
