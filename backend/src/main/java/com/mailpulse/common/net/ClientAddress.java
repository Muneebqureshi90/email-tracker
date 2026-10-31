package com.mailpulse.common.net;

import com.mailpulse.common.MailPulseProperties;
import jakarta.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;

/** Works out the client's IP address without ever doing a DNS lookup. */
@Component
public class ClientAddress {

    private final List<IpRange> trustedProxies;

    public ClientAddress(MailPulseProperties properties) {
        this.trustedProxies = properties.trustedProxies().stream().map(IpRange::parse).toList();
    }

    /**
     * The peer address or, when the peer is a trusted proxy, the nearest X-Forwarded-For entry that is
     * not a trusted proxy itself. The entries are read from right to left because only the ones added
     * by trusted proxies can be believed; anything further left may have been sent by the visitor.
     * Falls back to the peer when the header is missing, every entry is trusted or the walk reaches a
     * value that is not an IP literal. Empty only when the peer address itself is unknown.
     */
    public Optional<InetAddress> resolve(HttpServletRequest request) {
        Optional<InetAddress> peer = literal(request.getRemoteAddr());
        if (peer.isEmpty() || !trusted(peer.get())) {
            return peer;
        }
        List<String> entries = forwardedEntries(request);
        for (int i = entries.size() - 1; i >= 0; i--) {
            Optional<InetAddress> hop = literal(entries.get(i));
            if (hop.isEmpty()) {
                return peer;
            }
            if (!trusted(hop.get())) {
                return hop;
            }
        }
        return peer;
    }

    private boolean trusted(InetAddress address) {
        return trustedProxies.stream().anyMatch(range -> range.contains(address));
    }

    /** Every X-Forwarded-For entry in order, across repeated header lines. */
    private static List<String> forwardedEntries(HttpServletRequest request) {
        Enumeration<String> headers = request.getHeaders("X-Forwarded-For");
        if (headers == null) {
            return List.of();
        }
        List<String> entries = new ArrayList<>();
        for (String header : Collections.list(headers)) {
            if (header != null) {
                entries.addAll(Arrays.asList(header.split(",", -1)));
            }
        }
        return entries;
    }

    /** IPv4 truncated to /24 and IPv6 to /48, for example "203.0.113.0/24". */
    public static String truncate(InetAddress address) {
        byte[] bytes = address.getAddress();
        boolean ipv4 = bytes.length == 4;
        byte[] masked = new byte[bytes.length];
        System.arraycopy(bytes, 0, masked, 0, ipv4 ? 3 : 6);
        try {
            return InetAddress.getByAddress(masked).getHostAddress() + (ipv4 ? "/24" : "/48");
        } catch (UnknownHostException e) {
            throw new IllegalStateException("Invalid address length", e);
        }
    }

    static Optional<InetAddress> literal(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        String text = value.trim();
        if (text.startsWith("[") && text.endsWith("]")) {
            text = text.substring(1, text.length() - 1);
        }
        try {
            return Optional.of(InetAddress.ofLiteral(text));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
