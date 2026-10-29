package com.mailpulse.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

class RandomTokensTest {

    @Test
    void trackingTokensAre24UrlSafeCharactersAndUnique() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 10_000; i++) {
            String token = RandomTokens.trackingToken();
            assertThat(token).hasSize(24).matches("[A-Za-z0-9_-]+");
            assertThat(seen.add(token)).isTrue();
        }
    }

    @Test
    void apiTokensHavePrefixAnd256BitsOfRandomness() {
        String token = RandomTokens.apiToken();
        assertThat(token).startsWith("mp_").hasSize(3 + 43);
        assertThat(RandomTokens.apiToken()).isNotEqualTo(token);
    }

    @Test
    void setupCodeUsesUnambiguousCharacters() {
        assertThat(RandomTokens.setupCode()).matches("[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}");
    }

    @Test
    void trackingTokenCheckRejectsAnythingElse() {
        assertThat(RandomTokens.isTrackingToken(RandomTokens.trackingToken())).isTrue();
        assertThat(RandomTokens.isTrackingToken(null)).isFalse();
        assertThat(RandomTokens.isTrackingToken("short")).isFalse();
        assertThat(RandomTokens.isTrackingToken("../../etc/passwd/aaaaaaaa")).isFalse();
        assertThat(RandomTokens.isTrackingToken("a".repeat(25))).isFalse();
    }
}
