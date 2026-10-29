package com.mailpulse.support;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Optional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Plain JDK HTTP client for tests: real sockets, no redirects followed, full control over headers. */
public final class TestHttp {

    public static final JsonMapper JSON = JsonMapper.builder().build();

    private final HttpClient client = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NEVER)
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    public Response get(URI uri, String... headers) {
        return send("GET", uri, null, headers);
    }

    public Response post(URI uri, Object body, String... headers) {
        return send("POST", uri, body, headers);
    }

    public Response put(URI uri, Object body, String... headers) {
        return send("PUT", uri, body, headers);
    }

    public Response patch(URI uri, Object body, String... headers) {
        return send("PATCH", uri, body, headers);
    }

    public Response delete(URI uri, String... headers) {
        return send("DELETE", uri, null, headers);
    }

    public Response send(String method, URI uri, Object body, String... headers) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(20));
        for (int i = 0; i < headers.length; i += 2) {
            builder.header(headers[i], headers[i + 1]);
        }
        if (body == null) {
            builder.method(method, HttpRequest.BodyPublishers.noBody());
        } else {
            builder.header("Content-Type", "application/json");
            String json = body instanceof String text ? text : JSON.writeValueAsString(body);
            builder.method(method, HttpRequest.BodyPublishers.ofString(json));
        }
        try {
            HttpResponse<byte[]> response = client.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray());
            return new Response(response.statusCode(), response.headers(), response.body());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

    public record Response(int status, HttpHeaders headers, byte[] body) {

        public String text() {
            return new String(body, StandardCharsets.UTF_8);
        }

        public JsonNode json() {
            return JSON.readTree(body);
        }

        public Optional<String> header(String name) {
            return headers.firstValue(name);
        }

        public String setCookie(String name) {
            return headers.allValues("set-cookie").stream()
                    .filter(value -> value.startsWith(name + "="))
                    .findFirst()
                    .orElseThrow(() -> new AssertionError("No Set-Cookie for " + name));
        }

        public String cookie(String name) {
            String header = setCookie(name);
            return header.substring(name.length() + 1, header.indexOf(';'));
        }
    }
}
