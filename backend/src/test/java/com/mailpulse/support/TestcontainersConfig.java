package com.mailpulse.support;

import java.time.Instant;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.testcontainers.postgresql.PostgreSQLContainer;

/** A real PostgreSQL 18 per Spring test context, plus the controllable clock. */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfig {

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
}
