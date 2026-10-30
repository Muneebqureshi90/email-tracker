package com.mailpulse.documents;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.mailpulse.common.web.ApiException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** The read-time guard and beat validation (pure). */
class DocumentRulesTest {

    private static final Instant FIRST = Instant.parse("2026-10-30T10:00:00Z");

    @Test
    void visibleTimeIsCappedPerBeatAndNeverRunsAheadOfTheWallClock() {
        assertThat(DocumentTracking.acceptedMs(FIRST, 0, 0, FIRST)).isZero();
        assertThat(DocumentTracking.acceptedMs(FIRST, 0, 4_000, FIRST.plusSeconds(5))).isEqualTo(4_000);
        assertThat(DocumentTracking.acceptedMs(FIRST, 0, 60_000, FIRST.plusSeconds(60))).as("one beat adds 10 s at most").isEqualTo(10_000);
        assertThat(DocumentTracking.acceptedMs(FIRST, 0, 10_000, FIRST)).as("10 s of slack at the start").isEqualTo(10_000);
        assertThat(DocumentTracking.acceptedMs(FIRST, 10_000, 10_000, FIRST)).as("no wall-clock time has passed").isZero();
        assertThat(DocumentTracking.acceptedMs(FIRST, 10_000, 10_000, FIRST.plusSeconds(3))).isEqualTo(3_000);
        assertThat(DocumentTracking.acceptedMs(FIRST, 0, 5_000, FIRST.minusSeconds(30))).as("a clock step back").isEqualTo(5_000);
        assertThat(DocumentTracking.acceptedMs(FIRST, 50_000, 5_000, FIRST.plusSeconds(10))).isZero();
    }

    @Test
    void beatsAreValidatedAndNormalised() {
        UUID view = UUID.randomUUID();
        DocumentApi.Beat beat = DocumentTracking.validate(new DocumentApi.Beat(view, 25_000L, 2, List.of(3, 1, 3, 2), 3));
        assertThat(beat.visibleMs()).isEqualTo(DocumentTracking.MAX_BEAT_MS);
        assertThat(beat.pagesViewed()).containsExactly(1, 2, 3);
        assertThat(DocumentTracking.validate(new DocumentApi.Beat(view, 0L, 1, List.of(), 1)).pagesViewed()).isEmpty();

        List<DocumentApi.Beat> invalid = List.of(
                new DocumentApi.Beat(null, 0L, 1, List.of(), 1),
                new DocumentApi.Beat(view, null, 1, List.of(), 1),
                new DocumentApi.Beat(view, -1L, 1, List.of(), 1),
                new DocumentApi.Beat(view, 0L, null, List.of(), 1),
                new DocumentApi.Beat(view, 0L, 2, List.of(), 1),
                new DocumentApi.Beat(view, 0L, 0, List.of(), 1),
                new DocumentApi.Beat(view, 0L, 1, null, 1),
                new DocumentApi.Beat(view, 0L, 1, List.of(2), 1),
                new DocumentApi.Beat(view, 0L, 1, List.of(0), 1),
                new DocumentApi.Beat(view, 0L, 1, List.of(), 0),
                new DocumentApi.Beat(view, 0L, 1, List.of(), DocumentTracking.MAX_PAGES + 1));
        for (DocumentApi.Beat bad : invalid) {
            assertThatThrownBy(() -> DocumentTracking.validate(bad)).as(bad.toString()).isInstanceOf(ApiException.class);
        }
        assertThatThrownBy(() -> DocumentTracking.validate(null)).isInstanceOf(ApiException.class);
    }
}
