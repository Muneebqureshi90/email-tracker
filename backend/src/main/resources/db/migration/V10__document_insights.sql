-- Visible time per page of each counted document view (GET /api/documents/{id}/pages). The viewer's beat names
-- the page on screen; the beat's accepted visible time is added to that page of the (root) view.
CREATE TABLE document_page_time (
    view_id    BIGINT NOT NULL REFERENCES document_view (id) ON DELETE CASCADE,
    page       INT    NOT NULL CHECK (page >= 1),
    visible_ms BIGINT NOT NULL DEFAULT 0 CHECK (visible_ms >= 0),
    PRIMARY KEY (view_id, page)
);

-- Optional view limit of a link: once it has this many counted views, further visits get the expired-link answer.
ALTER TABLE document_link ADD COLUMN max_views INT CHECK (max_views BETWEEN 1 AND 1000);
