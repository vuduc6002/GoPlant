package com.cmc.plant_care_backend.common.exception;

import org.springframework.http.HttpStatus;

public class ConflictException extends AppException {

    public ConflictException(String message) {
        super(HttpStatus.CONFLICT, "CONFLICT", message);
    }

    public ConflictException(String message, String field) {
        super(HttpStatus.CONFLICT, "CONFLICT", message, field);
    }
}
