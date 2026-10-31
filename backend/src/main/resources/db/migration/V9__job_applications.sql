-- Job application pipeline: one row per application the owner tracks. Company, role and notes are personal text,
-- stored as AES-256-GCM ciphertext (_enc) like subjects and addresses. A linked tracked email supplies the subject
-- and the open and click counts. email_id has no foreign key on purpose: "delete all data" (DataController) runs
-- one TRUNCATE over the tracked-email tables, which a new referencing table would make fail. Reads join
-- tracked_email, so an email that no longer exists reads as no email (the same as ON DELETE SET NULL).
CREATE TABLE job_application (
    id          UUID PRIMARY KEY,
    company_enc BYTEA       NOT NULL,
    role_enc    BYTEA,
    status      VARCHAR(12) NOT NULL DEFAULT 'APPLIED' CHECK (status IN ('APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED')),
    applied_on  DATE,
    notes_enc   BYTEA,
    email_id    UUID,
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX job_application_created_idx ON job_application (created_at DESC, id DESC);
CREATE INDEX job_application_email_idx ON job_application (email_id) WHERE email_id IS NOT NULL;
