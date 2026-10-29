package com.mailpulse.common.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Locale;
import java.util.Set;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Private port only: the Host header must name this machine. A web page that makes its own domain
 * resolve to 127.0.0.1 (DNS rebinding) sends its own host name and is refused.
 */
public class HostHeaderFilter extends OncePerRequestFilter {

    private final PortRegistry ports;
    private final Set<String> allowedHostNames;

    public HostHeaderFilter(PortRegistry ports, Set<String> allowedHostNames) {
        this.ports = ports;
        this.allowedHostNames = allowedHostNames;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (!ports.isPublic(request.getLocalPort())
                && !allowedHostNames.contains(request.getServerName().toLowerCase(Locale.ROOT))) {
            response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
            response.setContentType("text/plain");
            response.getWriter().write("Invalid host");
            return;
        }
        chain.doFilter(request, response);
    }
}
