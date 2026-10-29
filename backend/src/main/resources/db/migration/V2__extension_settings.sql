-- Phase 3: extension behaviour that Step 1 has not proven yet is a setting (DECISIONS D-053).
ALTER TABLE settings
    ADD COLUMN send_mode          VARCHAR(16) NOT NULL DEFAULT 'PRESYNC' CHECK (send_mode IN ('PRESYNC', 'CANCEL_RESEND')),
    ADD COLUMN dnr_blocking       BOOLEAN     NOT NULL DEFAULT TRUE,
    ADD COLUMN track_confidential BOOLEAN     NOT NULL DEFAULT TRUE;
