package com.mailpulse.reports;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class WeeklySummaryController {

    private final WeeklySummary summary;

    WeeklySummaryController(WeeklySummary summary) {
        this.summary = summary;
    }

    /** Previous Monday 00:00 to this Monday 00:00 in the owner's time zone. */
    @GetMapping("/api/reports/last-week")
    WeeklySummary.Week lastWeek() {
        return summary.lastWeek();
    }
}
