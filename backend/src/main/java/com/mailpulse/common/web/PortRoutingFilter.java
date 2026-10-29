package com.mailpulse.common.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.regex.Pattern;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Keeps the two ports strictly apart. The public port answers only GET/HEAD on the pixel and click
 * routes; the private port never serves them. Everything else gets an empty 404.
 */
public class PortRoutingFilter extends OncePerRequestFilter {

    private static final Pattern PIXEL = Pattern.compile("/t/[A-Za-z0-9_-]{1,64}\\.gif");
    private static final Pattern CLICK = Pattern.compile("/c/[A-Za-z0-9_-]{1,64}");

    private final PortRegistry ports;

    public PortRoutingFilter(PortRegistry ports) {
        this.ports = ports;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        boolean trackingRoute = PIXEL.matcher(path).matches() || CLICK.matcher(path).matches();
        boolean readMethod = "GET".equals(request.getMethod()) || "HEAD".equals(request.getMethod());
        boolean allowed = ports.isPublic(request.getLocalPort())
                ? trackingRoute && readMethod
                : !path.startsWith("/t/") && !path.startsWith("/c/");
        if (!allowed) {
            response.setStatus(HttpServletResponse.SC_NOT_FOUND);
            response.setContentLength(0);
            return;
        }
        chain.doFilter(request, response);
    }
}
