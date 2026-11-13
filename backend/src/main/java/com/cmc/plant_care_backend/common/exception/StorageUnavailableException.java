package com.cmc.plant_care_backend.common.exception;

import org.springframework.http.HttpStatus;

public class StorageUnavailableException extends AppException {

    public StorageUnavailableException(String message) {
        super(HttpStatus.SERVICE_UNAVAILABLE, "STORAGE_UNAVAILABLE", message);
    }
}
