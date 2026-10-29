package com.mailpulse.reports;

import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
class ReportController {

    private final ReportQueries reports;

    ReportController(ReportQueries reports) {
        this.reports = reports;
    }

    /** Without a date: today in the owner's time zone. */
    @GetMapping("/api/reports/daily")
    ReportQueries.Report daily(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return reports.daily(date);
    }

    /** Without weekStart: the week (Monday to Sunday) that contains today. */
    @GetMapping("/api/reports/weekly")
    ReportQueries.Report weekly(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart) {
        return reports.weekly(weekStart);
    }
}
