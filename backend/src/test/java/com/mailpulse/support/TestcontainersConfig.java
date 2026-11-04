package com.mailpulse.support;

import com.mailpulse.common.geo.IpLocation;
import com.mailpulse.common.geo.IpLocator;
import java.time.Instant;
import java.util.Optional;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * A real PostgreSQL 18 per Spring test context, the controllable clock and a fixed IP location table
 * (tests do not need the DB-IP files).
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfig {

    /** The network that {@link #testIpLocator()} knows; any other prefix has no location. */
    public static final String LOCATED_PREFIX = "203.0.113.0/24";
    public static final IpLocation LOCATED =
            new IpLocation("Lahore", "Punjab", "Pakistan", "PK", 31.5497, 74.3436, "Example Telecom");

    @Bean
    @ServiceConnection
    PostgreSQLContainer postgres() {
        return new PostgreSQLContainer("postgres:18.6-alpine");
    }

    @Bean
    @Primary
    MutableClock testClock() {
        return new MutableClock(Instant.now());
    }

    @Bean
    @Primary
    IpLocator testIpLocator() {
        return prefix -> LOCATED_PREFIX.equals(prefix) ? Optional.of(LOCATED) : Optional.empty();
    }
}
