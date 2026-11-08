package com.cmc.plant_care_backend.dto.auth;

import java.util.UUID;

public class RegisterResponse {

    private UUID userId;
    private String fullName;
    private String message;

    public RegisterResponse() {}

    public RegisterResponse(UUID userId, String fullName, String message) {
        this.userId = userId;
        this.fullName = fullName;
        this.message = message;
    }

    public UUID getUserId() {
        return userId;
    }

    public void setUserId(UUID userId) {
        this.userId = userId;
    }

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}
