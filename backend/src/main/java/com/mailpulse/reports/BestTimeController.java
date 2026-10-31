package com.mailpulse.reports;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class BestTimeController {

    private final BestTimeQueries queries;

    BestTimeController(BestTimeQueries queries) {
        this.queries = queries;
    }

    /** Counted opens of the last 180 days per weekday (Monday = 1) and hour, in the owner's time zone. */
    @GetMapping("/api/reports/best-time")
    BestTimeQueries.BestTime bestTime() {
        return queries.bestTime();
    }

    /** Monday 00:00 of the current week (owner's time zone) until now. */
    @GetMapping("/api/reports/this-week")
    BestTimeQueries.ThisWeek thisWeek() {
        return queries.thisWeek();
    }
}
