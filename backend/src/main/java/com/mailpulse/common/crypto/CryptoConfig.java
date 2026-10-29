package com.mailpulse.common.crypto;

import com.mailpulse.common.MailPulseProperties;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Derives the field-encryption key and the blind-index key from MAILPULSE_ENCRYPTION_KEY. */
@Configuration(proxyBeanMethods = false)
class CryptoConfig {

    private static final byte[] SALT = "mailpulse-v1".getBytes(StandardCharsets.UTF_8);

    @Bean
    FieldCipher fieldCipher(MailPulseProperties properties) {
        return new FieldCipher(Hkdf.derive(masterKey(properties), SALT, info("field-encryption"), 32));
    }

    @Bean
    BlindIndex blindIndex(MailPulseProperties properties) {
        return new BlindIndex(Hkdf.derive(masterKey(properties), SALT, info("blind-index"), 32));
    }

    private static byte[] masterKey(MailPulseProperties properties) {
        String value = properties.encryptionKey();
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("MAILPULSE_ENCRYPTION_KEY is missing. Create infra/.env with scripts/new-env.ps1.");
        }
        byte[] key;
        try {
            key = Base64.getDecoder().decode(value.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("MAILPULSE_ENCRYPTION_KEY must be base64", e);
        }
        if (key.length != 32) {
            throw new IllegalStateException("MAILPULSE_ENCRYPTION_KEY must decode to exactly 32 bytes");
        }
        return key;
    }

    private static byte[] info(String purpose) {
        return purpose.getBytes(StandardCharsets.UTF_8);
    }
}
