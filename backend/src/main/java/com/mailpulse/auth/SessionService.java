package com.mailpulse.auth;

import com.mailpulse.common.MailPulseProperties;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.springframework.http.ResponseCookie;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Service;

/** Dashboard session: an HS256 JWT in an HttpOnly, SameSite=Strict cookie that page scripts cannot read. */
@Service
public class SessionService {

    public static final String COOKIE = "mp_session";
    static final String ISSUER = "mailpulse";

    private final JwtEncoder encoder;
    private final JwtDecoder decoder;
    private final MailPulseProperties properties;
    private final Clock clock;

    SessionService(JwtEncoder encoder, JwtDecoder decoder, MailPulseProperties properties, Clock clock) {
        this.encoder = encoder;
        this.decoder = decoder;
        this.properties = properties;
        this.clock = clock;
    }

    public ResponseCookie issue() {
        Instant now = clock.instant();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(ISSUER)
                .subject("owner")
                .issuedAt(now)
                .expiresAt(now.plus(properties.sessionTtl()))
                .id(UUID.randomUUID().toString())
                .build();
        String token = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
        return cookie(token).maxAge(properties.sessionTtl()).build();
    }

    public ResponseCookie clear() {
        return cookie("").maxAge(0).build();
    }

    public boolean isValid(HttpServletRequest request) {
        String token = token(request);
        if (token == null) {
            return false;
        }
        try {
            decoder.decode(token);
            return true;
        } catch (JwtException e) {
            return false;
        }
    }

    static String token(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (COOKIE.equals(cookie.getName()) && !cookie.getValue().isBlank()) {
                return cookie.getValue();
            }
        }
        return null;
    }

    private ResponseCookie.ResponseCookieBuilder cookie(String value) {
        return ResponseCookie.from(COOKIE, value)
                .httpOnly(true)
                .secure(properties.sessionCookieSecure())
                .sameSite("Strict")
                .path("/");
    }
}
