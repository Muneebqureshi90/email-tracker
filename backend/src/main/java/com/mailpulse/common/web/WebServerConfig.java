package com.mailpulse.common.web;

import com.mailpulse.common.MailPulseProperties;
import java.util.Locale;
import java.util.stream.Collectors;
import org.apache.catalina.connector.Connector;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.tomcat.servlet.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

/** Adds the public connector and the two filters that run before everything else, Spring Security included. */
@Configuration(proxyBeanMethods = false)
class WebServerConfig {

    @Bean
    WebServerFactoryCustomizer<TomcatServletWebServerFactory> publicConnector(
            MailPulseProperties properties, @Value("${server.address:}") String bindAddress) {
        return factory -> {
            Connector connector = new Connector("org.apache.coyote.http11.Http11NioProtocol");
            connector.setPort(properties.publicPort());
            if (!bindAddress.isBlank()) {
                connector.setProperty("address", bindAddress);
            }
            factory.addAdditionalConnectors(connector);
        };
    }

    @Bean
    FilterRegistrationBean<PortRoutingFilter> portRoutingFilter(PortRegistry ports) {
        FilterRegistrationBean<PortRoutingFilter> registration = new FilterRegistrationBean<>(new PortRoutingFilter(ports));
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return registration;
    }

    @Bean
    FilterRegistrationBean<HostHeaderFilter> hostHeaderFilter(PortRegistry ports, MailPulseProperties properties) {
        var hosts = properties.allowedHostNames().stream()
                .map(host -> host.toLowerCase(Locale.ROOT))
                .collect(Collectors.toUnmodifiableSet());
        FilterRegistrationBean<HostHeaderFilter> registration = new FilterRegistrationBean<>(new HostHeaderFilter(ports, hosts));
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 1);
        return registration;
    }
}
