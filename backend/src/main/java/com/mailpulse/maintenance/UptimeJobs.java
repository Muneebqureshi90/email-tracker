package com.mailpulse.maintenance;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * The heartbeat. Scheduling is enabled by {@link Jobs}; like it, tests switch this off (mailpulse.jobs-enabled=false)
 * and call {@link UptimeService#beat()} directly. The first beat runs at startup, so a gap is recorded at once.
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "mailpulse.jobs-enabled", havingValue = "true", matchIfMissing = true)
class UptimeJobs {

    private final UptimeService uptime;

    UptimeJobs(UptimeService uptime) {
        this.uptime = uptime;
    }

    @Scheduled(fixedDelayString = "PT1M", initialDelayString = "PT0S")
    void heartbeat() {
        uptime.beat();
    }
}
