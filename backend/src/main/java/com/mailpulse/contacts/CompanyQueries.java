package com.mailpulse.contacts;

import com.mailpulse.common.Sql;
import com.mailpulse.emails.AddressBook;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * Contacts grouped by the domain of their address, so the owner sees which companies engage.
 * Addresses are encrypted, so grouping runs in memory after decrypting (fine at personal scale).
 * Free-mail addresses share one group with a null domain.
 */
@Service
public class CompanyQueries {

    static final Set<String> PERSONAL_DOMAINS = Set.of(
            "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com",
            "proton.me", "protonmail.com", "aol.com", "gmx.com", "yandex.com", "mail.com");

    public record CompanySummary(
            String domain, int contacts, int emails, int opened, int clicked, int replied, Instant lastActivityAt) {}

    private record Row(UUID contactId, byte[] addressEnc, UUID emailId, boolean opened, boolean clicked,
            boolean replied, Instant activityAt) {}

    /** One row per contact and email; a person on To and Cc of the same email appears once. */
    private static final String ROWS = """
            SELECT c.id AS contact_id, c.address_enc, te.id AS email_id,
                   (te.open_count > 0 OR te.click_count > 0) AS opened,
                   (te.click_count > 0) AS clicked,
                   (te.replied_at IS NOT NULL) AS replied,
                   GREATEST(te.sent_at, te.last_opened_at, te.replied_at) AS activity_at
            FROM contact c
            JOIN (SELECT DISTINCT contact_id, tracked_email_id FROM recipient) r ON r.contact_id = c.id
            JOIN tracked_email te ON te.id = r.tracked_email_id AND te.status IN ('SENT', 'SCHEDULED')
            """;

    private final JdbcClient jdbc;
    private final AddressBook addressBook;

    CompanyQueries(JdbcClient jdbc, AddressBook addressBook) {
        this.jdbc = jdbc;
        this.addressBook = addressBook;
    }

    /** Every company, most emailed first, then most recent activity. */
    public List<CompanySummary> all() {
        Map<UUID, String> domains = new HashMap<>();
        Map<Optional<String>, Group> groups = new LinkedHashMap<>();
        for (Row row : jdbc.sql(ROWS).query(CompanyQueries::map).list()) {
            String domain = domains.computeIfAbsent(row.contactId(),
                    id -> companyDomain(addressBook.contactAddress(row.addressEnc())));
            groups.computeIfAbsent(Optional.ofNullable(domain), key -> new Group()).add(row);
        }
        return groups.entrySet().stream()
                .map(entry -> entry.getValue().summary(entry.getKey().orElse(null)))
                .sorted(Comparator.comparingInt(CompanySummary::emails).reversed()
                        .thenComparing(CompanySummary::lastActivityAt, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(CompanySummary::domain, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
    }

    /** The lower-case domain of an address, or null for free-mail and malformed addresses. */
    static String companyDomain(String address) {
        if (address == null) {
            return null;
        }
        int at = address.lastIndexOf('@');
        if (at < 0 || at == address.length() - 1) {
            return null;
        }
        String domain = address.substring(at + 1).trim().toLowerCase(Locale.ROOT);
        return domain.isEmpty() || PERSONAL_DOMAINS.contains(domain) ? null : domain;
    }

    private static final class Group {
        private final Set<UUID> contacts = new HashSet<>();
        private final Set<UUID> emails = new HashSet<>();
        private final Set<UUID> opened = new HashSet<>();
        private final Set<UUID> clicked = new HashSet<>();
        private final Set<UUID> replied = new HashSet<>();
        private Instant lastActivityAt;

        void add(Row row) {
            contacts.add(row.contactId());
            emails.add(row.emailId());
            if (row.opened()) {
                opened.add(row.emailId());
            }
            if (row.clicked()) {
                clicked.add(row.emailId());
            }
            if (row.replied()) {
                replied.add(row.emailId());
            }
            if (row.activityAt() != null && (lastActivityAt == null || row.activityAt().isAfter(lastActivityAt))) {
                lastActivityAt = row.activityAt();
            }
        }

        CompanySummary summary(String domain) {
            return new CompanySummary(domain, contacts.size(), emails.size(), opened.size(), clicked.size(),
                    replied.size(), lastActivityAt);
        }
    }

    private static Row map(ResultSet rs, int row) throws SQLException {
        return new Row(
                Sql.uuid(rs, "contact_id"),
                rs.getBytes("address_enc"),
                Sql.uuid(rs, "email_id"),
                rs.getBoolean("opened"),
                rs.getBoolean("clicked"),
                rs.getBoolean("replied"),
                Sql.instant(rs, "activity_at"));
    }
}
