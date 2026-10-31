package com.mailpulse.documents;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.support.IntegrationTest;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The retention DELETEs on the document tables filter on columns that lead an index (V7), not only link_id. */
class DocumentRetentionIndexesIT extends IntegrationTest {

    @Test
    void endedViewsAreFoundByTheirLastBeat() {
        assertThat(indexDefinition("document_view_last_beat_idx"))
                .contains("document_view", "(last_beat_at)", "merged_into IS NULL");
    }

    @Test
    void oldEventsAreFoundByWhenTheyArrived() {
        assertThat(indexDefinition("document_event_received_idx")).contains("document_event", "(received_at)");
    }

    private String indexDefinition(String name) {
        List<String> definitions = jdbc.sql("SELECT indexdef FROM pg_indexes WHERE indexname = :name")
                .param("name", name)
                .query(String.class)
                .list();
        assertThat(definitions).as(name).hasSize(1);
        return definitions.get(0);
    }
}
