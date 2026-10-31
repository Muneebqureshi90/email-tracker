package com.mailpulse.contacts;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Companies the owner emailed; the literal path wins over /api/contacts/{address}. */
@RestController
class CompanyController {

    private final CompanyQueries companies;

    CompanyController(CompanyQueries companies) {
        this.companies = companies;
    }

    @GetMapping("/api/contacts/companies")
    List<CompanyQueries.CompanySummary> list() {
        return companies.all();
    }
}
