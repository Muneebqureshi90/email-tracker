package com.mailpulse.common;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Every time-based rule reads time from this clock so tests can control it. */
@Configuration(proxyBeanMethods = false)
class ClockConfig {

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
