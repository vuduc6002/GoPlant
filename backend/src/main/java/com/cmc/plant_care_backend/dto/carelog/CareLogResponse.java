package com.cmc.plant_care_backend.dto.carelog;

import com.cmc.plant_care_backend.model.enums.CareLogStatus;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public class CareLogResponse {

    private UUID id;
    private UUID userPlantId;
    private String taskType;
    private CareLogStatus status;
    private String note;
    private List<String> imageUrls;
    private OffsetDateTime performedAt;
    private OffsetDateTime createdAt;

    public CareLogResponse() {}

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

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

    public CareLogStatus getStatus() {
        return status;
    }

    public void setStatus(CareLogStatus status) {
        this.status = status;
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

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
