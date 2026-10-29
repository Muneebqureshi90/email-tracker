package com.mailpulse.auth;

import java.time.Instant;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

/** Rejects sessions issued before the latest password change, so changing the password logs out everywhere. */
class PasswordChangedValidator implements OAuth2TokenValidator<Jwt> {

    private static final OAuth2Error ENDED = new OAuth2Error("invalid_token", "Session ended by a password change", null);

    private final OwnerService owner;

    PasswordChangedValidator(OwnerService owner) {
        this.owner = owner;
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt jwt) {
        Instant issuedAt = jwt.getIssuedAt();
        if (issuedAt != null && !issuedAt.isBefore(owner.passwordChangedAt())) {
            return OAuth2TokenValidatorResult.success();
        }
        return OAuth2TokenValidatorResult.failure(ENDED);
    }
}
