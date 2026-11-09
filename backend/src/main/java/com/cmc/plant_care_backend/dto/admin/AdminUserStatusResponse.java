package com.cmc.plant_care_backend.dto.admin;

import com.cmc.plant_care_backend.model.enums.UserStatus;

import java.util.UUID;

public class AdminUserStatusResponse {

    private UUID userId;
    private UserStatus newStatus;
    private String message;

    public AdminUserStatusResponse() {}

    public AdminUserStatusResponse(UUID userId, UserStatus newStatus, String message) {
        this.userId = userId;
        this.newStatus = newStatus;
        this.message = message;
    }

    public UUID getUserId() {
        return userId;
    }

    public void setUserId(UUID userId) {
        this.userId = userId;
    }

    public UserStatus getNewStatus() {
        return newStatus;
    }

    public void setNewStatus(UserStatus newStatus) {
        this.newStatus = newStatus;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}
