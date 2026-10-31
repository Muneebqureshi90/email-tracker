-- Retention (DocumentEventRepository.deleteOlderThan) deletes ended views by last_beat_at and events by
-- received_at. The V6 indexes on both tables start with link_id, so without these every run scans both tables.
CREATE INDEX IF NOT EXISTS document_view_last_beat_idx ON document_view (last_beat_at) WHERE merged_into IS NULL;
CREATE INDEX IF NOT EXISTS document_event_received_idx ON document_event (received_at);
