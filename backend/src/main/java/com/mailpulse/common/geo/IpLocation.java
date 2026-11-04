package com.mailpulse.common.geo;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Approximate place of a network (city level), from the local DB-IP Lite files (D-133). Every field
 * can be null. It is where the network is registered, never the reader's live position.
 *
 * @param region state or province
 * @param countryCode ISO 3166 code, for example "PK"
 * @param networkOwner organisation of the autonomous system, for example "Google LLC"
 */
public record IpLocation(
        String city,
        String region,
        String country,
        String countryCode,
        Double latitude,
        Double longitude,
        String networkOwner) {

    /**
     * Reads the records that the MaxMind DB reader decodes into maps: a GeoIP2-City style record from
     * the city file and an ASN record from the network file. Either may be null.
     */
    static Optional<IpLocation> from(Map<?, ?> city, Map<?, ?> network) {
        IpLocation location = new IpLocation(
                text(city, "city", "names", "en"),
                text(city, "subdivisions", 0, "names", "en"),
                text(city, "country", "names", "en"),
                text(city, "country", "iso_code"),
                number(city, "location", "latitude"),
                number(city, "location", "longitude"),
                text(network, "autonomous_system_organization"));
        boolean empty = location.city() == null && location.region() == null && location.country() == null
                && location.latitude() == null && location.longitude() == null && location.networkOwner() == null;
        return empty ? Optional.empty() : Optional.of(location);
    }

    private static String text(Object node, Object... path) {
        Object value = at(node, path);
        return value instanceof String text && !text.isBlank() ? text : null;
    }

    private static Double number(Object node, Object... path) {
        Object value = at(node, path);
        return value instanceof Number number ? number.doubleValue() : null;
    }

    /** Follows map keys (String) and list indexes (Integer); null when any step is missing. */
    private static Object at(Object node, Object... path) {
        Object current = node;
        for (Object step : path) {
            if (step instanceof String key && current instanceof Map<?, ?> map) {
                current = map.get(key);
            } else if (step instanceof Integer index && current instanceof List<?> list && index < list.size()) {
                current = list.get(index);
            } else {
                return null;
            }
        }
        return current;
    }
}
