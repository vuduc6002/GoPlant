package com.cmc.plant_care_backend.common.exception;

import org.springframework.http.HttpStatus;

public class ValidationException extends AppException {

    public ValidationException(String message) {
        super(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message);
    }

    public ValidationException(String message, String field) {
        super(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message, field);
    }
}
