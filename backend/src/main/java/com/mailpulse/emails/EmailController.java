package com.mailpulse.emails;

import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
class EmailController {

    private final EmailService commands;
    private final EmailQueries queries;

    EmailController(EmailService commands, EmailQueries queries) {
        this.commands = commands;
        this.queries = queries;
    }

    @PostMapping("/emails")
    ResponseEntity<EmailApi.RegisterEmailResponse> register(@Valid @RequestBody EmailApi.RegisterEmailRequest body) {
        EmailApi.RegisterEmailResponse response = commands.register(body);
        return ResponseEntity.status(response.created() ? HttpStatus.CREATED : HttpStatus.OK).body(response);
    }

    @PostMapping("/emails/{id}/links")
    EmailApi.RegisterLinksResponse registerLinks(@PathVariable UUID id, @Valid @RequestBody EmailApi.RegisterLinksRequest body) {
        return commands.registerLinks(id, body.urls());
    }

    @PatchMapping("/emails/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void update(@PathVariable UUID id, @Valid @RequestBody EmailApi.UpdateEmailRequest body) {
        commands.update(id, body);
    }

    @PatchMapping("/emails/{id}/preferences")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void preferences(@PathVariable UUID id, @RequestBody EmailApi.PreferencesRequest body) {
        commands.updatePreferences(id, body);
    }

    @GetMapping("/emails/by-token/{token}")
    EmailApi.TokenLookup byToken(@PathVariable String token) {
        return commands.findByPixelToken(token);
    }

    @GetMapping("/emails")
    EmailApi.Page<EmailApi.EmailSummary> list(
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String account,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size) {
        return queries.list(state, account, from, to, q, page, size);
    }

    @GetMapping("/emails/{id}")
    EmailApi.EmailDetail detail(@PathVariable UUID id) {
        return queries.detail(id);
    }

    @GetMapping("/marks")
    EmailApi.MarksResponse marks(
            @RequestParam String account,
            @RequestParam(required = false) List<String> threadIds,
            @RequestParam(required = false) List<String> messageIds) {
        return queries.marks(account, threadIds, messageIds);
    }
}
