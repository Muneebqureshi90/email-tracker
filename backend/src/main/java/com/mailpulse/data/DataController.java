package com.mailpulse.data;

import com.mailpulse.auth.OwnerService;
import com.mailpulse.common.web.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Clock;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Export everything, or delete every email, event and document with its links (account, settings and tokens
 * stay; DECISIONS D-085).
 */
@RestController
class DataController {

    static final String CONFIRMATION = "DELETE ALL MY DATA";
    private static final DateTimeFormatter FILE_TIME = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC);

    record DeleteRequest(@NotBlank @Size(max = 40) String confirm, @NotBlank @Size(max = 200) String password) {}

    private final ExportService exports;
    private final OwnerService owner;
    private final JdbcClient jdbc;
    private final Clock clock;

    DataController(ExportService exports, OwnerService owner, JdbcClient jdbc, Clock clock) {
        this.exports = exports;
        this.owner = owner;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @GetMapping("/api/export")
    ResponseEntity<ExportService.Export> export() {
        String file = "mailpulse-export-" + FILE_TIME.format(clock.instant()) + ".json";
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file).build().toString())
                .body(exports.export());
    }

    /** One TRUNCATE, so it is atomic without a surrounding transaction (which would also undo a failed-login count). */
    @DeleteMapping("/api/data")
    ResponseEntity<Void> deleteAll(@Valid @RequestBody DeleteRequest body) {
        if (!CONFIRMATION.equals(body.confirm())) {
            throw ApiException.badRequest("Type " + CONFIRMATION + " to confirm");
        }
        owner.verifyLogin(body.password());
        jdbc.sql("TRUNCATE activity, alert, document_page_time, document_event, document_view, document_link, document_file,"
                        + " document, tracking_event, self_view, tracked_link, tracking_token, recipient, job_application,"
                        + " tracked_email, contact, gmail_account")
                .update();
        return ResponseEntity.noContent().build();
    }
}
