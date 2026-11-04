package com.mailpulse.common.geo;

import com.maxmind.db.Reader;
import java.io.File;
import java.io.IOException;
import java.net.InetAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Looks up stored network prefixes in the free DB-IP Lite files that scripts\geo-db.ps1 downloads
 * (dbip-city-lite-YYYY-MM.mmdb and dbip-asn-lite-YYYY-MM.mmdb, newest release wins). Everything runs on
 * this PC; no address is sent anywhere. Without the files every lookup is empty (fail open).
 */
@Component
class DbIpLocator implements IpLocator, DisposableBean {

    static final String CITY_PREFIX = "dbip-city-lite-";
    static final String NETWORK_PREFIX = "dbip-asn-lite-";

    private static final Logger log = LoggerFactory.getLogger(DbIpLocator.class);

    private final Reader cities;
    private final Reader networks;

    DbIpLocator(@Value("${mailpulse.geo-dir:}") String geoDir) {
        if (geoDir == null || geoDir.isBlank()) {
            log.info("IP location off: mailpulse.geo-dir is not set");
            this.cities = null;
            this.networks = null;
        } else {
            this.cities = open(Path.of(geoDir), CITY_PREFIX);
            this.networks = open(Path.of(geoDir), NETWORK_PREFIX);
        }
    }

    @Override
    public Optional<IpLocation> locate(String ipPrefix) {
        if (cities == null && networks == null) {
            return Optional.empty();
        }
        InetAddress address = networkAddress(ipPrefix);
        if (address == null || !isPublic(address)) {
            return Optional.empty();
        }
        try {
            return IpLocation.from(lookup(cities, address), lookup(networks, address));
        } catch (IOException | RuntimeException e) {
            log.warn("IP location lookup failed: {}", e.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    @Override
    public void destroy() throws IOException {
        if (cities != null) {
            cities.close();
        }
        if (networks != null) {
            networks.close();
        }
    }

    /** "203.0.113.0/24" or "2001:db8:1::/48" to the network's first address; null for anything else. */
    static InetAddress networkAddress(String ipPrefix) {
        if (ipPrefix == null || ipPrefix.isBlank()) {
            return null;
        }
        int slash = ipPrefix.indexOf('/');
        String literal = (slash < 0 ? ipPrefix : ipPrefix.substring(0, slash)).trim();
        try {
            return InetAddress.ofLiteral(literal);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    static boolean isPublic(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                || address.isSiteLocalAddress() || address.isMulticastAddress()) {
            return false;
        }
        byte[] bytes = address.getAddress();
        // IPv6 unique local addresses (fc00::/7) are private as well.
        return bytes.length == 4 || (bytes[0] & 0xfe) != 0xfc;
    }

    private static Map<?, ?> lookup(Reader reader, InetAddress address) throws IOException {
        return reader == null ? null : reader.get(address, Map.class);
    }

    private static Reader open(Path dir, String prefix) {
        Optional<Path> newest;
        try (Stream<Path> files = Files.list(dir)) {
            newest = files.filter(file -> {
                String name = file.getFileName().toString();
                return name.startsWith(prefix) && name.endsWith(".mmdb");
            }).max(Comparator.comparing(file -> file.getFileName().toString()));
        } catch (IOException e) {
            log.info("IP location off: cannot read {} ({})", dir, e.getClass().getSimpleName());
            return null;
        }
        if (newest.isEmpty()) {
            log.info("IP location off: no {}*.mmdb in {}. Run .\\scripts\\geo-db.ps1", prefix, dir);
            return null;
        }
        File file = newest.get().toFile();
        try {
            Reader reader = new Reader(file);
            log.info("IP location: using {}", file.getName());
            return reader;
        } catch (IOException | RuntimeException e) {
            log.warn("IP location off: cannot open {} ({})", file.getName(), e.getClass().getSimpleName());
            return null;
        }
    }
}
