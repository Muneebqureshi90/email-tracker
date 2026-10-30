package com.mailpulse.settings;

import com.mailpulse.common.web.ApiException;
import java.time.Clock;
import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Service;

@Service
public class SettingsService {

    private final SettingsRepository repository;
    private final Clock clock;
    private final AtomicReference<Settings> cache = new AtomicReference<>();

    SettingsService(SettingsRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    public Settings current() {
        Settings settings = cache.get();
        if (settings == null) {
            settings = repository.load();
            cache.set(settings);
        }
        return settings;
    }

    public Settings update(Settings settings) {
        if (!Settings.FOLLOW_UP_OPTIONS.contains(settings.followUpHours())) {
            throw ApiException.badRequest("followUpHours must be 24, 48 or 72");
        }
        try {
            ZoneId.of(settings.timeZone());
        } catch (DateTimeException e) {
            throw ApiException.badRequest("timeZone must be an IANA time zone such as Asia/Karachi");
        }
        if (settings.quietHoursStart().equals(settings.quietHoursEnd())) {
            throw ApiException.badRequest("quietHoursStart and quietHoursEnd must differ");
        }
        repository.save(settings, clock.instant());
        cache.set(settings);
        return settings;
    }
}
