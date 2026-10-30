package com.mailpulse.common.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.regex.Pattern;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Keeps the two ports strictly apart, deny by default. The public port answers only the pixel and click routes
 * and the document routes (docs/v2-contract.md); the private port never serves them. Everything else gets an
 * empty 404, before Spring Security or any controller sees the request.
 */
public class PortRoutingFilter extends OncePerRequestFilter {

    private static final Pattern PIXEL = Pattern.compile("/t/[A-Za-z0-9_-]{1,64}\\.gif");
    private static final Pattern CLICK = Pattern.compile("/c/[A-Za-z0-9_-]{1,64}");
    /** The viewer page, its info, the PDF and the download. */
    private static final Pattern DOCUMENT = Pattern.compile("/d/[A-Za-z0-9_-]{24}(?:/(?:info|pdf|file))?");
    private static final Pattern BEAT = Pattern.compile("/d/[A-Za-z0-9_-]{24}/beat");
    /**
     * Viewer files: nested plain names with one of the viewer's file types. No empty, "." or ".." segment, no
     * percent-encoding and no backslash can match, so nothing outside classpath:/static/viewer/ is reachable.
     */
    private static final Pattern VIEWER_FILE = Pattern.compile("/d/_/(?:[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}/){0,4}"
            + "[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}\\.(?:js|mjs|css|bcmap|pfb|ttf|wasm|icc|svg|png)");

    private final PortRegistry ports;

    public PortRoutingFilter(PortRegistry ports) {
        this.ports = ports;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        boolean allowed = ports.isPublic(request.getLocalPort())
                ? allowedOnPublicPort(request.getMethod(), path)
                : allowedOnPrivatePort(path);
        if (!allowed) {
            response.setStatus(HttpServletResponse.SC_NOT_FOUND);
            response.setContentLength(0);
            return;
        }
        chain.doFilter(request, response);
    }

    /** GET or HEAD on the pixel, click, document and viewer-file routes; POST only on the document beat. */
    static boolean allowedOnPublicPort(String method, String path) {
        if (path == null || path.length() > 400) {
            return false;
        }
        boolean read = "GET".equals(method) || "HEAD".equals(method);
        if (read) {
            return PIXEL.matcher(path).matches() || CLICK.matcher(path).matches() || DOCUMENT.matcher(path).matches()
                    || VIEWER_FILE.matcher(path).matches();
        }
        return "POST".equals(method) && BEAT.matcher(path).matches();
    }

    static boolean allowedOnPrivatePort(String path) {
        return path == null || !(path.startsWith("/t/") || path.startsWith("/c/") || path.startsWith("/d/"));
    }
}
