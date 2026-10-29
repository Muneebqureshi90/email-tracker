package com.mailpulse.auth;

import com.mailpulse.common.RandomTokens;
import com.mailpulse.common.web.ApiException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/** The single owner account: first-run setup, password checks with lockout, password changes. */
@Service
public class OwnerService {

    static final int MAX_FAILED_LOGINS = 10;
    static final Duration LOCKOUT = Duration.ofMinutes(15);
    private static final int MIN_PASSWORD_LENGTH = 12;
    private static final int MAX_PASSWORD_BYTES = 72; // BCrypt limit

    private static final Logger log = LoggerFactory.getLogger(OwnerService.class);

    private final OwnerAccountRepository repository;
    private final PasswordEncoder passwordEncoder;
    private final Clock clock;
    private final AtomicReference<String> setupCode = new AtomicReference<>();
    private volatile Instant passwordChangedAt;

    OwnerService(OwnerAccountRepository repository, PasswordEncoder passwordEncoder, Clock clock) {
        this.repository = repository;
        this.passwordEncoder = passwordEncoder;
        this.clock = clock;
    }

    /** On first start, prints a one-time code so only someone who can read the log can claim the account. */
    @EventListener(ApplicationReadyEvent.class)
    void announceSetupCode() {
        if (repository.exists()) {
            return;
        }
        String code = RandomTokens.setupCode();
        setupCode.set(code);
        log.warn("MailPulse first-run setup code: {} (enter it in the dashboard to choose your password)", code);
    }

    public boolean setupRequired() {
        return !repository.exists();
    }

    /** For tests and the setup script only; the code is never returned by the API. */
    public Optional<String> pendingSetupCode() {
        return Optional.ofNullable(setupCode.get());
    }

    public synchronized void setup(String code, String password) {
        if (repository.exists()) {
            throw ApiException.conflict("Setup is already complete");
        }
        String expected = setupCode.get();
        if (expected == null || code == null || !constantTimeEquals(normalize(code), normalize(expected))) {
            throw ApiException.forbidden("Invalid setup code");
        }
        checkPasswordPolicy(password);
        Instant now = clock.instant().truncatedTo(ChronoUnit.SECONDS);
        if (!repository.create(passwordEncoder.encode(password), now)) {
            throw ApiException.conflict("Setup is already complete");
        }
        setupCode.set(null);
        passwordChangedAt = now;
    }

    public void verifyLogin(String password) {
        OwnerAccountRepository.OwnerAccount owner =
                repository.find().orElseThrow(() -> ApiException.conflict("Setup is not complete"));
        Instant now = clock.instant();
        if (owner.lockedUntil() != null && now.isBefore(owner.lockedUntil())) {
            throw ApiException.tooManyRequests("Too many failed attempts. Try again later.");
        }
        if (password == null || !passwordEncoder.matches(password, owner.passwordHash())) {
            int failures = owner.failedLogins() + 1;
            repository.recordFailure(failures, failures >= MAX_FAILED_LOGINS ? now.plus(LOCKOUT) : null);
            throw ApiException.unauthorized("Wrong password");
        }
        if (owner.failedLogins() > 0 || owner.lockedUntil() != null) {
            repository.resetFailures();
        }
    }

    public synchronized void changePassword(String currentPassword, String newPassword) {
        OwnerAccountRepository.OwnerAccount owner =
                repository.find().orElseThrow(() -> ApiException.conflict("Setup is not complete"));
        if (currentPassword == null || !passwordEncoder.matches(currentPassword, owner.passwordHash())) {
            throw ApiException.forbidden("Current password is wrong");
        }
        checkPasswordPolicy(newPassword);
        Instant now = clock.instant().truncatedTo(ChronoUnit.SECONDS);
        repository.updatePassword(passwordEncoder.encode(newPassword), now);
        passwordChangedAt = now;
    }

    /** Sessions issued before this moment are no longer accepted. */
    public Instant passwordChangedAt() {
        Instant cached = passwordChangedAt;
        if (cached != null) {
            return cached;
        }
        Optional<Instant> stored = repository.find().map(OwnerAccountRepository.OwnerAccount::passwordChangedAt);
        stored.ifPresent(value -> passwordChangedAt = value);
        return stored.orElse(Instant.MAX);
    }

    private static void checkPasswordPolicy(String password) {
        if (password == null || password.isBlank() || password.length() < MIN_PASSWORD_LENGTH) {
            throw ApiException.badRequest("Password must have at least " + MIN_PASSWORD_LENGTH + " characters");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
            throw ApiException.badRequest("Password is too long (max " + MAX_PASSWORD_BYTES + " bytes)");
        }
    }

    private static String normalize(String code) {
        return code.replace("-", "").replace(" ", "").toUpperCase(Locale.ROOT);
    }

    private static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
