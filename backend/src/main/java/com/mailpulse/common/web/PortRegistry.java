package com.mailpulse.common.web;

import org.apache.catalina.connector.Connector;
import org.springframework.boot.tomcat.TomcatWebServer;
import org.springframework.boot.web.server.context.WebServerInitializedEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.stereotype.Component;

/** Remembers which port the public connector actually bound to (it can be random in tests). */
@Component
public class PortRegistry implements ApplicationListener<WebServerInitializedEvent> {

    private volatile int publicPort = -1;
    private volatile int privatePort = -1;

    @Override
    public void onApplicationEvent(WebServerInitializedEvent event) {
        if (!(event.getWebServer() instanceof TomcatWebServer tomcat)) {
            return;
        }
        int primary = tomcat.getPort();
        for (Connector connector : tomcat.getTomcat().getService().findConnectors()) {
            if (connector.getLocalPort() != primary) {
                publicPort = connector.getLocalPort();
            }
        }
        privatePort = primary;
    }

    public boolean isPublic(int localPort) {
        return localPort == publicPort;
    }

    public int publicPort() {
        return publicPort;
    }

    public int privatePort() {
        return privatePort;
    }
}
