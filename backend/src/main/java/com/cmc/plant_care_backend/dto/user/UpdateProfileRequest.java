package com.cmc.plant_care_backend.dto.user;

import com.cmc.plant_care_backend.model.enums.PreferredDevice;
import jakarta.validation.constraints.Size;

public class UpdateProfileRequest {

    @Size(min = 2, max = 200, message = "Họ và tên phải từ 2 đến 200 ký tự")
    private String fullName;

    private String recoveryEmail;

    private PreferredDevice preferredDevice;

    private String avatarUrl;

    public UpdateProfileRequest() {}

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
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

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public void setAvatarUrl(String avatarUrl) {
        this.avatarUrl = avatarUrl;
    }
}
