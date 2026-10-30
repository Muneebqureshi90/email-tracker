package com.mailpulse.data;

import com.mailpulse.contacts.ContactQueries;
import com.mailpulse.documents.DocumentQueries;
import com.mailpulse.emails.EmailApi;
import com.mailpulse.emails.EmailQueries;
import com.mailpulse.emails.EmailRepository;
import com.mailpulse.emails.LinkRepository;
import com.mailpulse.settings.Settings;
import com.mailpulse.settings.SettingsService;
import com.mailpulse.tracking.TrackingEventRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** Everything MailPulse stores, decrypted, as one JSON document for the owner to keep. */
@Service
class ExportService {

    static final String FORMAT = "mailpulse-export-v1";

    record ExportedEmail(
            EmailApi.EmailSummary summary,
            boolean trackOpens,
            boolean trackLinks,
            boolean trackingEnabled,
            boolean notifications,
            Integer followUpHours,
            String gmailMessageId,
            String gmailThreadId,
            Instant cancelledAt,
            List<EmailApi.LinkView> links,
            List<EmailApi.EventView> events) {}

    /** @param documents every document with its links and events (names and labels, never the files) */
    record Export(
            String format,
            Instant exportedAt,
            Settings settings,
            List<String> accounts,
            List<ExportedEmail> emails,
            List<ContactQueries.ContactSummary> contacts,
            List<DocumentQueries.ExportedDocument> documents) {}

    private final EmailRepository emails;
    private final EmailQueries emailQueries;
    private final LinkRepository links;
    private final TrackingEventRepository events;
    private final ContactQueries contacts;
    private final DocumentQueries documents;
    private final SettingsService settings;
    private final Clock clock;

    ExportService(
            EmailRepository emails,
            EmailQueries emailQueries,
            LinkRepository links,
            TrackingEventRepository events,
            ContactQueries contacts,
            DocumentQueries documents,
            SettingsService settings,
            Clock clock) {
        this.emails = emails;
        this.emailQueries = emailQueries;
        this.links = links;
        this.events = events;
        this.contacts = contacts;
        this.documents = documents;
        this.settings = settings;
        this.clock = clock;
    }

    Export export() {
        List<EmailRepository.EmailRow> rows = emails.findAll();
        List<EmailApi.EmailSummary> summaries = emailQueries.summarize(rows);
        Map<UUID, List<EmailApi.LinkView>> linksByEmail = links.findAllByEmail();
        Map<UUID, List<EmailApi.EventView>> eventsByEmail = events.findAllByEmail();
        List<ExportedEmail> exported = new ArrayList<>(rows.size());
        for (int i = 0; i < rows.size(); i++) {
            EmailRepository.EmailRow row = rows.get(i);
            exported.add(new ExportedEmail(
                    summaries.get(i),
                    row.trackOpens(),
                    row.trackLinks(),
                    row.trackingEnabled(),
                    row.notifications(),
                    row.followUpHours(),
                    row.gmailMessageId(),
                    row.gmailThreadId(),
                    row.cancelledAt(),
                    linksByEmail.getOrDefault(row.id(), List.of()),
                    eventsByEmail.getOrDefault(row.id(), List.of())));
        }
        return new Export(
                FORMAT,
                clock.instant(),
                settings.current(),
                emailQueries.accounts(),
                exported,
                contacts.all(),
                documents.exportAll());
    }
}
