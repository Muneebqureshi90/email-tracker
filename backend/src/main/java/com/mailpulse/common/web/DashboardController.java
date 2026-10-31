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
        "/alerts", "/documents", "/documents/{id}", "/settings", "/tokens", "/account"
    };

    @GetMapping({
        "/", "/login", "/emails", "/emails/{id}", "/activity", "/contacts", "/contacts/{address}", "/reports",
        "/alerts", "/documents", "/documents/{id}", "/settings", "/tokens", "/account"
    })
    String app() {
        return "forward:/index.html";
    }
}
