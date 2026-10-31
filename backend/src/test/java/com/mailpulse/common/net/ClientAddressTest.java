package com.mailpulse.common.net;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.common.MailPulseProperties;
import java.net.InetAddress;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class ClientAddressTest {

    private final ClientAddress clients = clientsTrusting("127.0.0.1/32", "172.16.0.0/12");

    @Test
    void usesPeerAddressForUntrustedPeers() {
        MockHttpServletRequest request = request("203.0.113.9", "198.51.100.1");
        assertThat(clients.resolve(request)).contains(InetAddress.ofLiteral("203.0.113.9"));
    }

    @Test
    void usesSingleForwardedEntryBehindTrustedProxy() {
        assertThat(clients.resolve(request("172.18.0.1", "198.51.100.7")))
                .contains(InetAddress.ofLiteral("198.51.100.7"));
    }

    @Test
    void ignoresSpoofedEntriesLeftOfTheRealClient() {
        assertThat(clients.resolve(request("172.18.0.1", "203.0.113.77, 198.51.100.9")))
                .contains(InetAddress.ofLiteral("198.51.100.9"));
        assertThat(clients.resolve(request("172.18.0.1", "203.0.113.77, 198.51.100.9, 172.20.0.3")))
                .contains(InetAddress.ofLiteral("198.51.100.9"));
    }

    @Test
    void readsRepeatedHeaderLinesAsOneList() {
        MockHttpServletRequest request = request("172.18.0.1", "203.0.113.77");
        request.addHeader("X-Forwarded-For", "198.51.100.9");
        assertThat(clients.resolve(request)).contains(InetAddress.ofLiteral("198.51.100.9"));
    }

    @Test
    void fallsBackToPeerWhenEveryEntryIsTrusted() {
        assertThat(clients.resolve(request("172.18.0.1", "127.0.0.1, 172.20.0.3")))
                .contains(InetAddress.ofLiteral("172.18.0.1"));
    }

    @Test
    void fallsBackToPeerWhenTrustedProxySendsNoHeader() {
        assertThat(clients.resolve(request("127.0.0.1", null))).contains(InetAddress.ofLiteral("127.0.0.1"));
        assertThat(clients.resolve(request("127.0.0.1", ""))).contains(InetAddress.ofLiteral("127.0.0.1"));
    }

    @Test
    void fallsBackToPeerWhenTheWalkReachesGarbage() {
        InetAddress peer = InetAddress.ofLiteral("127.0.0.1");
        assertThat(clients.resolve(request("127.0.0.1", "not-an-ip.example.com"))).contains(peer);
        assertThat(clients.resolve(request("127.0.0.1", "198.51.100.7, unknown"))).contains(peer);
        assertThat(clients.resolve(request("127.0.0.1", "198.51.100.7:4711"))).contains(peer);
        assertThat(clients.resolve(request("127.0.0.1", "198.51.100.7, , 172.20.0.3"))).contains(peer);
    }

    @Test
    void ignoresGarbageLeftOfTheRealClient() {
        assertThat(clients.resolve(request("127.0.0.1", "garbage, 198.51.100.7")))
                .contains(InetAddress.ofLiteral("198.51.100.7"));
        assertThat(clients.resolve(request("127.0.0.1", ", 198.51.100.7")))
                .contains(InetAddress.ofLiteral("198.51.100.7"));
    }

    @Test
    void handlesIpv6ClientsAndProxies() {
        assertThat(clients.resolve(request("172.18.0.1", "2001:db8::7")))
                .contains(InetAddress.ofLiteral("2001:db8::7"));
        assertThat(clients.resolve(request("172.18.0.1", "[2001:db8::7]")))
                .contains(InetAddress.ofLiteral("2001:db8::7"));

        ClientAddress ipv6 = clientsTrusting("::1/128", "fd00::/8");
        assertThat(ipv6.resolve(request("::1", "2001:db8::9, 2001:db8::5, fd00::2")))
                .contains(InetAddress.ofLiteral("2001:db8::5"));
        assertThat(ipv6.resolve(request("::1", "fd00::3, fd00::2"))).contains(InetAddress.ofLiteral("::1"));
        assertThat(ipv6.resolve(request("2001:db8::9", "198.51.100.7")))
                .contains(InetAddress.ofLiteral("2001:db8::9"));
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

    private static ClientAddress clientsTrusting(String... ranges) {
        return new ClientAddress(new MailPulseProperties(
                8081, "https://track.test", List.of(), List.of(), List.of(), List.of(ranges),
                null, null, null, Duration.ofHours(12), false, 10, false));
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
