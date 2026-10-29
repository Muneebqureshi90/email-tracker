package com.mailpulse.common.web;

import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/** Turns every error into an RFC 9457 problem response without leaking internals. */
@RestControllerAdvice
class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ProblemDetail> handleApiException(ApiException exception) {
        return ResponseEntity.status(exception.status())
                .body(ProblemDetail.forStatusAndDetail(exception.status(), exception.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ProblemDetail> handleUnexpected(Exception exception) {
        log.error("Unexpected error ({})", exception.getClass().getName(), exception);
        return ResponseEntity.internalServerError()
                .body(ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "Unexpected error"));
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException exception, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Invalid request");
        List<Map<String, String>> errors = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> Map.of("field", error.getField(), "message", String.valueOf(error.getDefaultMessage())))
                .toList();
        problem.setProperty("errors", errors);
        return ResponseEntity.badRequest().body(problem);
    }
}
