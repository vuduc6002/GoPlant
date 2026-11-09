package com.cmc.plant_care_backend.dto.plant;

import com.cmc.plant_care_backend.model.enums.HealthStatus;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public class UpdateUserPlantRequest {

    @Size(max = 200, message = "displayName không được vượt quá 200 ký tự")
    private String displayName;

    @Size(max = 200, message = "location không được vượt quá 200 ký tự")
    private String location;

    private LocalDate plantedAt;

    private String note;

    private HealthStatus healthStatus;

    private String imageUrl;

    public UpdateUserPlantRequest() {}

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public LocalDate getPlantedAt() {
        return plantedAt;
    }

    public void setPlantedAt(LocalDate plantedAt) {
        this.plantedAt = plantedAt;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public HealthStatus getHealthStatus() {
        return healthStatus;
    }

    public void setHealthStatus(HealthStatus healthStatus) {
        this.healthStatus = healthStatus;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
    }
}
