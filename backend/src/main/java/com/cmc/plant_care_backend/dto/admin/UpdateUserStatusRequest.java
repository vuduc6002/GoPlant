package com.cmc.plant_care_backend.dto.admin;

import com.cmc.plant_care_backend.model.enums.UserStatus;
import jakarta.validation.constraints.NotNull;

public class UpdateUserStatusRequest {

    @NotNull(message = "status là bắt buộc")
    private UserStatus status;

    public UpdateUserStatusRequest() {}

    public UpdateUserStatusRequest(UserStatus status) {
        this.status = status;
    }

    public UserStatus getStatus() {
        return status;
    }

    public void setStatus(UserStatus status) {
        this.status = status;
    }
}
