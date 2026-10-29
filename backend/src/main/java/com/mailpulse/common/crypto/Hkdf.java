package com.mailpulse.common.crypto;

import java.security.GeneralSecurityException;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** HKDF with HMAC-SHA256 (RFC 5869), used to derive separate keys from the one master key. */
public final class Hkdf {

    private static final String HMAC = "HmacSHA256";
    private static final int HASH_LENGTH = 32;

    private Hkdf() {}

    public static byte[] derive(byte[] inputKey, byte[] salt, byte[] info, int length) {
        if (length <= 0 || length > 255 * HASH_LENGTH) {
            throw new IllegalArgumentException("Invalid HKDF output length");
        }
        byte[] pseudoRandomKey = mac(salt.length == 0 ? new byte[HASH_LENGTH] : salt).doFinal(inputKey);
        byte[] output = new byte[length];
        byte[] block = new byte[0];
        int offset = 0;
        for (int counter = 1; offset < length; counter++) {
            Mac mac = mac(pseudoRandomKey);
            mac.update(block);
            mac.update(info);
            mac.update((byte) counter);
            block = mac.doFinal();
            int take = Math.min(block.length, length - offset);
            System.arraycopy(block, 0, output, offset, take);
            offset += take;
        }
        return output;
    }

    private static Mac mac(byte[] key) {
        try {
            Mac mac = Mac.getInstance(HMAC);
            mac.init(new SecretKeySpec(key, HMAC));
            return mac;
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HMAC-SHA256 unavailable", e);
        }
    }
}
