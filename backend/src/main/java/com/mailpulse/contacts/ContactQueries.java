package com.mailpulse.contacts;

import com.mailpulse.common.Sql;
import com.mailpulse.common.web.ApiException;
import com.mailpulse.emails.AddressBook;
import com.mailpulse.emails.Addresses;
import com.mailpulse.emails.EmailApi;
import com.mailpulse.emails.EmailQueries;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * People the owner has emailed, with per-person totals. Addresses and names are encrypted, so
 * search and paging run in memory after decrypting (fine for one person's contacts).
 */
@Service
public class ContactQueries {

    static final int MAX_PAGE_SIZE = 100;
    private static final int MAX_EMAILS = 200;

    public record ContactSummary(
            String email,
            String name,
            int emails,
            int openedEmails,
            int opens,
            int clicks,
            Instant firstSeenAt,
            Instant lastEmailedAt,
            Instant lastOpenedAt) {}

    public record ContactDetail(ContactSummary summary, List<EmailApi.EmailSummary> emails) {}

    private record Row(UUID id, byte[] addressEnc, byte[] nameEnc, int emails, int openedEmails, int opens, int clicks,
            Instant firstSeenAt, Instant lastEmailedAt, Instant lastOpenedAt) {}

    /** One row per contact; a person on To and Cc of the same email counts that email once. */
    private static final String STATS = """
            SELECT c.id, c.address_enc, c.display_name_enc, c.first_seen_at,
                   count(te.id) AS emails,
                   count(te.id) FILTER (WHERE te.open_count > 0 OR te.click_count > 0) AS opened_emails,
                   COALESCE(sum(te.open_count), 0) AS opens,
                   COALESCE(sum(te.click_count), 0) AS clicks,
                   max(te.sent_at) AS last_emailed_at,
                   max(te.last_opened_at) AS last_opened_at
            FROM contact c
            JOIN (SELECT DISTINCT contact_id, tracked_email_id FROM recipient) r ON r.contact_id = c.id
            JOIN tracked_email te ON te.id = r.tracked_email_id AND te.status IN ('SENT', 'SCHEDULED')
            """;

    private final JdbcClient jdbc;
    private final AddressBook addressBook;
    private final EmailQueries emailQueries;

    ContactQueries(JdbcClient jdbc, AddressBook addressBook, EmailQueries emailQueries) {
        this.jdbc = jdbc;
        this.addressBook = addressBook;
        this.emailQueries = emailQueries;
    }

    public EmailApi.Page<ContactSummary> list(String text, int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw ApiException.badRequest("page must be >= 0 and size between 1 and " + MAX_PAGE_SIZE);
        }
        String needle = text == null ? "" : text.trim().toLowerCase(Locale.ROOT);
        List<ContactSummary> all = all().stream()
                .filter(contact -> needle.isEmpty() || contact.email().contains(needle)
                        || (contact.name() != null && contact.name().toLowerCase(Locale.ROOT).contains(needle)))
                .toList();
        int start = Math.min(all.size(), page * size);
        return new EmailApi.Page<>(all.subList(start, Math.min(all.size(), start + size)), page, size, all.size());
    }

    /** Every contact, most recently emailed first. */
    public List<ContactSummary> all() {
        return jdbc.sql(STATS + " GROUP BY c.id ORDER BY max(te.sent_at) DESC NULLS LAST, c.first_seen_at DESC")
                .query(ContactQueries::map)
                .list()
                .stream()
                .map(this::summary)
                .toList();
    }

    public ContactDetail detail(String address) {
        UUID id = addressBook.findContactId(Addresses.normalize(address))
                .orElseThrow(() -> ApiException.notFound("Contact not found"));
        ContactSummary summary = jdbc.sql(STATS + " WHERE c.id = :id GROUP BY c.id")
                .param("id", id)
                .query(ContactQueries::map)
                .optional()
                .map(this::summary)
                .orElseThrow(() -> ApiException.notFound("Contact not found"));
        List<UUID> emailIds = jdbc.sql("""
                SELECT te.id FROM tracked_email te
                WHERE te.status IN ('SENT', 'SCHEDULED')
                  AND EXISTS (SELECT 1 FROM recipient r WHERE r.tracked_email_id = te.id AND r.contact_id = :contact)
                ORDER BY te.sent_at DESC NULLS LAST LIMIT :limit
                """)
                .param("contact", id)
                .param("limit", MAX_EMAILS)
                .query((rs, row) -> Sql.uuid(rs, "id"))
                .list();
        return new ContactDetail(summary, emailQueries.summariesByIds(emailIds));
    }

    /** Address and name of contacts by id, for reports. */
    public List<ContactSummary> summariesByIds(List<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(STATS + " WHERE c.id IN (:ids) GROUP BY c.id").param("ids", ids).query(ContactQueries::map).list()
                .stream()
                .sorted((a, b) -> Integer.compare(ids.indexOf(a.id()), ids.indexOf(b.id())))
                .map(this::summary)
                .toList();
    }

    private ContactSummary summary(Row row) {
        return new ContactSummary(
                addressBook.contactAddress(row.addressEnc()),
                addressBook.contactName(row.nameEnc()),
                row.emails(),
                row.openedEmails(),
                row.opens(),
                row.clicks(),
                row.firstSeenAt(),
                row.lastEmailedAt(),
                row.lastOpenedAt());
    }

    private static Row map(ResultSet rs, int row) throws SQLException {
        return new Row(
                Sql.uuid(rs, "id"),
                rs.getBytes("address_enc"),
                rs.getBytes("display_name_enc"),
                rs.getInt("emails"),
                rs.getInt("opened_emails"),
                rs.getInt("opens"),
                rs.getInt("clicks"),
                Sql.instant(rs, "first_seen_at"),
                Sql.instant(rs, "last_emailed_at"),
                Sql.instant(rs, "last_opened_at"));
    }
}
