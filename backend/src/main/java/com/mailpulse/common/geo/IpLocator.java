package com.mailpulse.common.geo;

import java.util.Optional;

/** Approximate location of a stored network prefix such as "203.0.113.0/24" (D-133). */
public interface IpLocator {

    /** Empty when the prefix is private or unknown, or when no database is installed. Never throws. */
    Optional<IpLocation> locate(String ipPrefix);
}
