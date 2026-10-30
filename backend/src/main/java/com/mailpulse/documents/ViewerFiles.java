package com.mailpulse.documents;

import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

/**
 * The document viewer: a separate Vite build (viewer/ in the repository) that the Docker image places under
 * classpath:/static/viewer/. Its URLs all start with /d/_/. A plain backend build has no viewer; the viewer
 * page then answers 503 with a friendly page.
 */
@Component
class ViewerFiles {

    static final String LOCATION = "static/viewer/";
    static final String IMMUTABLE = "public, max-age=31536000, immutable";
    static final String SHORT = "public, max-age=3600";

    /** Nested relative paths only: no empty, "." or ".." segments, no encoded characters, a known extension. */
    private static final Pattern SAFE_PATH =
            Pattern.compile("(?:[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}/){0,4}[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}\\.[A-Za-z0-9]{1,8}");
    /** Vite puts the hashed bundles (and the PDF.js worker) in assets/, so they can be cached for a year. */
    private static final String HASHED = "assets/";
    private static final Map<String, MediaType> TYPES = Map.ofEntries(
            Map.entry("js", MediaType.parseMediaType("text/javascript")),
            Map.entry("mjs", MediaType.parseMediaType("text/javascript")),
            Map.entry("css", MediaType.parseMediaType("text/css")),
            Map.entry("bcmap", MediaType.APPLICATION_OCTET_STREAM),
            Map.entry("pfb", MediaType.APPLICATION_OCTET_STREAM),
            Map.entry("ttf", MediaType.parseMediaType("font/ttf")),
            Map.entry("wasm", MediaType.parseMediaType("application/wasm")),
            Map.entry("icc", MediaType.parseMediaType("application/vnd.iccprofile")),
            Map.entry("svg", MediaType.parseMediaType("image/svg+xml")),
            Map.entry("png", MediaType.IMAGE_PNG));

    private static final Logger log = LoggerFactory.getLogger(ViewerFiles.class);

    record Asset(Resource resource, MediaType type, String cacheControl) {}

    private final ClassLoader classLoader;
    private final String location;
    private volatile byte[] index;
    private volatile boolean missingLogged;

    ViewerFiles() {
        this(ViewerFiles.class.getClassLoader(), LOCATION);
    }

    ViewerFiles(ClassLoader classLoader, String location) {
        this.classLoader = classLoader;
        this.location = location;
    }

    /** The viewer's index.html, or empty when the viewer is not packaged. */
    Optional<byte[]> index() {
        byte[] cached = index;
        if (cached != null) {
            return Optional.of(cached);
        }
        Resource resource = new ClassPathResource(location + "index.html", classLoader);
        if (resource.isReadable()) {
            try (InputStream in = resource.getInputStream()) {
                cached = in.readAllBytes();
                index = cached;
                return Optional.of(cached);
            } catch (IOException e) {
                log.warn("Could not read the document viewer ({})", e.getClass().getSimpleName());
                return Optional.empty();
            }
        }
        if (!missingLogged) {
            missingLogged = true;
            log.warn("The document viewer is not packaged (classpath:/{}index.html); document links answer 503", location);
        }
        return Optional.empty();
    }

    /** A viewer file by its path below /d/_/, with its media type and caching; empty for anything else. */
    Optional<Asset> asset(String path) {
        if (path == null || path.length() > 300 || !SAFE_PATH.matcher(path).matches()) {
            return Optional.empty();
        }
        MediaType type = TYPES.get(path.substring(path.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT));
        if (type == null) {
            return Optional.empty();
        }
        Resource resource = new ClassPathResource(location + path, classLoader);
        if (!resource.isReadable()) {
            return Optional.empty();
        }
        return Optional.of(new Asset(resource, type, path.startsWith(HASHED) ? IMMUTABLE : SHORT));
    }
}
