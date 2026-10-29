package com.mailpulse.settings;

import com.mailpulse.common.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class SettingsRepository {

    private final JdbcClient jdbc;

    SettingsRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    Settings load() {
        return jdbc.sql("SELECT * FROM settings WHERE id = 1").query(SettingsRepository::map).single();
    }

    void save(Settings s, Instant now) {
        jdbc.sql("""
                UPDATE settings SET
                    tracking_default = :trackingDefault, link_tracking_default = :linkTrackingDefault,
                    send_grace_seconds = :sendGrace, self_view_window_seconds = :selfViewWindow,
                    dedupe_window_seconds = :dedupeWindow, follow_up_hours = :followUpHours,
                    spike_opens = :spikeOpens, spike_window_minutes = :spikeWindow, revival_days = :revivalDays,
                    retention_days = :retentionDays, ip_mode = :ipMode, count_apple_prefetch = :countApplePrefetch,
                    notify_opens = :notifyOpens, notify_clicks = :notifyClicks, notify_alerts = :notifyAlerts,
                    time_zone = :timeZone, send_mode = :sendMode, dnr_blocking = :dnrBlocking,
                    track_confidential = :trackConfidential, updated_at = :now
                WHERE id = 1
                """)
                .param("trackingDefault", s.trackingDefault())
                .param("linkTrackingDefault", s.linkTrackingDefault())
                .param("sendGrace", s.sendGraceSeconds())
                .param("selfViewWindow", s.selfViewWindowSeconds())
                .param("dedupeWindow", s.dedupeWindowSeconds())
                .param("followUpHours", s.followUpHours())
                .param("spikeOpens", s.spikeOpens())
                .param("spikeWindow", s.spikeWindowMinutes())
                .param("revivalDays", s.revivalDays())
                .param("retentionDays", s.retentionDays())
                .param("ipMode", s.ipMode().name())
                .param("countApplePrefetch", s.countApplePrefetch())
                .param("notifyOpens", s.notifyOpens())
                .param("notifyClicks", s.notifyClicks())
                .param("notifyAlerts", s.notifyAlerts())
                .param("timeZone", s.timeZone())
                .param("sendMode", s.sendMode().name())
                .param("dnrBlocking", s.dnrBlocking())
                .param("trackConfidential", s.trackConfidential())
                .param("now", Sql.ts(now))
                .update();
    }

    private static Settings map(ResultSet rs, int row) throws SQLException {
        return new Settings(
                rs.getBoolean("tracking_default"),
                rs.getBoolean("link_tracking_default"),
                rs.getInt("send_grace_seconds"),
                rs.getInt("self_view_window_seconds"),
                rs.getInt("dedupe_window_seconds"),
                rs.getInt("follow_up_hours"),
                rs.getInt("spike_opens"),
                rs.getInt("spike_window_minutes"),
                rs.getInt("revival_days"),
                rs.getInt("retention_days"),
                Settings.IpMode.valueOf(rs.getString("ip_mode")),
                rs.getBoolean("count_apple_prefetch"),
                rs.getBoolean("notify_opens"),
                rs.getBoolean("notify_clicks"),
                rs.getBoolean("notify_alerts"),
                rs.getString("time_zone"),
                Settings.SendMode.valueOf(rs.getString("send_mode")),
                rs.getBoolean("dnr_blocking"),
                rs.getBoolean("track_confidential"));
    }
}
