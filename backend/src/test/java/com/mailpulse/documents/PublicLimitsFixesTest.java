package com.mailpulse.documents;

import static org.assertj.core.api.Assertions.assertThat;

import com.mailpulse.support.MutableClock;
import java.net.InetAddress;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class PublicLimitsFixesTest {

    private final PublicLimits limits = new PublicLimits(new MutableClock(Instant.parse("2026-10-29T10:00:00Z")));

    @Test
    void ipv6ClientsShareOneLimitPerSlash64() throws Exception {
        for (int i = 0; i < 600; i++) {
            assertThat(limits.asset(address("2001:db8:1:2::" + Integer.toHexString(i + 1)))).isTrue();
        }
        assertThat(limits.asset(address("2001:db8:1:2:ffff::1"))).isFalse();
        assertThat(limits.asset(address("2001:db8:1:3::1"))).isTrue();
    }

    @Test
    void ipv4ClientsKeepTheirFullAddress() throws Exception {
        for (int i = 0; i < 600; i++) {
            assertThat(limits.asset(address("203.0.113.1"))).isTrue();
        }
        assertThat(limits.asset(address("203.0.113.1"))).isFalse();
        assertThat(limits.asset(address("203.0.113.2"))).isTrue();
    }

    @Test
    void clientKeyTruncatesIpv6Only() throws Exception {
        assertThat(PublicLimits.clientKey(InetAddress.getByName("2001:db8:1:2:aaaa::1")))
                .isEqualTo(PublicLimits.clientKey(InetAddress.getByName("2001:db8:1:2:bbbb::2")))
                .isEqualTo("20010db800010002/64");
        assertThat(PublicLimits.clientKey(InetAddress.getByName("203.0.113.7"))).isEqualTo("203.0.113.7");
    }

    private static Optional<InetAddress> address(String literal) throws Exception {
        return Optional.of(InetAddress.getByName(literal));
    }
}
