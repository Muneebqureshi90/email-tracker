package com.mailpulse.auth;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;

/** 401/403 as RFC 9457 problem JSON. Titles and details are constants, never user input. */
final class SecurityProblems {

    private SecurityProblems() {}

    static AuthenticationEntryPoint entryPoint() {
        return (request, response, exception) ->
                write(response, HttpServletResponse.SC_UNAUTHORIZED, "Unauthorized", "Sign in or send a valid API token");
    }

    static AccessDeniedHandler accessDenied() {
        return (request, response, exception) ->
                write(response, HttpServletResponse.SC_FORBIDDEN, "Forbidden", "Not allowed for this account or token");
    }

    static void write(HttpServletResponse response, int status, String title, String detail) throws IOException {
        response.setStatus(status);
        response.setContentType("application/problem+json");
        response.getWriter().write(
                "{\"type\":\"about:blank\",\"title\":\"" + title + "\",\"status\":" + status + ",\"detail\":\"" + detail + "\"}");
    }
}
