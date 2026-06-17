package com.example.offline_router.config;

import ch.qos.logback.classic.pattern.ClassicConverter;
import ch.qos.logback.classic.spi.ILoggingEvent;

/**
 * Logback log message converter filtering and masking sensitive credentials.
 * Automatically intercepts log output and redacts passwords, tokens, API keys,
 * and database URLs with embedded credentials to prevent exposure of sensitive details.
 */
public class MaskedMessageConverter extends ClassicConverter {

    @Override
    public String convert(ILoggingEvent event) {
        String message = event.getFormattedMessage();
        if (message == null) {
            return "";
        }

        // 1. Mask passwords (e.g. password=xyz, password: xyz)
        message = message.replaceAll("(?i)(password[\\s]*=[\\s]*)[^\\s,;]+", "$1***");
        message = message.replaceAll("(?i)(password[\\s]*:\\s*)[^\\s,;]+", "$1***");

        // 2. Mask database connection string embedded passwords (e.g. jdbc:postgresql://user:password@host:port/db)
        message = message.replaceAll("(?i)(jdbc:[^:]+://[^:]+:)[^@]+(@)", "$1***$2");

        // 3. Mask bearer and general session tokens
        message = message.replaceAll("(?i)(token[\\s]*=[\\s]*)[^\\s,;]+", "$1***");
        message = message.replaceAll("(?i)(bearer[\\s]+)[^\\s]+", "$1***");

        // 4. Mask api keys
        message = message.replaceAll("(?i)(api[_-]?key[\\s]*=[\\s]*)[^\\s,;]+", "$1***");

        return message;
    }
}
