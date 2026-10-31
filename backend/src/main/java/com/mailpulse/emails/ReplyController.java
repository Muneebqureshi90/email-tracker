package com.mailpulse.emails;

import com.mailpulse.common.web.ApiException;
import jakarta.validation.Valid;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Reply detection: the extension reports that a reply appeared in the email's Gmail thread. Only the
 * time is stored, never the reply itself. Repeated reports keep the earliest time.
 */
@RestController
@RequestMapping("/api")
class ReplyController {

    private final EmailRepository emails;
    private final Clock clock;

    ReplyController(EmailRepository emails, Clock clock) {
        this.emails = emails;
        this.clock = clock;
    }

    @PostMapping("/emails/{id}/reply")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void reply(@PathVariable UUID id, @Valid @RequestBody EmailApi.ReplyRequest body) {
        EmailRepository.EmailRow email = emails.find(id).orElseThrow(() -> ApiException.notFound("Email not found"));
        Instant now = clock.instant();
        Instant at = body.repliedAt().isAfter(now) ? now : body.repliedAt();
        if (email.sentAt() != null && at.isBefore(email.sentAt())) {
            return;
        }
        emails.markReplied(id, at);
    }
}
