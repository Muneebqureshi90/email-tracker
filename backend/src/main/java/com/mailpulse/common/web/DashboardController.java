package com.mailpulse.common.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * The dashboard is a single-page app built into the jar (classpath:/static). Its own routes load
 * index.html so links such as /emails/{id} from notifications work on a fresh tab.
 */
@Controller
public class DashboardController {

    /** The app's routes, also opened up in SecurityConfig. Keep in sync with the mapping below. */
    public static final String[] ROUTES = {
        "/", "/login", "/emails", "/emails/{id}", "/activity", "/contacts", "/contacts/{address}", "/reports",
        "/alerts", "/documents", "/documents/{id}", "/pipeline", "/settings", "/tokens", "/account"
    };

    /** First segment of any other page: never the API, actuator, API docs or tracking routes, and no dot. */
    private static final String P1 = "/{s1:(?i)(?!api|actuator|v3|swagger|(?:t|c|d)$)[^.]*}";
    private static final String P2 = P1 + "/{s2:[^.]*}";
    private static final String P3 = P2 + "/{s3:[^.]*}";
    private static final String P4 = P3 + "/{s4:[^.]*}";
    private static final String P5 = P4 + "/{s5:[^.]*}";
    private static final String P6 = P5 + "/{s6:[^.]*}";

    /**
     * Every other GET without a file extension (up to six segments), so the app shows its own "Page not found".
     * Opened up in SecurityConfig after every /api rule. Paths with a dot stay with the static file handler.
     */
    public static final String[] OTHER_PAGES = {P1, P2, P3, P4, P5, P6};

    @GetMapping({
        "/", "/login", "/emails", "/emails/{id}", "/activity", "/contacts", "/contacts/{address}", "/reports",
        "/alerts", "/documents", "/documents/{id}", "/pipeline", "/settings", "/tokens", "/account"
    })
    String app() {
        return "forward:/index.html";
    }

    @GetMapping({P1, P2, P3, P4, P5, P6})
    String otherPage() {
        return "forward:/index.html";
    }

    /** Browsers ask for /favicon.ico on their own; the app's icon is the SVG. */
    @GetMapping("/favicon.ico")
    String favicon() {
        return "forward:/favicon.svg";
    }
}
