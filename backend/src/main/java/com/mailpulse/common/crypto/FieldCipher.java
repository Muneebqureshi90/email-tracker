package com.mailpulse.common.crypto;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * AES-256-GCM encryption for sensitive columns (subjects, addresses, names, link URLs) and document files.
 * Stored layout: version byte (1) | 12-byte IV | ciphertext with 16-byte tag. The column name is
 * bound in as associated data, so a value copied into another column fails to decrypt.
 */
public final class FieldCipher {

    private static final byte VERSION = 1;
    private static final int IV_LENGTH = 12;
    private static final int TAG_BITS = 128;
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";

    private final SecretKey key;
    private final SecureRandom random = new SecureRandom();

    public FieldCipher(byte[] keyBytes) {
        if (keyBytes.length != 32) {
            throw new IllegalArgumentException("Field encryption key must be 32 bytes");
        }
        this.key = new SecretKeySpec(keyBytes, "AES");
    }

    public byte[] encrypt(String plaintext, String column) {
        return plaintext == null ? null : encryptBytes(plaintext.getBytes(StandardCharsets.UTF_8), column);
    }

    public String decrypt(byte[] stored, String column) {
        return stored == null ? null : new String(decryptBytes(stored, column), StandardCharsets.UTF_8);
    }

    /** Binary values (document files) in the same layout; {@code context} is bound in like a column name. */
    public byte[] encryptBytes(byte[] plaintext, String context) {
        if (plaintext == null) {
            return null;
        }
        byte[] iv = new byte[IV_LENGTH];
        random.nextBytes(iv);
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            cipher.updateAAD(context.getBytes(StandardCharsets.UTF_8));
            byte[] sealed = cipher.doFinal(plaintext);
            return ByteBuffer.allocate(1 + IV_LENGTH + sealed.length).put(VERSION).put(iv).put(sealed).array();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Encryption failed", e);
        }
    }

    public byte[] decryptBytes(byte[] stored, String context) {
        if (stored == null) {
            return null;
        }
        if (stored.length < 1 + IV_LENGTH + TAG_BITS / 8 || stored[0] != VERSION) {
            throw new IllegalArgumentException("Unsupported encrypted value");
        }
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, stored, 1, IV_LENGTH));
            cipher.updateAAD(context.getBytes(StandardCharsets.UTF_8));
            return cipher.doFinal(stored, 1 + IV_LENGTH, stored.length - 1 - IV_LENGTH);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Decryption failed (wrong key or damaged value)", e);
        }
    }
}
