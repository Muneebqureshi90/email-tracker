package com.mailpulse.card;

import com.mailpulse.alerts.AlertService;
import com.mailpulse.common.web.ApiException;
import com.mailpulse.emails.EmailApi;
import com.mailpulse.emails.EmailQueries;
import com.mailpulse.emails.EmailRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** Everything the Gmail hover card shows for one email, in one request (extension token or owner). */
@RestController
class CardController {

    record Card(
            UUID emailId,
            String subject,
            List<EmailApi.Recipient> recipients,
            String account,
            String gmailThreadId,
            int openCount,
            Instant firstOpenedAt,
            Instant lastOpenedAt,
            List<Instant> recentOpens,
            int clickCount,
            Instant lastClickedAt,
            List<AlertService.AlertBrief> alerts,
            List<Object> documents) {}

    private final EmailRepository emails;
    private final EmailQueries queries;
    private final AlertService alerts;

    CardController(EmailRepository emails, EmailQueries queries, AlertService alerts) {
        this.emails = emails;
        this.queries = queries;
        this.alerts = alerts;
    }

    @GetMapping("/api/emails/{id}/card")
    Card card(@PathVariable UUID id) {
        EmailRepository.EmailRow row = emails.find(id).orElseThrow(() -> ApiException.notFound("Email not found"));
        EmailApi.EmailSummary summary = queries.summarize(List.of(row)).getFirst();
        return new Card(
                id,
                summary.subject(),
                summary.recipients(),
                summary.account(),
                row.gmailThreadId(),
                summary.openCount(),
                summary.firstOpenedAt(),
                summary.lastOpenedAt(),
                summary.recentOpens(),
                summary.clickCount(),
                summary.lastClickedAt(),
                alerts.activeForEmail(id),
                List.of());
    }
}
