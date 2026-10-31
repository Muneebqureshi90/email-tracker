package com.mailpulse.applications;

import com.mailpulse.common.crypto.FieldCipher;
import com.mailpulse.common.web.ApiException;
import com.mailpulse.emails.EmailService;
import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/** Job application pipeline: list, add, change and delete applications. Company, role and notes are encrypted. */
@Service
public class JobApplicationService {

    static final String COMPANY_COLUMN = "job_application.company";
    static final String ROLE_COLUMN = "job_application.role";
    static final String NOTES_COLUMN = "job_application.notes";
    static final int MAX_APPLICATIONS = 1000;
    static final int MAX_TEXT = 200;
    static final int MAX_NOTES = 4000;
    private static final Set<String> FIELDS = Set.of("company", "role", "status", "appliedOn", "notes", "emailId");
    private static final Set<String> STATUSES = Set.of("APPLIED", "INTERVIEW", "OFFER", "REJECTED");

    private final JobApplicationRepository applications;
    private final FieldCipher cipher;
    private final Clock clock;

    JobApplicationService(JobApplicationRepository applications, FieldCipher cipher, Clock clock) {
        this.applications = applications;
        this.cipher = cipher;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<ApplicationView> list() {
        return applications.list().stream().map(this::view).toList();
    }

    @Transactional
    public ApplicationView create(ObjectNode body) {
        checkFields(body);
        if (!body.has("company")) {
            throw ApiException.badRequest("company is required");
        }
        String company = required(body.get("company"));
        String role = body.has("role") ? optional(body.get("role"), "role", MAX_TEXT) : null;
        String status = body.has("status") ? status(body.get("status")) : "APPLIED";
        LocalDate appliedOn = body.has("appliedOn") ? date(body.get("appliedOn")) : null;
        String notes = body.has("notes") ? optional(body.get("notes"), "notes", MAX_NOTES) : null;
        UUID emailId = body.has("emailId") ? emailId(body.get("emailId")) : null;
        applications.lockForInsert();
        if (applications.count() >= MAX_APPLICATIONS) {
            throw ApiException.badRequest("At most " + MAX_APPLICATIONS + " applications can be stored. Delete one first.");
        }
        UUID id = UUID.randomUUID();
        applications.insert(id, values(company, role, status, appliedOn, notes, emailId), clock.instant());
        return view(applications.find(id).orElseThrow());
    }

    @Transactional
    public ApplicationView update(UUID id, ObjectNode body) {
        JobApplicationRepository.Row row = applications.lock(id).orElseThrow(JobApplicationService::notFound);
        checkFields(body);
        String company = body.has("company") ? required(body.get("company")) : cipher.decrypt(row.companyEnc(), COMPANY_COLUMN);
        String role = body.has("role") ? optional(body.get("role"), "role", MAX_TEXT) : cipher.decrypt(row.roleEnc(), ROLE_COLUMN);
        String status = body.has("status") ? status(body.get("status")) : row.status();
        LocalDate appliedOn = body.has("appliedOn") ? date(body.get("appliedOn")) : row.appliedOn();
        String notes = body.has("notes") ? optional(body.get("notes"), "notes", MAX_NOTES) : cipher.decrypt(row.notesEnc(), NOTES_COLUMN);
        UUID emailId = body.has("emailId") ? emailId(body.get("emailId")) : row.emailId();
        applications.update(id, values(company, role, status, appliedOn, notes, emailId), clock.instant());
        return view(applications.find(id).orElseThrow());
    }

    @Transactional
    public void delete(UUID id) {
        if (!applications.delete(id)) {
            throw notFound();
        }
    }

    private JobApplicationRepository.Values values(
            String company, String role, String status, LocalDate appliedOn, String notes, UUID emailId) {
        return new JobApplicationRepository.Values(
                cipher.encrypt(company, COMPANY_COLUMN),
                cipher.encrypt(role, ROLE_COLUMN),
                status,
                appliedOn,
                cipher.encrypt(notes, NOTES_COLUMN),
                emailId);
    }

    private ApplicationView view(JobApplicationRepository.Row row) {
        return new ApplicationView(
                row.id(),
                cipher.decrypt(row.companyEnc(), COMPANY_COLUMN),
                cipher.decrypt(row.roleEnc(), ROLE_COLUMN),
                row.status(),
                row.appliedOn() == null ? null : row.appliedOn().toString(),
                cipher.decrypt(row.notesEnc(), NOTES_COLUMN),
                row.emailId(),
                row.emailId() == null ? null : cipher.decrypt(row.subjectEnc(), EmailService.SUBJECT_COLUMN),
                row.emailId() == null ? 0 : row.opens(),
                row.emailId() == null ? 0 : row.clicks(),
                row.createdAt(),
                row.updatedAt());
    }

    private static void checkFields(ObjectNode body) {
        if (!FIELDS.containsAll(body.propertyNames())) {
            throw ApiException.badRequest("Only company, role, status, appliedOn, notes and emailId can be set");
        }
    }

    private static String required(JsonNode value) {
        String text = optional(value, "company", MAX_TEXT);
        if (text == null) {
            throw ApiException.badRequest("company is required");
        }
        return text;
    }

    /** Trimmed text, or null for null or blank. */
    private static String optional(JsonNode value, String field, int max) {
        if (value.isNull()) {
            return null;
        }
        if (!value.isString()) {
            throw ApiException.badRequest(field + " must be text");
        }
        String text = value.asString().strip();
        if (text.isEmpty()) {
            return null;
        }
        if (text.codePointCount(0, text.length()) > max) {
            throw ApiException.badRequest(field + " must be at most " + max + " characters");
        }
        return text;
    }

    private static String status(JsonNode value) {
        if (!value.isString() || !STATUSES.contains(value.asString())) {
            throw ApiException.badRequest("status must be APPLIED, INTERVIEW, OFFER or REJECTED");
        }
        return value.asString();
    }

    private static LocalDate date(JsonNode value) {
        if (value.isNull()) {
            return null;
        }
        if (!value.isString() || value.asString().length() != 10) {
            throw ApiException.badRequest("appliedOn must be a date (YYYY-MM-DD)");
        }
        try {
            return LocalDate.parse(value.asString());
        } catch (DateTimeParseException e) {
            throw ApiException.badRequest("appliedOn must be a date (YYYY-MM-DD)");
        }
    }

    private UUID emailId(JsonNode value) {
        if (value.isNull()) {
            return null;
        }
        UUID id;
        try {
            if (!value.isString() || value.asString().length() != 36) {
                throw new IllegalArgumentException();
            }
            id = UUID.fromString(value.asString());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("emailId must be an email id");
        }
        if (!applications.emailExists(id)) {
            throw ApiException.notFound("Email not found");
        }
        return id;
    }

    private static ApiException notFound() {
        return ApiException.notFound("Application not found");
    }
}
