package com.mailpulse.common.crypto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import org.junit.jupiter.api.Test;

class CryptoTest {

    private static final HexFormat HEX = HexFormat.of();
    private final FieldCipher cipher = new FieldCipher(new byte[32]);

    /** RFC 5869, appendix A.1 (test case 1). */
    @Test
    void hkdfMatchesRfc5869TestVector() {
        byte[] okm = Hkdf.derive(
                HEX.parseHex("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b"),
                HEX.parseHex("000102030405060708090a0b0c"),
                HEX.parseHex("f0f1f2f3f4f5f6f7f8f9"),
                42);
        assertThat(HEX.formatHex(okm))
                .isEqualTo("3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865");
    }

    @Test
    void encryptsAndDecryptsUnicodeWithoutLeakingPlaintext() {
        String subject = "Quarterly plan 🚀 for Zürich";
        byte[] stored = cipher.encrypt(subject, "tracked_email.subject");
        assertThat(new String(stored, StandardCharsets.ISO_8859_1)).doesNotContain("Quarterly");
        assertThat(cipher.decrypt(stored, "tracked_email.subject")).isEqualTo(subject);
    }

    @Test
    void sameTextEncryptsDifferentlyEachTime() {
        assertThat(cipher.encrypt("same", "c")).isNotEqualTo(cipher.encrypt("same", "c"));
    }

    @Test
    void detectsTamperingAndMovedValues() {
        byte[] stored = cipher.encrypt("secret", "contact.address");
        assertThatThrownBy(() -> cipher.decrypt(stored, "tracked_email.subject")).isInstanceOf(IllegalStateException.class);
        stored[stored.length - 1] ^= 1;
        assertThatThrownBy(() -> cipher.decrypt(stored, "contact.address")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void wrongKeyCannotDecrypt() {
        byte[] stored = cipher.encrypt("secret", "c");
        byte[] otherKey = new byte[32];
        otherKey[0] = 1;
        assertThatThrownBy(() -> new FieldCipher(otherKey).decrypt(stored, "c")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void nullStaysNull() {
        assertThat(cipher.encrypt(null, "c")).isNull();
        assertThat(cipher.decrypt(null, "c")).isNull();
    }

    @Test
    void blindIndexIsDeterministicAndSeparatedByPurpose() {
        BlindIndex index = new BlindIndex(new byte[32]);
        assertThat(index.of("email", "a@b.c")).isEqualTo(index.of("email", "a@b.c"));
        assertThat(index.of("email", "a@b.c")).isNotEqualTo(index.of("link-url", "a@b.c"));
        assertThat(index.of("email", "a@b.c")).isNotEqualTo(new BlindIndex(new byte[] {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
                17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32}).of("email", "a@b.c"));
    }
}
