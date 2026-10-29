package com.mailpulse.contacts;

import com.mailpulse.emails.EmailApi;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
class ContactController {

    private final ContactQueries contacts;

    ContactController(ContactQueries contacts) {
        this.contacts = contacts;
    }

    @GetMapping("/api/contacts")
    EmailApi.Page<ContactQueries.ContactSummary> list(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size) {
        return contacts.list(q, page, size);
    }

    @GetMapping("/api/contacts/{address}")
    ContactQueries.ContactDetail detail(@PathVariable String address) {
        return contacts.detail(address);
    }
}
