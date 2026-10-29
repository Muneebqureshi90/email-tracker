package com.mailpulse.auth;

import com.mailpulse.common.RandomTokens;
import com.mailpulse.common.web.ApiException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** Revocable API tokens for the extension. Only a SHA-256 hash is stored; the raw token is shown once. */
@Service
public class ApiTokenService {

    private static final Duration TOUCH_INTERVAL = Duration.ofMinutes(1);
    private static final int MAX_TOKEN_LENGTH = 100;

    record CreatedToken(UUID id, String name, String prefix, String token, Instant createdAt) {}

    private final ApiTokenRepository repository;
    private final Clock clock;

    ApiTokenService(ApiTokenRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    CreatedToken create(String name) {
        String raw = RandomTokens.apiToken();
        UUID id = UUID.randomUUID();
        Instant now = clock.instant();
        String prefix = raw.substring(0, 10);
        repository.insert(id, name.trim(), sha256(raw), prefix, now);
        return new CreatedToken(id, name.trim(), prefix, raw, now);
    }

    List<ApiTokenRepository.ApiTokenRow> list() {
        return repository.findAll();
    }

    void revoke(UUID id) {
        if (!repository.exists(id)) {
            throw ApiException.notFound("Token not found");
        }
        repository.revoke(id, clock.instant());
    }

    /** Returns the token id when the raw token is valid and not revoked. */
    Optional<UUID> authenticate(String raw) {
        if (raw == null || !raw.startsWith("mp_") || raw.length() > MAX_TOKEN_LENGTH) {
            return Optional.empty();
        }
        return repository.findActiveByHash(sha256(raw)).map(token -> {
            Instant now = clock.instant();
            if (token.lastUsedAt() == null || token.lastUsedAt().isBefore(now.minus(TOUCH_INTERVAL))) {
                repository.touch(token.id(), now);
            }
            return token.id();
        });
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
