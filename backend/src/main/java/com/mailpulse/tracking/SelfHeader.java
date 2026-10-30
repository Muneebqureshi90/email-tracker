package com.mailpulse.tracking;

import com.mailpulse.common.MailPulseProperties;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.stereotype.Component;

/**
 * The owner's own requests carry {@code X-MailPulse-Self} with the secret from infra/.env (the extension adds
 * it). Pixels, clicks and document requests with it never count.
 */
@Component
public class SelfHeader {

    public static final String NAME = "X-MailPulse-Self";

    private final byte[] secret;

    public SelfHeader(MailPulseProperties properties) {
        String value = properties.selfHeaderSecret();
        this.secret = value == null || value.isBlank() ? null : value.getBytes(StandardCharsets.UTF_8);
    }

    public boolean isSelf(HttpServletRequest request) {
        String header = request.getHeader(NAME);
        return secret != null && header != null && MessageDigest.isEqual(secret, header.getBytes(StandardCharsets.UTF_8));
    }
}
