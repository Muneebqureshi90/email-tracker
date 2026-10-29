package com.mailpulse.emails;

import com.mailpulse.common.MailPulseProperties;
import com.mailpulse.common.RandomTokens;
import com.mailpulse.common.crypto.FieldCipher;
import com.mailpulse.common.web.ApiException;
import com.mailpulse.settings.Settings;
import com.mailpulse.settings.SettingsService;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Write side of the email API: registration during compose, link registration, send events, preferences. */
@Service
public class EmailService {

    public static final String SUBJECT_COLUMN = "tracked_email.subject";
    private static final Duration SENT_AT_TOLERANCE = Duration.ofMinutes(1);

    private final EmailRepository emails;
    private final AddressBook addressBook;
    private final LinkRepository links;
    private final SettingsService settings;
    private final FieldCipher cipher;
    private final MailPulseProperties properties;
    private final Clock clock;

    EmailService(
            EmailRepository emails,
            AddressBook addressBook,
            LinkRepository links,
            SettingsService settings,
            FieldCipher cipher,
            MailPulseProperties properties,
            Clock clock) {
        this.emails = emails;
        this.addressBook = addressBook;
        this.links = links;
        this.settings = settings;
        this.cipher = cipher;
        this.properties = properties;
        this.clock = clock;
    }

    /** Idempotent on clientRef: the extension may retry without creating a second email. */
    @Transactional
    public EmailApi.RegisterEmailResponse register(EmailApi.RegisterEmailRequest request) {
        var existing = emails.findByClientRef(request.clientRef());
        if (existing.isPresent()) {
            var email = existing.get();
            String token = emails.pixelToken(email.id()).orElseThrow();
            return new EmailApi.RegisterEmailResponse(email.id(), pixelUrl(token), email.trackOpens(), email.trackLinks(), false);
        }
        Settings current = settings.current();
        Instant now = clock.instant();
        UUID accountId = addressBook.accountId(Addresses.normalize(request.account()), now);
        boolean trackOpens = request.trackOpens() == null ? current.trackingDefault() : request.trackOpens();
        boolean trackLinks = request.trackLinks() == null ? current.linkTrackingDefault() : request.trackLinks();
        UUID id = UUID.randomUUID();
        emails.insert(id, accountId, request.clientRef(), trackOpens, trackLinks, now);
        String token = RandomTokens.trackingToken();
        emails.insertPixelToken(token, id, now);
        return new EmailApi.RegisterEmailResponse(id, pixelUrl(token), trackOpens, trackLinks, true);
    }

    @Transactional
    public EmailApi.RegisterLinksResponse registerLinks(UUID emailId, List<String> urls) {
        requireEmail(emailId);
        Instant now = clock.instant();
        List<EmailApi.TrackedLink> tracked = new ArrayList<>();
        List<String> rejected = new ArrayList<>();
        for (String candidate : new LinkedHashSet<>(urls)) {
            var url = LinkUrls.validate(candidate);
            if (url.isEmpty()) {
                rejected.add(candidate);
                continue;
            }
            LinkRepository.StoredLink link = links.findOrCreate(emailId, url.get(), now);
            tracked.add(new EmailApi.TrackedLink(link.id(), url.get(), properties.publicBaseUrl() + "/c/" + link.token()));
        }
        return new EmailApi.RegisterLinksResponse(tracked, rejected);
    }

    @Transactional
    public void update(UUID emailId, EmailApi.UpdateEmailRequest request) {
        var email = requireEmail(emailId);
        EmailStatus target = request.status();
        if (target == EmailStatus.DRAFT) {
            throw ApiException.badRequest("status must be SENT, SCHEDULED or CANCELLED");
        }
        Instant now = clock.instant();
        Instant sentAt = email.sentAt();
        Instant cancelledAt = email.cancelledAt();
        if (target == EmailStatus.SENT) {
            if (email.status() != EmailStatus.SENT || sentAt == null) {
                sentAt = plausibleSendTime(request.sentAt(), email.createdAt(), now);
            }
            cancelledAt = null;
        } else if (target == EmailStatus.CANCELLED) {
            cancelledAt = now;
        }
        byte[] subject = request.subject() == null ? email.subjectEnc() : cipher.encrypt(request.subject(), SUBJECT_COLUMN);
        boolean unreliable = email.openStatusUnreliable();
        if (request.recipients() != null) {
            List<AddressBook.NewRecipient> recipients = request.recipients().stream()
                    .map(r -> new AddressBook.NewRecipient(Addresses.normalize(r.email()), r.name(), r.kind()))
                    .toList();
            addressBook.replaceRecipients(emailId, recipients, now);
            unreliable = Addresses.allBlockImages(recipients.stream().map(AddressBook.NewRecipient::normalizedAddress).toList());
        }
        emails.saveSendState(
                emailId,
                target,
                sentAt,
                cancelledAt,
                request.gmailMessageId() == null ? email.gmailMessageId() : request.gmailMessageId(),
                request.gmailThreadId() == null ? email.gmailThreadId() : request.gmailThreadId(),
                subject,
                unreliable);
        if (request.usedLinkIds() != null) {
            links.setUsed(emailId, request.usedLinkIds());
        }
    }

    public EmailApi.TokenLookup findByPixelToken(String token) {
        if (!RandomTokens.isTrackingToken(token)) {
            throw ApiException.notFound("Email not found");
        }
        return emails.findByPixelToken(token)
                .map(email -> new EmailApi.TokenLookup(email.id(), email.status()))
                .orElseThrow(() -> ApiException.notFound("Email not found"));
    }

    @Transactional
    public void updatePreferences(UUID emailId, EmailApi.PreferencesRequest request) {
        var email = requireEmail(emailId);
        Integer followUp = email.followUpHours();
        if (request.followUpHours() != null) {
            int hours = request.followUpHours();
            if (hours != 0 && !Settings.FOLLOW_UP_OPTIONS.contains(hours)) {
                throw ApiException.badRequest("followUpHours must be 0, 24, 48 or 72");
            }
            followUp = hours == 0 ? null : hours;
        }
        emails.updatePreferences(
                emailId,
                request.notifications() == null ? email.notifications() : request.notifications(),
                followUp,
                request.trackingEnabled() == null ? email.trackingEnabled() : request.trackingEnabled());
    }

    private EmailRepository.EmailRow requireEmail(UUID emailId) {
        return emails.find(emailId).orElseThrow(() -> ApiException.notFound("Email not found"));
    }

    private String pixelUrl(String token) {
        return properties.publicBaseUrl() + "/t/" + token + ".gif";
    }

    /** Uses the browser's send time when it is believable, otherwise the server's clock. */
    private static Instant plausibleSendTime(Instant claimed, Instant createdAt, Instant now) {
        if (claimed == null
                || claimed.isBefore(createdAt.minus(SENT_AT_TOLERANCE))
                || claimed.isAfter(now.plus(SENT_AT_TOLERANCE))) {
            return now;
        }
        return claimed;
    }
}
