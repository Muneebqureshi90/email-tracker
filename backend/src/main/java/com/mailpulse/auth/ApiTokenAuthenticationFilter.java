package com.mailpulse.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/** Authenticates "Authorization: Bearer mp_..." extension tokens. Other requests pass through untouched. */
class ApiTokenAuthenticationFilter extends OncePerRequestFilter {

    private static final String PREFIX = "Bearer mp_";

    private final ApiTokenService tokens;

    ApiTokenAuthenticationFilter(ApiTokenService tokens) {
        this.tokens = tokens;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header != null && header.startsWith(PREFIX)) {
            Optional<UUID> tokenId = tokens.authenticate(header.substring("Bearer ".length()).trim());
            if (tokenId.isEmpty()) {
                SecurityProblems.write(response, HttpServletResponse.SC_UNAUTHORIZED, "Unauthorized", "Invalid or revoked API token");
                return;
            }
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(new ApiTokenAuthentication(tokenId.get()));
            SecurityContextHolder.setContext(context);
        }
        chain.doFilter(request, response);
    }
}
