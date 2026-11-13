package com.cmc.plant_care_backend.common.exception;

import org.springframework.http.HttpStatus;

public class StorageUnavailableException extends AppException {

    private final boolean indefinite;

    public StorageUnavailableException(String message) {
        this(message, false);
    }

    public StorageUnavailableException(String message, boolean indefinite) {
        super(HttpStatus.SERVICE_UNAVAILABLE, "STORAGE_UNAVAILABLE", message);
        this.indefinite = indefinite;
    }

    public boolean isIndefinite() {
        return indefinite;
    }
}
