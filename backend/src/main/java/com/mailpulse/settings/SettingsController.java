package com.mailpulse.settings;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
class SettingsController {

    private final SettingsService settings;
    private final ClientConfigService config;

    SettingsController(SettingsService settings, ClientConfigService config) {
        this.settings = settings;
        this.config = config;
    }

    @GetMapping("/api/settings")
    Settings get() {
        return settings.current();
    }

    @PutMapping("/api/settings")
    Settings put(@Valid @RequestBody Settings body) {
        return settings.update(body);
    }

    /** What the extension needs; {@code configVersion} also comes with every activity poll. */
    @GetMapping("/api/config")
    ClientConfig config() {
        return config.current();
    }
}
