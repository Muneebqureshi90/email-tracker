package com.mailpulse.maintenance;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.support.IntegrationTest;
import com.mailpulse.support.TestPdfs;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class MaintenanceIT extends IntegrationTest {

    @Autowired
    private MaintenanceService maintenance;

    @Test
    void removesStaleDraftsAndExpiredEmails() {
        TrackedEmail draft = registerEmail(uniqueAccount());
        TrackedEmail sent = sentEmail(uniqueAccount(), "old", "old" + System.nanoTime(), "r@gmail.com");
        Instant start = clock.instant();
        try {
            clock.advance(Duration.ofHours(25));
            maintenance.runOnce();
            assertThat(exists(draft.id())).isFalse();
            assertThat(exists(sent.id())).isTrue();

            clock.advance(Duration.ofDays(366));
            maintenance.runOnce();
            assertThat(exists(sent.id())).isFalse();
        } finally {
            clock.set(start);
        }
    }

    @Test
    void documentEventsExpireWhileDocumentsAndShareLinksStay() {
        String documentId = uploadPdf("Retention.pdf", TestPdfs.pdf(1, "Retention")).get("id").asString();
        String share = linkToken(createLink(documentId, Map.of("label", "Kept"), asOwner()));
        TrackedEmail draft = registerEmail(uniqueAccount());
        String draftLink = linkToken(createLink(documentId, Map.of("emailId", draft.id().toString()), asExtension()));
        assertThat(beat(share, UUID.randomUUID(), 0, List.of(1), 1, reader(900)).status()).isEqualTo(204);
        assertThat(http.get(pub("/d/" + share + "/file"), reader(900)).status()).isEqualTo(200);
        assertThat(beat(draftLink, UUID.randomUUID(), 0, List.of(1), 1, reader(901)).status()).isEqualTo(204);
        Instant start = clock.instant();
        try {
            clock.advance(Duration.ofHours(25));
            maintenance.runOnce();
            assertThat(exists(draft.id())).as("a draft whose document link was opened is not a stale draft").isTrue();

            clock.advance(Duration.ofDays(366));
            MaintenanceService.Result result = maintenance.runOnce();
            assertThat(result.documentEventsExpired()).isGreaterThanOrEqualTo(2);
            assertThat(jdbc.sql("SELECT count(*) FROM document_event e JOIN document_link l ON l.id = e.link_id WHERE l.document_id = :d")
                    .param("d", UUID.fromString(documentId)).query(Long.class).single()).isZero();
            // Checked in SQL: the owner's session has expired after a year of test clock. The draft and its link went
            // with the retention period; the share link and the document stay.
            assertThat(jdbc.sql("SELECT count(*) FROM document_link WHERE document_id = :d").param("d", UUID.fromString(documentId))
                    .query(Long.class).single()).as("the share link stays").isEqualTo(1);
            assertThat(jdbc.sql("SELECT count(*) FROM document WHERE id = :d").param("d", UUID.fromString(documentId))
                    .query(Long.class).single()).isEqualTo(1);
        } finally {
            clock.set(start);
        }
    }

    private boolean exists(UUID id) {
        return jdbc.sql("SELECT count(*) FROM tracked_email WHERE id = :id").param("id", id).query(Long.class).single() > 0;
    }
}
