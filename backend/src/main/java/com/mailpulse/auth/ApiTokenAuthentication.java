package com.mailpulse.auth;

import java.util.List;
import java.util.UUID;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

/** An authenticated extension request; the principal is the API token's id. */
final class ApiTokenAuthentication extends AbstractAuthenticationToken {

    private final UUID tokenId;

    ApiTokenAuthentication(UUID tokenId) {
        super(List.of(new SimpleGrantedAuthority("ROLE_" + Roles.EXTENSION)));
        this.tokenId = tokenId;
        setAuthenticated(true);
    }

    @Override
    public Object getCredentials() {
        return null;
    }

    @Override
    public Object getPrincipal() {
        return tokenId;
    }
}
