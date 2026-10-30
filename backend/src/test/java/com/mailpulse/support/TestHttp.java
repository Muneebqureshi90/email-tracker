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
        return execute(builder);
    }

    /** A body of any type, sent as is (for example text/plain from sendBeacon). */
    public Response sendRaw(String method, URI uri, String contentType, byte[] body, String... headers) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(20));
        for (int i = 0; i < headers.length; i += 2) {
            builder.header(headers[i], headers[i + 1]);
        }
        if (contentType != null) {
            builder.header("Content-Type", contentType);
        }
        builder.method(method, HttpRequest.BodyPublishers.ofByteArray(body));
        return execute(builder);
    }

    /** multipart/form-data with one file part ({@code file}) and optional text fields (name, value, name, value...). */
    public Response multipart(String method, URI uri, String filename, String partType, byte[] file, String[] fields, String... headers) {
        String boundary = "mp-test-" + System.nanoTime();
        java.io.ByteArrayOutputStream body = new java.io.ByteArrayOutputStream();
        for (int i = 0; i < fields.length; i += 2) {
            body.writeBytes(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + fields[i] + "\"\r\n\r\n" + fields[i + 1]
                    + "\r\n").getBytes(StandardCharsets.UTF_8));
        }
        body.writeBytes(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"" + filename + "\"\r\n"
                + "Content-Type: " + partType + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        body.writeBytes(file);
        body.writeBytes(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        return sendRaw(method, uri, "multipart/form-data; boundary=" + boundary, body.toByteArray(), headers);
    }

    private Response execute(HttpRequest.Builder builder) {
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
