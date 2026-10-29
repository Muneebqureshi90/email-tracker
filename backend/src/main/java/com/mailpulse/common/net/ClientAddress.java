package com.mailpulse.common.net;

import com.mailpulse.common.MailPulseProperties;
import jakarta.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.net.UnknownHostException;
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
     * The peer address, or the first X-Forwarded-For entry when the peer is a trusted proxy.
     * Empty when unknown, for example a trusted proxy that sent no X-Forwarded-For header.
     */
    public Optional<InetAddress> resolve(HttpServletRequest request) {
        Optional<InetAddress> peer = literal(request.getRemoteAddr());
        if (peer.isEmpty() || trustedProxies.stream().noneMatch(range -> range.contains(peer.get()))) {
            return peer;
        }
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded == null || forwarded.isBlank()) {
            return Optional.empty();
        }
        return literal(forwarded.split(",", 2)[0]);
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
