-- v2 (docs/v2-contract.md): notification, quiet-hours and document settings; the time-zone source
-- (an existing UTC row is the untouched default, any other zone was chosen by the owner); silent
-- activity rows for undone owner corrections; an index for the counted-open history.
ALTER TABLE settings
    ADD COLUMN time_zone_source    VARCHAR(8)  NOT NULL DEFAULT 'DEFAULT' CHECK (time_zone_source IN ('DEFAULT', 'AUTO', 'USER')),
    ADD COLUMN notify_on           VARCHAR(16) NOT NULL DEFAULT 'EVERY' CHECK (notify_on IN ('FIRST', 'EVERY', 'EVERY_AFTER_GAP')),
    ADD COLUMN notify_documents    BOOLEAN     NOT NULL DEFAULT TRUE,
    ADD COLUMN quiet_hours_enabled BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN quiet_hours_start   VARCHAR(5)  NOT NULL DEFAULT '22:00',
    ADD COLUMN quiet_hours_end     VARCHAR(5)  NOT NULL DEFAULT '07:00',
    ADD COLUMN doc_read_seconds    INT         NOT NULL DEFAULT 30 CHECK (doc_read_seconds BETWEEN 10 AND 600);
UPDATE settings SET time_zone_source = CASE WHEN time_zone = 'UTC' THEN 'DEFAULT' ELSE 'USER' END;

ALTER TABLE activity ADD COLUMN silent BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX tracking_event_counted_idx ON tracking_event (tracked_email_id, type, received_at, id) WHERE verdict = 'COUNTED';
