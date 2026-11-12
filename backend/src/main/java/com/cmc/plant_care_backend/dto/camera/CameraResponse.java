package com.cmc.plant_care_backend.dto.camera;

import com.cmc.plant_care_backend.model.enums.CameraStatus;

import java.time.OffsetDateTime;
import java.util.UUID;

public class CameraResponse {

    private UUID id;
    private UUID gardenId;
    private String name;
    private String locationDesc;
    private CameraStatus status;
    private String connectionNote;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;

    public CameraResponse() {}

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getGardenId() {
        return gardenId;
    }

    public void setGardenId(UUID gardenId) {
        this.gardenId = gardenId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getLocationDesc() {
        return locationDesc;
    }

    public void setLocationDesc(String locationDesc) {
        this.locationDesc = locationDesc;
    }

    public CameraStatus getStatus() {
        return status;
    }

    public void setStatus(CameraStatus status) {
        this.status = status;
    }

    public String getConnectionNote() {
        return connectionNote;
    }

    public void setConnectionNote(String connectionNote) {
        this.connectionNote = connectionNote;
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
