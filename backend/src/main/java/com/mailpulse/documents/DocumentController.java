package com.mailpulse.documents;

import com.mailpulse.auth.Roles;
import com.mailpulse.emails.EmailApi;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.node.ObjectNode;

/**
 * Documents API. Owner only, except the list and creating an email's link, which the extension token may use
 * too ("Insert tracked file", SecurityConfig).
 */
@RestController
@RequestMapping("/api")
class DocumentController {

    private final DocumentService commands;
    private final DocumentQueries queries;

    DocumentController(DocumentService commands, DocumentQueries queries) {
        this.commands = commands;
        this.queries = queries;
    }

    @GetMapping("/documents")
    List<DocumentApi.DocumentSummary> list() {
        return queries.list();
    }

    @PostMapping(path = "/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    DocumentApi.DocumentSummary upload(@RequestPart("file") MultipartFile file, @RequestParam(required = false) String name) {
        return commands.upload(file, name);
    }

    @GetMapping("/documents/{id}")
    DocumentApi.DocumentDetail detail(@PathVariable UUID id) {
        return queries.detail(id);
    }

    @PatchMapping("/documents/{id}")
    DocumentApi.DocumentSummary rename(@PathVariable UUID id, @Valid @RequestBody DocumentApi.Rename body) {
        return commands.rename(id, body.name());
    }

    @PutMapping(path = "/documents/{id}/file", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    DocumentApi.DocumentSummary replace(@PathVariable UUID id, @RequestPart("file") MultipartFile file) {
        return commands.replace(id, file);
    }

    @DeleteMapping("/documents/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID id) {
        commands.delete(id);
    }

    @GetMapping("/documents/{id}/pages")
    List<DocumentApi.PageTime> pages(@PathVariable UUID id) {
        return queries.pages(id);
    }

    @GetMapping("/documents/{id}/links")
    EmailApi.Page<DocumentApi.DocLinkView> links(
            @PathVariable UUID id, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
        return queries.links(id, page, size);
    }

    /** 201 for a new link; 200 with the email's existing working link when there is one. */
    @PostMapping("/documents/{id}/links")
    ResponseEntity<DocumentApi.DocLinkView> createLink(@PathVariable UUID id, @Valid @RequestBody DocumentApi.NewLink body) {
        DocumentService.LinkResult result = commands.createLink(id, body, isExtension());
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK).body(result.link());
    }

    @GetMapping("/documents/{id}/events")
    EmailApi.Page<DocumentApi.DocEventView> events(
            @PathVariable UUID id, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
        return queries.events(id, page, size);
    }

    @PatchMapping("/document-links/{linkId}")
    DocumentApi.DocLinkView updateLink(@PathVariable UUID linkId, @RequestBody ObjectNode body) {
        return commands.updateLink(linkId, body);
    }

    private static boolean isExtension() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null && authentication.getAuthorities().stream()
                .anyMatch(authority -> ("ROLE_" + Roles.EXTENSION).equals(authority.getAuthority()));
    }
}
