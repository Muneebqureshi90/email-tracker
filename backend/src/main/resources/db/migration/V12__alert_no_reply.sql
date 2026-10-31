-- NO_REPLY: an email opened at least three times with no reply two days after sending gets one follow-up suggestion.
ALTER TABLE alert DROP CONSTRAINT alert_type_check;
ALTER TABLE alert ADD CONSTRAINT alert_type_check CHECK (type IN ('FOLLOW_UP', 'OPEN_SPIKE', 'REVIVAL', 'DOC_VIEWS', 'NO_REPLY'));
