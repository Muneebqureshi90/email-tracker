package com.mailpulse.auth;

import com.mailpulse.common.MailPulseProperties;
import com.mailpulse.common.web.DashboardController;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.stream.Stream;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Two filter chains. Tracking routes (/t, /c) are open but only reachable on the public port.
 * Everything else needs the owner's session cookie or an extension API token. Cross-site requests are
 * stopped by the SameSite=Strict cookie and by CORS, which rejects every origin not on the allow-list.
 */
@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
class SecurityConfig {

    /** PLAN §8.1: the dashboard loads only its own scripts, styles and data. */
    static final String CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self'; style-src 'self'; "
            + "img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; "
            + "base-uri 'none'; form-action 'self'";

    @Bean
    @Order(1)
    SecurityFilterChain trackingChain(HttpSecurity http) throws Exception {
        http.securityMatcher("/t/**", "/c/**")
                .authorizeHttpRequests(authorize -> authorize.anyRequest().permitAll())
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .requestCache(cache -> cache.disable())
                .headers(headers -> headers.cacheControl(cacheControl -> cacheControl.disable()));
        return http.build();
    }

    @Bean
    @Order(2)
    SecurityFilterChain apiChain(HttpSecurity http, ApiTokenService apiTokens, MailPulseProperties properties) throws Exception {
        http.cors(c -> c.configurationSource(corsConfigurationSource(properties)))
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .requestCache(cache -> cache.disable())
                .formLogin(form -> form.disable())
                .httpBasic(basic -> basic.disable())
                .logout(logout -> logout.disable())
                .headers(headers -> headers
                        .contentSecurityPolicy(csp -> csp.policyDirectives(CONTENT_SECURITY_POLICY))
                        .referrerPolicy(referrer -> referrer.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER)))
                .oauth2ResourceServer(resourceServer -> resourceServer
                        .bearerTokenResolver(new CookieBearerTokenResolver())
                        .authenticationEntryPoint(SecurityProblems.entryPoint())
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(token -> new JwtAuthenticationToken(
                                token, List.of(new SimpleGrantedAuthority("ROLE_" + Roles.OWNER)), "owner"))))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(SecurityProblems.entryPoint())
                        .accessDeniedHandler(SecurityProblems.accessDenied()))
                .addFilterBefore(new ApiTokenAuthenticationFilter(apiTokens), BearerTokenAuthenticationFilter.class)
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers("/error").permitAll()
                        .requestMatchers(HttpMethod.GET, DashboardController.ROUTES).permitAll()
                        .requestMatchers(HttpMethod.GET, "/index.html", "/assets/**", "/favicon.svg").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/auth/status", "/actuator/health").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/setup", "/api/auth/login").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/emails", "/api/emails/*/links", "/api/self-views")
                        .hasAnyRole(Roles.OWNER, Roles.EXTENSION)
                        .requestMatchers(HttpMethod.PATCH, "/api/emails/*", "/api/emails/*/preferences")
                        .hasAnyRole(Roles.OWNER, Roles.EXTENSION)
                        .requestMatchers(HttpMethod.GET, "/api/emails/by-token/*", "/api/emails/*/card", "/api/marks", "/api/activity",
                                "/api/config")
                        .hasAnyRole(Roles.OWNER, Roles.EXTENSION)
                        .requestMatchers("/api/**").hasRole(Roles.OWNER)
                        .anyRequest().denyAll());
        return http.build();
    }

    /** Not a bean: Spring MVC's HandlerMappingIntrospector is also a CorsConfigurationSource. */
    private static CorsConfigurationSource corsConfigurationSource(MailPulseProperties properties) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(Stream.concat(properties.dashboardOrigins().stream(), properties.extensionOrigins().stream())
                .toList());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", "Last-Event-ID"));
        config.setAllowCredentials(false);
        config.setMaxAge(Duration.ofHours(1));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    @Bean
    JwtEncoder jwtEncoder(MailPulseProperties properties) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(sessionKey(properties)));
    }

    @Bean
    JwtDecoder jwtDecoder(MailPulseProperties properties, OwnerService owner, Clock clock) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(sessionKey(properties)).macAlgorithm(MacAlgorithm.HS256).build();
        JwtTimestampValidator timestamps = new JwtTimestampValidator(Duration.ofSeconds(30));
        timestamps.setClock(clock);
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                timestamps, new JwtIssuerValidator(SessionService.ISSUER), new PasswordChangedValidator(owner)));
        return decoder;
    }

    private static SecretKey sessionKey(MailPulseProperties properties) {
        String secret = properties.jwtSecret();
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException("MAILPULSE_JWT_SECRET is missing. Create infra/.env with scripts/new-env.ps1.");
        }
        byte[] key;
        try {
            key = Base64.getDecoder().decode(secret.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("MAILPULSE_JWT_SECRET must be base64", e);
        }
        if (key.length < 32) {
            throw new IllegalStateException("MAILPULSE_JWT_SECRET must decode to at least 32 bytes");
        }
        return new SecretKeySpec(key, "HmacSHA256");
    }
}
