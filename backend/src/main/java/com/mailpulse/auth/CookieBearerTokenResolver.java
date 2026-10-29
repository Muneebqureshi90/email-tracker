package com.mailpulse.auth;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;

/**
 * Reads the session JWT from the cookie only. The Authorization header is left to the extension's
 * API-token filter. Login, setup and status ignore the cookie so an expired one cannot block them.
 */
class CookieBearerTokenResolver implements BearerTokenResolver {

    private static final Set<String> COOKIE_FREE_PATHS = Set.of("/api/auth/status", "/api/auth/login", "/api/auth/setup");

    @Override
    public String resolve(HttpServletRequest request) {
        if (COOKIE_FREE_PATHS.contains(request.getRequestURI())) {
            return null;
        }
        return SessionService.token(request);
    }
}
