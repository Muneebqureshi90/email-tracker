package com.mailpulse;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;

/** MailPulse backend: public tracking endpoints plus the private owner/extension API. */
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
@ConfigurationPropertiesScan
public class MailPulseApplication {

    public static void main(String[] args) {
        SpringApplication.run(MailPulseApplication.class, args);
    }
}
