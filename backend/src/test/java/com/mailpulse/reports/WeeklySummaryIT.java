package com.mailpulse.reports;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.alerts.AlertService;
import com.mailpulse.auth.SessionService;
import com.mailpulse.support.IntegrationTest;
import com.mailpulse.support.TestHttp;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

/** WEEKLY summary alert and /api/reports/last-week. Own context: it moves the clock by days. */
@TestPropertySource(properties = "test.context=weekly")
class WeeklySummaryIT extends IntegrationTest {

    private static final String TEXT = "Last week: 2 sent, 0 opened, 0 replied, 0 interviews";

    @Autowired
    AlertService alerts;

    @Test
    void mondayMorningRaisesOneSummaryOfLastWeek() {
        LocalDate monday = LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC).plusDays(7)
                .with(TemporalAdjusters.next(DayOfWeek.MONDAY));
        clock.set(monday.minusDays(5).atTime(12, 0).toInstant(ZoneOffset.UTC));
        sentEmail(uniqueAccount(), "Weekly one", "w" + System.nanoTime(), "a@example.com");
        sentEmail(uniqueAccount(), "Weekly two", "x" + System.nanoTime(), "b@example.com");

        clock.set(monday.atTime(10, 0).toInstant(ZoneOffset.UTC));
        alerts.runScheduled();
        alerts.runScheduled();
        assertThat(jdbc.sql("SELECT details ->> 'text' FROM alert WHERE type = 'WEEKLY'").query(String.class).list())
                .containsExactly(TEXT);

        // The cached owner session is too old after the clock jump: sign in again.
        TestHttp.Response login = http.post(api("/api/auth/login"), Map.of("password", PASSWORD));
        assertThat(login.status()).as("owner sign-in").isIn(201, 204);
        String[] owner = {"Cookie", SessionService.COOKIE + "=" + login.cookie(SessionService.COOKIE)};

        TestHttp.Response report = http.get(api("/api/reports/last-week"), owner);
        assertThat(report.status()).isEqualTo(200);
        JsonNode week = report.json();
        assertThat(week.get("sent").asLong()).isEqualTo(2);
        assertThat(week.get("opened").asLong()).isZero();
        assertThat(week.get("replied").asLong()).isZero();
        assertThat(week.get("interviews").asLong()).isZero();
        assertThat(week.get("documentViews").asLong()).isZero();
        assertThat(week.has("from")).isTrue();
        assertThat(week.has("to")).isTrue();

        TestHttp.Response alertList = http.get(api("/api/alerts?status=all"), owner);
        assertThat(alertList.status()).isEqualTo(200);
        List<String> alertTexts = new ArrayList<>();
        for (JsonNode item : alertList.json().get("items")) {
            if ("WEEKLY".equals(item.get("type").asString())) {
                alertTexts.add(item.get("text").asString());
                assertThat(item.path("emailId").isNull() || item.path("emailId").isMissingNode()).isTrue();
            }
        }
        assertThat(alertTexts).containsExactly(TEXT);

        TestHttp.Response activity = http.get(api("/api/activity?since=0&limit=100"), owner);
        assertThat(activity.status()).isEqualTo(200);
        List<String> activityTexts = new ArrayList<>();
        for (JsonNode item : activity.json().get("items")) {
            if ("WEEKLY".equals(item.path("alertType").asString(""))) {
                assertThat(item.get("kind").asString()).isEqualTo("ALERT");
                assertThat(item.path("emailId").isNull() || item.path("emailId").isMissingNode()).isTrue();
                activityTexts.add(item.get("alertText").asString());
            }
        }
        assertThat(activityTexts).containsExactly(TEXT);
    }
}
