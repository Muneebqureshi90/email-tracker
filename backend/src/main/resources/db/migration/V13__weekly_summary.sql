-- WEEKLY: one summary alert per week (Monday 09:00 owner time) about the previous week. It has no email and no
-- document; details.week holds the Monday it was raised for, which keeps it to one alert per week.
ALTER TABLE alert DROP CONSTRAINT alert_type_check;
ALTER TABLE alert ADD CONSTRAINT alert_type_check
    CHECK (type IN ('FOLLOW_UP', 'OPEN_SPIKE', 'REVIVAL', 'DOC_VIEWS', 'NO_REPLY', 'WEEKLY'));
ALTER TABLE alert DROP CONSTRAINT alert_about_check;
ALTER TABLE alert ADD CONSTRAINT alert_about_check
    CHECK (tracked_email_id IS NOT NULL OR document_link_id IS NOT NULL OR type = 'WEEKLY');
CREATE UNIQUE INDEX alert_weekly_idx ON alert ((details ->> 'week')) WHERE type = 'WEEKLY';
