package com.mailpulse.tracking;

import com.mailpulse.common.RandomTokens;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Clock;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The extension reports pixels it sees while the owner reads or writes mail (PLAN §4.3, layer L2). */
@RestController
class SelfViewController {

    enum Context {
        THREAD,
        COMPOSE,
        OTHER
    }

    record SelfViewRequest(
            @Size(max = 254) String account,
            @NotNull @Size(min = 1, max = 50) List<@NotBlank @Size(max = 64) String> tokens,
            @NotNull Context context) {}

    record SelfViewResponse(int matched) {}

    private final SelfViewRepository selfViews;
    private final Clock clock;

    SelfViewController(SelfViewRepository selfViews, Clock clock) {
        this.selfViews = selfViews;
        this.clock = clock;
    }

    @PostMapping("/api/self-views")
    @ResponseStatus(HttpStatus.ACCEPTED)
    SelfViewResponse report(@Valid @RequestBody SelfViewRequest body) {
        List<String> tokens = body.tokens().stream().filter(RandomTokens::isTrackingToken).distinct().toList();
        int matched = tokens.isEmpty() ? 0 : selfViews.recordForTokens(tokens, body.context().name(), clock.instant());
        return new SelfViewResponse(matched);
    }
}
