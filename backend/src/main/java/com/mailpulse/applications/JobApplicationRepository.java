package com.mailpulse.applications;

import com.mailpulse.common.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Job applications, joined with their tracked email for its subject and counts. */
@Repository
class JobApplicationRepository {

    record Row(
            UUID id,
            byte[] companyEnc,
            byte[] roleEnc,
            String status,
            LocalDate appliedOn,
            byte[] notesEnc,
            UUID emailId,
            byte[] subjectEnc,
            long opens,
            long clicks,
            Instant createdAt,
            Instant updatedAt) {}

    /** The stored fields of one application (text already encrypted). */
    record Values(byte[] companyEnc, byte[] roleEnc, String status, LocalDate appliedOn, byte[] notesEnc, UUID emailId) {}

    private static final String SELECT = """
            SELECT a.id, a.company_enc, a.role_enc, a.status, a.applied_on, a.notes_enc, te.id AS email_id,
                   te.subject_enc, COALESCE(te.open_count, 0) AS opens, COALESCE(te.click_count, 0) AS clicks,
                   a.created_at, a.updated_at
            FROM job_application a LEFT JOIN tracked_email te ON te.id = a.email_id
            """;

    private final JdbcClient jdbc;

    JobApplicationRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Serializes inserts, so two at once cannot both pass the application limit. */
    void lockForInsert() {
        jdbc.sql("LOCK TABLE job_application IN SHARE ROW EXCLUSIVE MODE").update();
    }

    long count() {
        return jdbc.sql("SELECT count(*) FROM job_application").query(Long.class).single();
    }

    boolean emailExists(UUID emailId) {
        return jdbc.sql("SELECT count(*) FROM tracked_email WHERE id = :id").param("id", emailId)
                .query(Long.class).single() > 0;
    }

    List<Row> list() {
        return jdbc.sql(SELECT + " ORDER BY a.created_at DESC, a.id DESC").query(JobApplicationRepository::row).list();
    }

    Optional<Row> find(UUID id) {
        return jdbc.sql(SELECT + " WHERE a.id = :id").param("id", id).query(JobApplicationRepository::row).optional();
    }

    /** Locks the application row for an update. */
    Optional<Row> lock(UUID id) {
        return jdbc.sql(SELECT + " WHERE a.id = :id FOR UPDATE OF a").param("id", id)
                .query(JobApplicationRepository::row).optional();
    }

    void insert(UUID id, Values values, Instant now) {
        jdbc.sql("""
                INSERT INTO job_application (id, company_enc, role_enc, status, applied_on, notes_enc, email_id, created_at, updated_at)
                VALUES (:id, :company, :role, :status, :appliedOn, :notes, :emailId, :now, :now)
                """)
                .param("id", id)
                .param("company", values.companyEnc())
                .param("role", values.roleEnc())
                .param("status", values.status())
                .param("appliedOn", values.appliedOn())
                .param("notes", values.notesEnc())
                .param("emailId", values.emailId())
                .param("now", Sql.ts(now))
                .update();
    }

    void update(UUID id, Values values, Instant now) {
        jdbc.sql("""
                UPDATE job_application SET company_enc = :company, role_enc = :role, status = :status,
                    applied_on = :appliedOn, notes_enc = :notes, email_id = :emailId, updated_at = :now
                WHERE id = :id
                """)
                .param("id", id)
                .param("company", values.companyEnc())
                .param("role", values.roleEnc())
                .param("status", values.status())
                .param("appliedOn", values.appliedOn())
                .param("notes", values.notesEnc())
                .param("emailId", values.emailId())
                .param("now", Sql.ts(now))
                .update();
    }

    boolean delete(UUID id) {
        return jdbc.sql("DELETE FROM job_application WHERE id = :id").param("id", id).update() > 0;
    }

    private static Row row(ResultSet rs, int rowNum) throws SQLException {
        return new Row(
                Sql.uuid(rs, "id"),
                rs.getBytes("company_enc"),
                rs.getBytes("role_enc"),
                rs.getString("status"),
                rs.getObject("applied_on", LocalDate.class),
                rs.getBytes("notes_enc"),
                Sql.uuid(rs, "email_id"),
                rs.getBytes("subject_enc"),
                rs.getLong("opens"),
                rs.getLong("clicks"),
                Sql.instant(rs, "created_at"),
                Sql.instant(rs, "updated_at"));
    }
}
