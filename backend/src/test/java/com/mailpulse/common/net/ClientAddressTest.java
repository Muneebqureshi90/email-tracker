package com.mailpulse.common.net;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.common.MailPulseProperties;
import java.net.InetAddress;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class ClientAddressTest {

    private final ClientAddress clients = new ClientAddress(new MailPulseProperties(
            8081, "https://track.test", List.of(), List.of(), List.of(), List.of("127.0.0.1/32", "172.16.0.0/12"),
            null, null, null, Duration.ofHours(12), false, 10, false));

    @Test
    void usesPeerAddressForUntrustedPeers() {
        MockHttpServletRequest request = request("203.0.113.9", "198.51.100.1");
        assertThat(clients.resolve(request)).contains(InetAddress.ofLiteral("203.0.113.9"));
    }

    @Test
    void usesFirstForwardedAddressBehindTrustedProxy() {
        MockHttpServletRequest request = request("172.18.0.1", "198.51.100.7, 10.0.0.1");
        assertThat(clients.resolve(request)).contains(InetAddress.ofLiteral("198.51.100.7"));
    }

    @Test
    void unknownWhenTrustedProxySendsNothingOrGarbage() {
        assertThat(clients.resolve(request("127.0.0.1", null))).isEmpty();
        assertThat(clients.resolve(request("127.0.0.1", "not-an-ip.example.com"))).isEmpty();
    }

    @Test
    void truncatesIpv4To24AndIpv6To48() {
        assertThat(ClientAddress.truncate(InetAddress.ofLiteral("203.0.113.77"))).isEqualTo("203.0.113.0/24");
        assertThat(ClientAddress.truncate(InetAddress.ofLiteral("2001:db8:abcd:12:1:2:3:4")))
                .isEqualTo("2001:db8:abcd:0:0:0:0:0/48");
    }

    @Test
    void cidrRangesMatchOnlyTheirPrefix() {
        IpRange range = IpRange.parse("172.16.0.0/12");
        assertThat(range.contains(InetAddress.ofLiteral("172.31.255.255"))).isTrue();
        assertThat(range.contains(InetAddress.ofLiteral("172.32.0.1"))).isFalse();
        assertThat(range.contains(InetAddress.ofLiteral("::1"))).isFalse();
    }

    private static MockHttpServletRequest request(String peer, String forwardedFor) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(peer);
        if (forwardedFor != null) {
            request.addHeader("X-Forwarded-For", forwardedFor);
        }
        return request;
    }
}
