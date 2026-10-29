package com.mailpulse.tracking;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.emails.EmailStatus;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class TrackingRulesTest {

    private static final Instant SENT = Instant.parse("2026-10-29T10:00:00Z");
    private static final Duration GRACE = Duration.ofSeconds(10);

    @ParameterizedTest
    @CsvSource(delimiter = '|', textBlock = """
            Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy) | GMAIL_PROXY
            Mozilla/5.0 (compatible; YahooMailProxy; https://help.yahoo.com/kb/yahoo-mail-proxy-SLN28749.html) | YAHOO_PROXY
            Mozilla/5.0 | APPLE_MPP
            curl/8.9.0 | SCANNER
            Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html) | SCANNER
            python-requests/2.32 | SCANNER
            Slackbot-LinkExpanding 1.0 | SCANNER
            Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 | DIRECT
            """)
    void classifiesUserAgents(String userAgent, Source expected) {
        assertThat(EventClassifier.source(userAgent)).isEqualTo(expected);
    }

    @Test
    void missingUserAgentIsUnknown() {
        assertThat(EventClassifier.source(null)).isEqualTo(Source.UNKNOWN);
        assertThat(EventClassifier.source("  ")).isEqualTo(Source.UNKNOWN);
    }

    @Test
    void immediateReasonsInPriorityOrder() {
        assertThat(EventClassifier.immediateReason(raw("GET", true), Source.DIRECT, true, false)).contains(Reason.SELF);
        assertThat(EventClassifier.immediateReason(raw("GET", false), Source.DIRECT, false, false)).contains(Reason.TRACKING_OFF);
        assertThat(EventClassifier.immediateReason(raw("HEAD", false), Source.GMAIL_PROXY, true, false)).contains(Reason.BOT_HEAD);
        assertThat(EventClassifier.immediateReason(raw("GET", false), Source.SCANNER, true, false)).contains(Reason.BOT_UA);
        assertThat(EventClassifier.immediateReason(raw("GET", false), Source.APPLE_MPP, true, false)).contains(Reason.PREFETCH);
        assertThat(EventClassifier.immediateReason(raw("GET", false), Source.APPLE_MPP, true, true)).isEmpty();
        assertThat(EventClassifier.immediateReason(raw("GET", false), Source.GMAIL_PROXY, true, false)).isEmpty();
    }

    @Test
    void sourceKeyGroupsProxiesAndSeparatesDirectClients() {
        assertThat(EventClassifier.sourceKey(Source.GMAIL_PROXY, "66.249.84.0/24", "x")).isEqualTo("GMAIL_PROXY");
        String a = EventClassifier.sourceKey(Source.DIRECT, "203.0.113.0/24", "UA one");
        assertThat(a).startsWith("203.0.113.0/24|").hasSize("203.0.113.0/24|".length() + 16);
        assertThat(EventClassifier.sourceKey(Source.DIRECT, "203.0.113.0/24", "UA two")).isNotEqualTo(a);
        assertThat(EventClassifier.sourceKey(Source.DIRECT, null, "UA one")).startsWith("-|");
    }

    @Test
    void selfViewWinsOverEverything() {
        assertThat(decide(SENT.plusSeconds(60), Source.GMAIL_PROXY, EmailStatus.SENT, true, true)).contains(Reason.SELF_VIEW);
    }

    @Test
    void sendGraceIgnoresEarlyOpensOnly() {
        assertThat(decide(SENT.plusSeconds(9), Source.GMAIL_PROXY, EmailStatus.SENT, false, false)).contains(Reason.SEND_GRACE);
        assertThat(decide(SENT.plusSeconds(10), Source.GMAIL_PROXY, EmailStatus.SENT, false, false)).isEmpty();
    }

    @Test
    void unsentDraftCountsOnlyThroughAMailProxy() {
        var direct = new FinalizerRules.Facts(SENT, Source.DIRECT, EmailStatus.DRAFT, null, false, false);
        var proxied = new FinalizerRules.Facts(SENT, Source.GMAIL_PROXY, EmailStatus.DRAFT, null, false, false);
        assertThat(FinalizerRules.decide(direct, GRACE)).contains(Reason.BEFORE_SEND);
        assertThat(FinalizerRules.decide(proxied, GRACE)).isEmpty();
    }

    @Test
    void duplicatesAreIgnored() {
        assertThat(decide(SENT.plusSeconds(60), Source.GMAIL_PROXY, EmailStatus.SENT, false, true)).contains(Reason.DUPLICATE);
    }

    private static java.util.Optional<Reason> decide(
            Instant receivedAt, Source source, EmailStatus status, boolean selfView, boolean duplicate) {
        return FinalizerRules.decide(new FinalizerRules.Facts(receivedAt, source, status, SENT, selfView, duplicate), GRACE);
    }

    private static RawEvent raw(String method, boolean self) {
        return new RawEvent(EventType.OPEN, "t", SENT, method, "ua", null, self);
    }
}
