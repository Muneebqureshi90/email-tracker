package com.mailpulse.contacts;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.support.IntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

class CompaniesIT extends IntegrationTest {

    @Test
    void companiesGroupContactsByDomainAndPersonalAddressesTogether() {
        String domain = "acme-" + UUID.randomUUID() + ".com";
        String first = "ann@" + domain;
        String second = "Bob@" + domain.toUpperCase();
        String personal = "someone-" + UUID.randomUUID() + "@gmail.com";
        String account = uniqueAccount();
        TrackedEmail both = sentEmail(account, "Application", "co" + System.nanoTime(), first, second);
        TrackedEmail one = sentEmail(account, "Follow-up", "co" + System.nanoTime(), first, personal);
        countOpen(both);
        jdbc.sql("UPDATE tracked_email SET replied_at = :at WHERE id = :id")
                .param("at", com.mailpulse.common.Sql.ts(clock.instant()))
                .param("id", one.id())
                .update();

        JsonNode companies = http.get(api("/api/contacts/companies"), asOwner()).json();
        JsonNode acme = find(companies, domain);
        assertThat(acme).as("row for " + domain).isNotNull();
        assertThat(acme.get("contacts").asInt()).isEqualTo(2);
        assertThat(acme.get("emails").asInt()).as("an email to two people there counts once").isEqualTo(2);
        assertThat(acme.get("opened").asInt()).isEqualTo(1);
        assertThat(acme.get("clicked").asInt()).isZero();
        assertThat(acme.get("replied").asInt()).isEqualTo(1);
        assertThat(acme.get("lastActivityAt").isNull()).isFalse();

        JsonNode personalRow = find(companies, null);
        assertThat(personalRow).as("free-mail addresses share one row").isNotNull();
        assertThat(personalRow.get("emails").asInt()).isGreaterThanOrEqualTo(1);
        assertThat(find(companies, "gmail.com")).as("no row for a free-mail domain").isNull();

        assertThat(http.get(api("/api/contacts/companies"), asExtension()).status()).isEqualTo(403);
    }

    @Test
    void personalDomainsAndMalformedAddressesHaveNoCompany() {
        assertThat(CompanyQueries.companyDomain("a@GMail.com")).isNull();
        assertThat(CompanyQueries.companyDomain("a@proton.me")).isNull();
        assertThat(CompanyQueries.companyDomain("broken")).isNull();
        assertThat(CompanyQueries.companyDomain("a@Example.ORG")).isEqualTo("example.org");
    }

    private static JsonNode find(JsonNode companies, String domain) {
        for (JsonNode company : companies) {
            JsonNode value = company.get("domain");
            boolean match = domain == null ? value == null || value.isNull() : value != null && domain.equals(value.asString());
            if (match) {
                return company;
            }
        }
        return null;
    }
}
