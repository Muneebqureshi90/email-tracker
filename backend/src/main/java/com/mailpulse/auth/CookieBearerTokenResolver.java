package com.mailpulse.auth;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;

/**
 * Reads the session JWT from the cookie only. The Authorization header is left to the extension's
 * API-token filter. Only API calls read the cookie: the dashboard's pages and files never need it,
 * and login, setup and status ignore it, so an expired cookie, or one from another install (browsers
 * send 127.0.0.1 cookies to every port), cannot block them.
 */
class CookieBearerTokenResolver implements BearerTokenResolver {

    private static final Set<String> COOKIE_FREE_PATHS = Set.of("/api/auth/status", "/api/auth/login", "/api/auth/setup");

    @Override
    public String resolve(HttpServletRequest request) {
        String path = request.getRequestURI();
        if (!path.startsWith("/api/") || COOKIE_FREE_PATHS.contains(path)) {
            return null;
        }
        return SessionService.token(request);
    }
}
