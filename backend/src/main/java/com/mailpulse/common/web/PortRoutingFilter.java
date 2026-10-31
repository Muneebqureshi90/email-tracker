package com.mailpulse.common.web;

import com.mailpulse.documents.FriendlyPages;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.http.ResponseEntity;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Keeps the two ports strictly apart, deny by default. The public port answers only the pixel and click routes
 * and the document routes (docs/v2-contract.md); the private port never serves them. Everything else gets an
 * empty 404, before Spring Security or any controller sees the request. Two exceptions for recipients who open
 * a document link: a valid link with pasted trailing characters is redirected to the clean link, and any other
 * unmatched /d/ read gets the friendly "Link not found" page instead of the browser's own error page.
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
    /** A document link pasted with trailing "/", ".", ")", "," or an encoded space after the token. */
    private static final Pattern DOCUMENT_WITH_TRAILING = Pattern.compile("/d/([A-Za-z0-9_-]{24})(?:/|\\.|\\)|,|%20)+");

    static final String ROBOTS_HEADER = "X-Robots-Tag";
    static final String ROBOTS_VALUE = "noindex, nofollow";

    /** The documents feature's "Link not found" page. */
    private static final ResponseEntity<byte[]> LINK_NOT_FOUND = FriendlyPages.notFound();

    private final PortRegistry ports;

    public PortRoutingFilter(PortRegistry ports) {
        this.ports = ports;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        String method = request.getMethod();
        boolean publicPort = ports.isPublic(request.getLocalPort());
        if (publicPort) {
            response.setHeader(ROBOTS_HEADER, ROBOTS_VALUE);
        }
        boolean allowed = publicPort ? allowedOnPublicPort(method, path) : allowedOnPrivatePort(path);
        if (!allowed) {
            if (publicPort && isRead(method) && path != null && path.startsWith("/d/")) {
                String cleanPath = cleanDocumentPath(path);
                if (cleanPath != null) {
                    response.setStatus(HttpServletResponse.SC_MOVED_PERMANENTLY);
                    response.setHeader("Location", cleanPath);
                    response.setContentLength(0);
                    return;
                }
                writePage(LINK_NOT_FOUND, "HEAD".equals(method), response);
                return;
            }
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
        if (isRead(method)) {
            return PIXEL.matcher(path).matches() || CLICK.matcher(path).matches() || DOCUMENT.matcher(path).matches()
                    || VIEWER_FILE.matcher(path).matches();
        }
        return "POST".equals(method) && BEAT.matcher(path).matches();
    }

    static boolean allowedOnPrivatePort(String path) {
        return path == null || !(path.startsWith("/t/") || path.startsWith("/c/") || path.startsWith("/d/"));
    }

    /**
     * @return "/d/{token}" when the path is a document link followed only by pasted trailing characters,
     *     otherwise null
     */
    static String cleanDocumentPath(String path) {
        if (path == null || path.length() > 400) {
            return null;
        }
        Matcher matcher = DOCUMENT_WITH_TRAILING.matcher(path);
        return matcher.matches() ? "/d/" + matcher.group(1) : null;
    }

    private static boolean isRead(String method) {
        return "GET".equals(method) || "HEAD".equals(method);
    }

    private static void writePage(ResponseEntity<byte[]> page, boolean head, HttpServletResponse response)
            throws IOException {
        response.setStatus(page.getStatusCode().value());
        page.getHeaders().forEach((name, values) -> values.forEach(value -> response.addHeader(name, value)));
        byte[] pageBody = page.getBody();
        byte[] body = pageBody == null ? new byte[0] : pageBody;
        response.setContentLength(body.length);
        if (!head) {
            response.getOutputStream().write(body);
        }
    }
}
