package com.mailpulse.common.geo;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.InetAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.junit.jupiter.api.io.CleanupMode;
import org.junit.jupiter.api.io.TempDir;

class DbIpLocatorTest {

    /** Where scripts\geo-db.ps1 puts the files, seen from backend\ (the Maven working directory). */
    private static final Path GEO_DIR = Path.of("..", "data", "geo");

    @Test
    void networkAddressReadsStoredPrefixes() throws Exception {
        assertThat(DbIpLocator.networkAddress("142.250.32.0/24")).isEqualTo(InetAddress.getByName("142.250.32.0"));
        assertThat(DbIpLocator.networkAddress("2001:db8:1::/48")).isEqualTo(InetAddress.getByName("2001:db8:1::"));
        assertThat(DbIpLocator.networkAddress("8.8.8.0")).isEqualTo(InetAddress.getByName("8.8.8.0"));
        assertThat(DbIpLocator.networkAddress(null)).isNull();
        assertThat(DbIpLocator.networkAddress(" ")).isNull();
        assertThat(DbIpLocator.networkAddress("mail.example.com/24")).isNull();
        assertThat(DbIpLocator.networkAddress("999.1.1.0/24")).isNull();
    }

    @Test
    void privateNetworksHaveNoLocation() throws Exception {
        assertThat(DbIpLocator.isPublic(InetAddress.getByName("142.250.32.0"))).isTrue();
        assertThat(DbIpLocator.isPublic(InetAddress.getByName("2a00:1450:4001::"))).isTrue();
        for (String address : List.of("10.1.2.0", "172.16.5.0", "192.168.1.0", "127.0.0.0", "169.254.1.0", "::1", "fd12:3456::",
                "fe80::", "0.0.0.0")) {
            assertThat(DbIpLocator.isPublic(InetAddress.getByName(address))).as(address).isFalse();
        }
    }

    @Test
    void readsCityAndNetworkRecords() {
        Map<String, Object> city = Map.of(
                "city", Map.of("names", Map.of("en", "Lahore", "de", "Lahore")),
                "subdivisions", List.of(Map.of("names", Map.of("en", "Punjab"))),
                "country", Map.of("iso_code", "PK", "names", Map.of("en", "Pakistan")),
                "location", Map.of("latitude", 31.5497, "longitude", 74.3436));
        Map<String, Object> network = Map.of("autonomous_system_number", 17557L, "autonomous_system_organization", "Example Telecom");

        assertThat(IpLocation.from(city, network))
                .contains(new IpLocation("Lahore", "Punjab", "Pakistan", "PK", 31.5497, 74.3436, "Example Telecom"));
        assertThat(IpLocation.from(city, null))
                .contains(new IpLocation("Lahore", "Punjab", "Pakistan", "PK", 31.5497, 74.3436, null));
        assertThat(IpLocation.from(null, network))
                .contains(new IpLocation(null, null, null, null, null, null, "Example Telecom"));
    }

    @Test
    void missingOrOddFieldsStayEmpty() {
        Map<String, Object> countryOnly = Map.of(
                "country", Map.of("iso_code", "US", "names", Map.of("en", "United States")),
                "subdivisions", List.of(),
                "city", Map.of("names", Map.of("en", " ")),
                "location", Map.of("latitude", "north"));
        assertThat(IpLocation.from(countryOnly, Map.of()))
                .contains(new IpLocation(null, null, "United States", "US", null, null, null));
        assertThat(IpLocation.from(null, null)).isEmpty();
        assertThat(IpLocation.from(Map.of("city", "not a map"), Map.of())).isEmpty();
    }

    @Test
    void withoutFilesEveryLookupIsEmpty(@TempDir Path empty) {
        assertThat(new DbIpLocator("").locate("142.250.32.0/24")).isEmpty();
        assertThat(new DbIpLocator(empty.toString()).locate("142.250.32.0/24")).isEmpty();
        assertThat(new DbIpLocator(empty.resolve("missing").toString()).locate("142.250.32.0/24")).isEmpty();
    }

    /** No cleanup: on Windows the failed reader's memory mapping can hold the file until garbage collection. */
    @Test
    void aBrokenFileTurnsLookupsOff(@TempDir(cleanup = CleanupMode.NEVER) Path dir) throws Exception {
        Files.writeString(dir.resolve(DbIpLocator.CITY_PREFIX + "2026-10.mmdb"), "not a database");
        DbIpLocator locator = new DbIpLocator(dir.toString());
        assertThat(locator.locate("142.250.32.0/24")).isEmpty();
        locator.destroy();
    }

    /** Runs where scripts\geo-db.ps1 has downloaded the real files (skipped elsewhere). */
    @Test
    @EnabledIf("realFilesPresent")
    void realDbIpFilesLocatePublicNetworks() throws Exception {
        DbIpLocator locator = new DbIpLocator(GEO_DIR.toString());
        try {
            IpLocation google = locator.locate("8.8.8.0/24").orElseThrow();
            assertThat(google.countryCode()).isEqualTo("US");
            assertThat(google.country()).isEqualTo("United States");
            assertThat(google.latitude()).isBetween(-90.0, 90.0);
            assertThat(google.longitude()).isBetween(-180.0, 180.0);
            assertThat(google.networkOwner()).containsIgnoringCase("Google");
            assertThat(locator.locate("2001:4860:4860::/48")).isPresent();
            assertThat(locator.locate("10.1.2.0/24")).isEmpty();
            assertThat(locator.locate(null)).isEmpty();
        } finally {
            locator.destroy();
        }
    }

    static boolean realFilesPresent() throws Exception {
        if (!Files.isDirectory(GEO_DIR)) {
            return false;
        }
        try (Stream<Path> files = Files.list(GEO_DIR)) {
            List<String> names = files.map(file -> file.getFileName().toString()).toList();
            return names.stream().anyMatch(name -> name.startsWith(DbIpLocator.CITY_PREFIX) && name.endsWith(".mmdb"))
                    && names.stream().anyMatch(name -> name.startsWith(DbIpLocator.NETWORK_PREFIX) && name.endsWith(".mmdb"));
        }
    }
}
