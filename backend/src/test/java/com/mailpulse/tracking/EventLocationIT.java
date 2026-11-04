package com.mailpulse.tracking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.mailpulse.support.IntegrationTest;
import com.mailpulse.support.TestHttp;
import com.mailpulse.support.TestcontainersConfig;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

/** Every request in the email detail carries the approximate place of its network, except mail proxies (D-133). */
class EventLocationIT extends IntegrationTest {

    @Test
    void directRequestsShowTheirNetworkLocationAndMailProxiesHideIt() {
        TrackedEmail email = sentEmail(uniqueAccount(), "Where was it read", "loc" + System.nanoTime(), "reader@example.com");
        clock.advance(Duration.ofSeconds(20));
        assertThat(fetchPixel(email.token(), BROWSER_UA, "X-Forwarded-For", "203.0.113.7").status()).isEqualTo(200);
        assertThat(fetchPixel(email.token(), GMAIL_PROXY_UA, "X-Forwarded-For", "203.0.113.8").status()).isEqualTo(200);
        assertThat(fetchPixel(email.token(), BROWSER_UA, "X-Forwarded-For", "198.51.100.7").status()).isEqualTo(200);
        await().atMost(Duration.ofSeconds(10)).until(() -> eventCount(email.id()) == 3);

        List<JsonNode> detail = list(ok(http.get(api("/api/emails/" + email.id()), asOwner())).get("events"));
        assertLocations(detail);
        List<JsonNode> paged = list(ok(http.get(api("/api/emails/" + email.id() + "/events?page=0&size=25"), asOwner())).get("items"));
        assertLocations(paged);

        JsonNode exported = null;
        for (JsonNode item : ok(http.get(api("/api/export"), asOwner())).get("emails")) {
            if (item.get("summary").get("id").asString().equals(email.id().toString())) {
                exported = item;
            }
        }
        assertThat(exported).as("email in the export").isNotNull();
        assertLocations(list(exported.get("events")));
    }

    private static void assertLocations(List<JsonNode> events) {
        assertThat(events).hasSize(3);
        JsonNode direct = find(events, "DIRECT", TestcontainersConfig.LOCATED_PREFIX);
        JsonNode location = direct.get("location");
        assertThat(location.get("city").asString()).isEqualTo("Lahore");
        assertThat(location.get("region").asString()).isEqualTo("Punjab");
        assertThat(location.get("country").asString()).isEqualTo("Pakistan");
        assertThat(location.get("countryCode").asString()).isEqualTo("PK");
        assertThat(location.get("latitude").asDouble()).isEqualTo(31.5497);
        assertThat(location.get("longitude").asDouble()).isEqualTo(74.3436);
        assertThat(location.get("networkOwner").asString()).isEqualTo("Example Telecom");

        assertThat(find(events, "GMAIL_PROXY", TestcontainersConfig.LOCATED_PREFIX).get("location").isNull())
                .as("Gmail's proxy hides the reader, so no location").isTrue();
        assertThat(find(events, "DIRECT", "198.51.100.0/24").get("location").isNull()).as("unknown network").isTrue();
    }

    private static JsonNode find(List<JsonNode> events, String source, String ipPrefix) {
        return events.stream()
                .filter(event -> event.get("source").asString().equals(source) && event.get("ipPrefix").asString().equals(ipPrefix))
                .findFirst()
                .orElseThrow(() -> new AssertionError("no " + source + " event from " + ipPrefix));
    }

    /** The JSON of a 200 response; any other status fails with the body instead of a null field later. */
    private static JsonNode ok(TestHttp.Response response) {
        assertThat(response.status()).as(response.text()).isEqualTo(200);
        return response.json();
    }

    private static List<JsonNode> list(JsonNode array) {
        List<JsonNode> items = new ArrayList<>();
        array.forEach(items::add);
        return items;
    }
}
