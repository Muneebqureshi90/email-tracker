package com.mailpulse.emails;

import com.mailpulse.common.Sql;
import com.mailpulse.common.crypto.BlindIndex;
import com.mailpulse.common.crypto.FieldCipher;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Gmail accounts, contacts and recipients. Addresses and names are stored encrypted, found by blind index. */
@Repository
public class AddressBook {

    static final String ACCOUNT_ADDRESS = "gmail_account.address";
    static final String CONTACT_ADDRESS = "contact.address";
    static final String CONTACT_NAME = "contact.display_name";
    private static final String EMAIL_INDEX = "email";

    public record NewRecipient(String normalizedAddress, String name, EmailApi.RecipientKind kind) {}

    private final JdbcClient jdbc;
    private final FieldCipher cipher;
    private final BlindIndex index;

    AddressBook(JdbcClient jdbc, FieldCipher cipher, BlindIndex index) {
        this.jdbc = jdbc;
        this.cipher = cipher;
        this.index = index;
    }

    UUID accountId(String normalizedAddress, Instant now) {
        byte[] hash = index.of(EMAIL_INDEX, normalizedAddress);
        return jdbc.sql("""
                INSERT INTO gmail_account (id, address_enc, address_hash, created_at) VALUES (:id, :enc, :hash, :now)
                ON CONFLICT (address_hash) DO UPDATE SET address_hash = EXCLUDED.address_hash
                RETURNING id
                """)
                .param("id", UUID.randomUUID())
                .param("enc", cipher.encrypt(normalizedAddress, ACCOUNT_ADDRESS))
                .param("hash", hash)
                .param("now", Sql.ts(now))
                .query((rs, row) -> Sql.uuid(rs, "id"))
                .single();
    }

    public Optional<UUID> findAccountId(String normalizedAddress) {
        return jdbc.sql("SELECT id FROM gmail_account WHERE address_hash = :hash")
                .param("hash", index.of(EMAIL_INDEX, normalizedAddress))
                .query((rs, row) -> Sql.uuid(rs, "id"))
                .optional();
    }

    public String accountAddress(byte[] encrypted) {
        return cipher.decrypt(encrypted, ACCOUNT_ADDRESS);
    }

    /** Replaces the recipients of an email, creating or updating contacts. */
    void replaceRecipients(UUID emailId, List<NewRecipient> recipients, Instant now) {
        jdbc.sql("DELETE FROM recipient WHERE tracked_email_id = :email").param("email", emailId).update();
        int position = 0;
        for (NewRecipient recipient : recipients) {
            UUID contactId = upsertContact(recipient.normalizedAddress(), recipient.name(), now);
            jdbc.sql("""
                    INSERT INTO recipient (id, tracked_email_id, contact_id, kind, position)
                    VALUES (:id, :email, :contact, :kind, :position)
                    """)
                    .param("id", UUID.randomUUID())
                    .param("email", emailId)
                    .param("contact", contactId)
                    .param("kind", recipient.kind().name())
                    .param("position", position++)
                    .update();
        }
    }

    public Map<UUID, List<EmailApi.Recipient>> recipientsOf(Collection<UUID> emailIds) {
        Map<UUID, List<EmailApi.Recipient>> result = new LinkedHashMap<>();
        if (emailIds.isEmpty()) {
            return result;
        }
        jdbc.sql("""
                SELECT r.tracked_email_id, r.kind, c.address_enc, c.display_name_enc
                FROM recipient r JOIN contact c ON c.id = r.contact_id
                WHERE r.tracked_email_id IN (:ids) ORDER BY r.tracked_email_id, r.position
                """)
                .param("ids", emailIds)
                .query(rs -> {
                    result.computeIfAbsent(Sql.uuid(rs, "tracked_email_id"), id -> new ArrayList<>())
                            .add(new EmailApi.Recipient(
                                    cipher.decrypt(rs.getBytes("address_enc"), CONTACT_ADDRESS),
                                    cipher.decrypt(rs.getBytes("display_name_enc"), CONTACT_NAME),
                                    EmailApi.RecipientKind.valueOf(rs.getString("kind"))));
                });
        return result;
    }

    private UUID upsertContact(String normalizedAddress, String name, Instant now) {
        String cleanName = name == null || name.isBlank() ? null : name.trim();
        return jdbc.sql("""
                INSERT INTO contact (id, address_enc, address_hash, display_name_enc, first_seen_at, last_emailed_at)
                VALUES (:id, :enc, :hash, :name, :now, :now)
                ON CONFLICT (address_hash) DO UPDATE SET
                    last_emailed_at = EXCLUDED.last_emailed_at,
                    display_name_enc = COALESCE(EXCLUDED.display_name_enc, contact.display_name_enc)
                RETURNING id
                """)
                .param("id", UUID.randomUUID())
                .param("enc", cipher.encrypt(normalizedAddress, CONTACT_ADDRESS))
                .param("hash", index.of(EMAIL_INDEX, normalizedAddress))
                .param("name", cipher.encrypt(cleanName, CONTACT_NAME))
                .param("now", Sql.ts(now))
                .query((rs, row) -> Sql.uuid(rs, "id"))
                .single();
    }
}
