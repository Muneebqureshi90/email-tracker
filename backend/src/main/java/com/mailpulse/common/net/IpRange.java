package com.mailpulse.common.net;

import java.net.InetAddress;

/** A CIDR range such as 172.16.0.0/12 or ::1/128. */
record IpRange(byte[] network, int prefixLength) {

    static IpRange parse(String cidr) {
        String[] parts = cidr.trim().split("/", 2);
        byte[] address = InetAddress.ofLiteral(parts[0].trim()).getAddress();
        int bits = address.length * 8;
        int prefix = parts.length == 2 ? Integer.parseInt(parts[1].trim()) : bits;
        if (prefix < 0 || prefix > bits) {
            throw new IllegalArgumentException("Invalid CIDR range: " + cidr);
        }
        return new IpRange(address, prefix);
    }

    boolean contains(InetAddress candidate) {
        byte[] value = candidate.getAddress();
        if (value.length != network.length) {
            return false;
        }
        int fullBytes = prefixLength / 8;
        for (int i = 0; i < fullBytes; i++) {
            if (value[i] != network[i]) {
                return false;
            }
        }
        int remainingBits = prefixLength % 8;
        if (remainingBits == 0) {
            return true;
        }
        int mask = (0xFF << (8 - remainingBits)) & 0xFF;
        return (value[fullBytes] & mask) == (network[fullBytes] & mask);
    }
}
