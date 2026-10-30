package com.mailpulse.search;

import com.mailpulse.common.web.ApiException;
import com.mailpulse.contacts.ContactQueries;
import com.mailpulse.emails.EmailApi;
import com.mailpulse.emails.EmailQueries;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Ctrl+K quick search across emails, contacts and documents (owner only), a few of each. */
@RestController
class SearchController {

    static final int PER_KIND = 5;
    static final int MIN_LENGTH = 2;
    static final int MAX_LENGTH = 200;

    record SearchResults(List<EmailApi.EmailSummary> emails, List<ContactQueries.ContactSummary> contacts, List<Object> documents) {}

    private final EmailQueries emails;
    private final ContactQueries contacts;

    SearchController(EmailQueries emails, ContactQueries contacts) {
        this.emails = emails;
        this.contacts = contacts;
    }

    @GetMapping("/api/search")
    SearchResults search(@RequestParam(required = false) String q) {
        String text = q == null ? "" : q.trim();
        if (text.length() < MIN_LENGTH || text.length() > MAX_LENGTH) {
            throw ApiException.badRequest("q must be 2 to 200 characters");
        }
        return new SearchResults(emails.quickSearch(text, PER_KIND), contacts.quickSearch(text, PER_KIND), List.of());
    }
}
