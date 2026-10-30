package com.mailpulse.settings;

import com.mailpulse.common.MailPulseProperties;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/**
 * Builds the extension's configuration and its version: a hash of every value, so it changes
 * whenever settings (or the environment after a restart) change. Cached per settings snapshot.
 */
@Service
public class ClientConfigService {

    static final String SELF_HEADER = "X-MailPulse-Self";
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private record Cached(Settings settings, ClientConfig config) {}

    private final SettingsService settings;
    private final MailPulseProperties properties;
    private volatile Cached cached;

    ClientConfigService(SettingsService settings, MailPulseProperties properties) {
        this.settings = settings;
        this.properties = properties;
    }

    public ClientConfig current() {
        Settings current = settings.current();
        Cached snapshot = cached;
        if (snapshot != null && snapshot.settings() == current) {
            return snapshot.config();
        }
        ClientConfig config = build(current);
        cached = new Cached(current, config);
        return config;
    }

    public String version() {
        return current().configVersion();
    }

    private ClientConfig build(Settings s) {
        String selfSecret = properties.selfHeaderSecret();
        String selfValue = selfSecret == null || selfSecret.isBlank() ? null : selfSecret;
        ClientConfig unversioned = config(s, selfValue, null);
        return config(s, selfValue, hash(JSON.writeValueAsString(unversioned)));
    }

    private ClientConfig config(Settings s, String selfValue, String version) {
        return new ClientConfig(
                properties.publicBaseUrl(),
                SELF_HEADER,
                selfValue,
                s.trackingDefault(),
                s.linkTrackingDefault(),
                s.sendMode(),
                s.dnrBlocking(),
                s.trackConfidential(),
                s.selfViewWindowSeconds(),
                s.followUpHours(),
                version,
                s.notifyOn(),
                s.notifyDocuments(),
                s.quietHoursEnabled(),
                s.quietHoursStart(),
                s.quietHoursEnd(),
                s.timeZone());
    }

    private static String hash(String text) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest, 0, 8);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
