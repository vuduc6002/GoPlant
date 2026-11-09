package com.cmc.plant_care_backend.dto.admin;

import com.cmc.plant_care_backend.model.enums.PreferredDevice;
import com.cmc.plant_care_backend.model.enums.UserStatus;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public class AdminUserDetailResponse {

    private UUID id;
    private String fullName;
    private String email;
    private String phoneNumber;
    private String recoveryEmail;
    private PreferredDevice preferredDevice;
    private UserStatus status;
    private String avatarUrl;
    private List<String> roles;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;

    public AdminUserDetailResponse() {}

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPhoneNumber() {
        return phoneNumber;
    }

    public void setPhoneNumber(String phoneNumber) {
        this.phoneNumber = phoneNumber;
    }

    public String getRecoveryEmail() {
        return recoveryEmail;
    }

    public void setRecoveryEmail(String recoveryEmail) {
        this.recoveryEmail = recoveryEmail;
    }

    public PreferredDevice getPreferredDevice() {
        return preferredDevice;
    }

    public void setPreferredDevice(PreferredDevice preferredDevice) {
        this.preferredDevice = preferredDevice;
    }

    public UserStatus getStatus() {
        return status;
    }

    public void setStatus(UserStatus status) {
        this.status = status;
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public void setAvatarUrl(String avatarUrl) {
        this.avatarUrl = avatarUrl;
    }

    public List<String> getRoles() {
        return roles;
    }

    public void setRoles(List<String> roles) {
        this.roles = roles;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(OffsetDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
