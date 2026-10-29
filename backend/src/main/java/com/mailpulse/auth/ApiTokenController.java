package com.mailpulse.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Owner-only management of extension API tokens. */
@RestController
@RequestMapping("/api/tokens")
class ApiTokenController {

    record CreateTokenRequest(@NotBlank @Size(max = 60) String name) {}

    private final ApiTokenService tokens;

    ApiTokenController(ApiTokenService tokens) {
        this.tokens = tokens;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    ApiTokenService.CreatedToken create(@Valid @RequestBody CreateTokenRequest body) {
        return tokens.create(body.name());
    }

    @GetMapping
    List<ApiTokenRepository.ApiTokenRow> list() {
        return tokens.list();
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void revoke(@PathVariable UUID id) {
        tokens.revoke(id);
    }
}
