package com.cmc.plant_care_backend.dto.carelog;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public class CreateCareLogRequest {

    @NotNull(message = "userPlantId là bắt buộc")
    private UUID userPlantId;

    @NotBlank(message = "taskType là bắt buộc")
    private String taskType;

    private String note;

    private List<String> imageUrls;

    private OffsetDateTime performedAt;

    public CreateCareLogRequest() {}

    public UUID getUserPlantId() {
        return userPlantId;
    }

    public void setUserPlantId(UUID userPlantId) {
        this.userPlantId = userPlantId;
    }

    public String getTaskType() {
        return taskType;
    }

    public void setTaskType(String taskType) {
        this.taskType = taskType;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public List<String> getImageUrls() {
        return imageUrls;
    }

    public void setImageUrls(List<String> imageUrls) {
        this.imageUrls = imageUrls;
    }

    public OffsetDateTime getPerformedAt() {
        return performedAt;
    }

    public void setPerformedAt(OffsetDateTime performedAt) {
        this.performedAt = performedAt;
    }
}
