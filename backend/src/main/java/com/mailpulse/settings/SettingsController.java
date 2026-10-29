package com.mailpulse.settings;

import com.mailpulse.common.MailPulseProperties;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
class SettingsController {

    static final String SELF_HEADER = "X-MailPulse-Self";

    private final SettingsService settings;
    private final MailPulseProperties properties;

    SettingsController(SettingsService settings, MailPulseProperties properties) {
        this.settings = settings;
        this.properties = properties;
    }

    @GetMapping("/api/settings")
    Settings get() {
        return settings.current();
    }

    @PutMapping("/api/settings")
    Settings put(@Valid @RequestBody Settings body) {
        return settings.update(body);
    }

    /** What the extension needs: where pixels live, the self-request header, and tracking defaults. */
    @GetMapping("/api/config")
    ClientConfig config() {
        Settings current = settings.current();
        String selfSecret = properties.selfHeaderSecret();
        return new ClientConfig(
                properties.publicBaseUrl(),
                SELF_HEADER,
                selfSecret == null || selfSecret.isBlank() ? null : selfSecret,
                current.trackingDefault(),
                current.linkTrackingDefault());
    }

    record ClientConfig(
            String publicBaseUrl,
            String selfHeaderName,
            String selfHeaderValue,
            boolean trackingDefault,
            boolean linkTrackingDefault) {}
}
