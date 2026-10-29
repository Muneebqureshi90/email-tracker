package com.mailpulse.maintenance;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.support.IntegrationTest;
import java.time.Duration;
import java.time.Instant;
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

    private boolean exists(UUID id) {
        return jdbc.sql("SELECT count(*) FROM tracked_email WHERE id = :id").param("id", id).query(Long.class).single() > 0;
    }
}
