package com.mailpulse.tracking;

import com.mailpulse.common.geo.IpLocation;
import com.mailpulse.common.geo.IpLocator;
import com.mailpulse.emails.EmailApi;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Adds the approximate location of each event's network (D-133). Gmail, Outlook, Yahoo and Apple Mail
 * fetch images for the reader, so the address belongs to the mail service: those events get none (D-034).
 */
@Component
public class EventLocations {

    private final IpLocator locator;

    EventLocations(IpLocator locator) {
        this.locator = locator;
    }

    public List<EmailApi.EventView> addTo(List<EmailApi.EventView> events) {
        return events.stream().map(event -> event.withLocation(locate(event))).toList();
    }

    private IpLocation locate(EmailApi.EventView event) {
        if (event.ipPrefix() == null || Source.valueOf(event.source()).isMailProxy()) {
            return null;
        }
        return locator.locate(event.ipPrefix()).orElse(null);
    }
}
