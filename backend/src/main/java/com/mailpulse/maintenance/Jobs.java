package com.mailpulse.maintenance;

import com.mailpulse.activity.ActivityStream;
import com.mailpulse.alerts.AlertService;
import com.mailpulse.tracking.EventFinalizer;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/** Background schedule. Tests switch it off (mailpulse.jobs-enabled=false) and run each job directly. */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(name = "mailpulse.jobs-enabled", havingValue = "true", matchIfMissing = true)
class Jobs {

    private final EventFinalizer finalizer;
    private final ActivityStream stream;
    private final MaintenanceService maintenance;
    private final AlertService alerts;

    Jobs(EventFinalizer finalizer, ActivityStream stream, MaintenanceService maintenance, AlertService alerts) {
        this.finalizer = finalizer;
        this.stream = stream;
        this.maintenance = maintenance;
        this.alerts = alerts;
    }

    @Scheduled(fixedDelayString = "PT5S", initialDelayString = "PT5S")
    void finalizeEvents() {
        finalizer.runOnce();
    }

    @Scheduled(fixedDelayString = "PT25S")
    void keepStreamsAlive() {
        stream.heartbeat();
    }

    /** Follow-up reminders and finished snoozes; the Clock decides what is due. */
    @Scheduled(fixedDelayString = "PT5M", initialDelayString = "PT2M")
    void alerts() {
        alerts.runScheduled();
    }

    @Scheduled(fixedDelayString = "PT1H", initialDelayString = "PT1M")
    void housekeeping() {
        maintenance.runOnce();
    }
}
