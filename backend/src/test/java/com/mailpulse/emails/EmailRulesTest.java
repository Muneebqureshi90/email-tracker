package com.mailpulse.emails;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class EmailRulesTest {

    @ParameterizedTest
    @ValueSource(strings = {
        "https://example.com",
        "http://example.com/path?q=1&r=2#frag",
        "https://sub.example.co.uk:8443/a/b",
        "HTTPS://EXAMPLE.COM/upper"
    })
    void acceptsAbsoluteWebLinks(String url) {
        assertThat(LinkUrls.validate(url)).contains(url);
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "mailto:someone@example.com",
        "ftp://example.com/file",
        "/relative/path",
        "https://user:password@example.com/",
        "https://exa mple.com/",
        "https://example.com/\r\nSet-Cookie:x=y",
        "https://"
    })
    void rejectsAnythingElse(String url) {
        assertThat(LinkUrls.validate(url)).isEmpty();
    }

    @Test
    void rejectsOverlongLinks() {
        assertThat(LinkUrls.validate("https://example.com/" + "a".repeat(LinkUrls.MAX_LENGTH))).isEmpty();
    }

    @Test
    void normalizesAddresses() {
        assertThat(Addresses.normalize("  Jane.Doe@Example.COM ")).isEqualTo("jane.doe@example.com");
        assertThat(Addresses.domain("jane@example.com")).isEqualTo("example.com");
    }

    @Test
    void flagsUnreliableOpenStatusOnlyWhenEveryRecipientBlocksImages() {
        assertThat(Addresses.allBlockImages(List.of("a@outlook.com", "b@yahoo.com"))).isTrue();
        assertThat(Addresses.allBlockImages(List.of("a@outlook.com", "b@gmail.com"))).isFalse();
        assertThat(Addresses.allBlockImages(List.of())).isFalse();
    }
}
