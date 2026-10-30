package com.mailpulse.documents;

import com.mailpulse.common.net.ClientAddress;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Optional;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

/**
 * The viewer's own files under /d/_/ (public port), from classpath:/static/viewer/ only. PortRoutingFilter has
 * already refused anything that is not a plain nested path; ViewerFiles checks again and knows the media types.
 */
@RestController
class ViewerAssetController {

    static final String PREFIX = "/d/_/";

    private final ViewerFiles viewer;
    private final PublicLimits limits;
    private final ClientAddress clients;

    ViewerAssetController(ViewerFiles viewer, PublicLimits limits, ClientAddress clients) {
        this.viewer = viewer;
        this.limits = limits;
        this.clients = clients;
    }

    @RequestMapping(path = "/d/_/**", method = {RequestMethod.GET, RequestMethod.HEAD})
    ResponseEntity<Resource> asset(HttpServletRequest request) {
        String uri = request.getRequestURI();
        Optional<ViewerFiles.Asset> asset = uri.startsWith(PREFIX) ? viewer.asset(uri.substring(PREFIX.length())) : Optional.empty();
        if (asset.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        if (!limits.asset(clients.resolve(request))) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).build();
        }
        return ResponseEntity.ok()
                .contentType(asset.get().type())
                .header(HttpHeaders.CACHE_CONTROL, asset.get().cacheControl())
                .header("Content-Security-Policy", PublicDocumentController.VIEWER_CSP)
                .header("Referrer-Policy", "no-referrer")
                .header("X-Content-Type-Options", "nosniff")
                .body(asset.get().resource());
    }
}
