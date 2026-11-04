-- Phone model a Chromium browser on Android sends in Sec-CH-UA-Model once asked with Accept-CH (D-135),
-- for example "SM-S911B" or "Pixel 8 Pro". Untrusted text, NULL when the browser sent none.
ALTER TABLE tracking_event ADD COLUMN device_model VARCHAR(64);
ALTER TABLE document_event ADD COLUMN device_model VARCHAR(64);
