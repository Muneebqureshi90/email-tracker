package com.mailpulse.common.crypto;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Keyed hash (HMAC-SHA256) of an encrypted value, so exact matches can be looked up in SQL. */
public final class BlindIndex {

    private static final String HMAC = "HmacSHA256";

    private final SecretKeySpec key;

    public BlindIndex(byte[] keyBytes) {
        if (keyBytes.length < 32) {
            throw new IllegalArgumentException("Blind index key must be at least 32 bytes");
        }
        this.key = new SecretKeySpec(keyBytes, HMAC);
    }

    /** The purpose separates indexes of different kinds of values. */
    public byte[] of(String purpose, String value) {
        try {
            Mac mac = Mac.getInstance(HMAC);
            mac.init(key);
            mac.update(purpose.getBytes(StandardCharsets.UTF_8));
            mac.update((byte) 0);
            return mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HMAC-SHA256 unavailable", e);
        }
    }
}
