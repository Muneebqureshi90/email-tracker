-- Reply detection: when the extension saw a reply in the email's Gmail thread (the earliest one).
ALTER TABLE tracked_email ADD COLUMN replied_at TIMESTAMPTZ;
