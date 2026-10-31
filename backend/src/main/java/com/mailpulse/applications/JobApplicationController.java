package com.mailpulse.applications;

import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.node.ObjectNode;

/** Job application pipeline API (owner only, like the rest of /api). */
@RestController
@RequestMapping("/api/applications")
class JobApplicationController {

    private final JobApplicationService service;

    JobApplicationController(JobApplicationService service) {
        this.service = service;
    }

    /** Newest first. */
    @GetMapping
    List<ApplicationView> list() {
        return service.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    ApplicationView create(@RequestBody ObjectNode body) {
        return service.create(body);
    }

    @PatchMapping("/{id}")
    ApplicationView update(@PathVariable UUID id, @RequestBody ObjectNode body) {
        return service.update(id, body);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID id) {
        service.delete(id);
    }
}
