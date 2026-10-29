package com.mailpulse.auth;

import com.mailpulse.common.RateLimiter;
import com.mailpulse.common.web.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Clock;
import java.time.Duration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
class AuthController {

    record StatusResponse(boolean setupRequired, boolean authenticated) {}

    record SetupRequest(@NotBlank @Size(max = 20) String setupCode, @NotBlank @Size(max = 200) String password) {}

    record LoginRequest(@NotBlank @Size(max = 200) String password) {}

    record PasswordChangeRequest(
            @NotBlank @Size(max = 200) String currentPassword, @NotBlank @Size(max = 200) String newPassword) {}

    private final OwnerService owner;
    private final SessionService sessions;
    private final RateLimiter attempts;

    AuthController(OwnerService owner, SessionService sessions, Clock clock) {
        this.owner = owner;
        this.sessions = sessions;
        this.attempts = new RateLimiter(5, Duration.ofMinutes(1), clock, 16);
    }

    @GetMapping("/status")
    StatusResponse status(HttpServletRequest request) {
        return new StatusResponse(owner.setupRequired(), sessions.isValid(request));
    }

    @PostMapping("/setup")
    ResponseEntity<Void> setup(@Valid @RequestBody SetupRequest body) {
        limit("setup");
        owner.setup(body.setupCode(), body.password());
        return withCookie(ResponseEntity.status(HttpStatus.CREATED), sessions.issue());
    }

    @PostMapping("/login")
    ResponseEntity<Void> login(@Valid @RequestBody LoginRequest body) {
        limit("login");
        owner.verifyLogin(body.password());
        return withCookie(ResponseEntity.noContent(), sessions.issue());
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout() {
        return withCookie(ResponseEntity.noContent(), sessions.clear());
    }

    @PutMapping("/password")
    ResponseEntity<Void> changePassword(@Valid @RequestBody PasswordChangeRequest body) {
        limit("password");
        owner.changePassword(body.currentPassword(), body.newPassword());
        return withCookie(ResponseEntity.noContent(), sessions.issue());
    }

    private void limit(String action) {
        if (!attempts.tryAcquire(action)) {
            throw ApiException.tooManyRequests("Too many attempts. Wait a minute and try again.");
        }
    }

    private static ResponseEntity<Void> withCookie(ResponseEntity.HeadersBuilder<?> builder, ResponseCookie cookie) {
        return builder.header(HttpHeaders.SET_COOKIE, cookie.toString()).build();
    }
}
