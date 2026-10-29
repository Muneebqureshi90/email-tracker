package com.mailpulse.alerts;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
class AlertController {

    enum NewStatus {
        NEW,
        SEEN,
        DISMISSED,
        SNOOZED
    }

    record AlertUpdate(@NotNull NewStatus status, @Min(1) @Max(168) Integer snoozeHours) {}

    private final AlertService alerts;

    AlertController(AlertService alerts) {
        this.alerts = alerts;
    }

    /** status=active (new and seen, the default) or all. */
    @GetMapping("/api/alerts")
    AlertService.AlertPage list(
            @RequestParam(defaultValue = "active") String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size) {
        return alerts.list(status, page, size);
    }

    @PatchMapping("/api/alerts/{id}")
    AlertService.AlertView update(@PathVariable UUID id, @Valid @RequestBody AlertUpdate body) {
        return alerts.update(id, body.status().name(), body.snoozeHours());
    }
}
