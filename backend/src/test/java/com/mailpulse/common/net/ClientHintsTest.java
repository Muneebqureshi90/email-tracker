package com.mailpulse.common.net;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ClientHintsTest {

    @Test
    void readsQuotedModel() {
        assertThat(ClientHints.deviceModel("\"SM-S911B\"")).isEqualTo("SM-S911B");
        assertThat(ClientHints.deviceModel(" \"Pixel 8 Pro\" ")).isEqualTo("Pixel 8 Pro");
    }

    @Test
    void readsUnquotedModel() {
        assertThat(ClientHints.deviceModel("SM-A546E")).isEqualTo("SM-A546E");
    }

    @Test
    void unescapesQuotesAndBackslashes() {
        assertThat(ClientHints.deviceModel("\"Model \\\"X\\\"\"")).isEqualTo("Model \"X\"");
        assertThat(ClientHints.deviceModel("\"A\\\\B\"")).isEqualTo("A\\B");
        assertThat(ClientHints.deviceModel("\"bad\\escape\"")).isNull();
        assertThat(ClientHints.deviceModel("\"ends\\\"")).isNull();
    }

    @Test
    void blankOrMissingIsNull() {
        assertThat(ClientHints.deviceModel(null)).isNull();
        assertThat(ClientHints.deviceModel("")).isNull();
        assertThat(ClientHints.deviceModel("   ")).isNull();
        // Desktop Chrome sends an empty string when asked.
        assertThat(ClientHints.deviceModel("\"\"")).isNull();
        assertThat(ClientHints.deviceModel("\"  \"")).isNull();
    }

    @Test
    void rejectsMoreThan64Characters() {
        String sixtyFour = "M".repeat(64);
        assertThat(ClientHints.deviceModel("\"" + sixtyFour + "\"")).isEqualTo(sixtyFour);
        assertThat(ClientHints.deviceModel("\"" + sixtyFour + "M\"")).isNull();
    }

    @Test
    void rejectsControlCharacters() {
        assertThat(ClientHints.deviceModel("\"SM-S911B\nX\"")).isNull();
        assertThat(ClientHints.deviceModel("SM\tS911B")).isNull();
        assertThat(ClientHints.deviceModel("\"SM\u007FS911B\"")).isNull();
    }

    @Test
    void rejectsNonAscii() {
        assertThat(ClientHints.deviceModel("\"Galaxy S23 \u00DCltra\"")).isNull();
        assertThat(ClientHints.deviceModel("\"Pixel 8 \u2122\"")).isNull();
    }
}
