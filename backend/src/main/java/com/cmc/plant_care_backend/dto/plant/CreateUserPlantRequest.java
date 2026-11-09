package com.cmc.plant_care_backend.dto.plant;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.UUID;

public class CreateUserPlantRequest {

    @NotNull(message = "speciesId là bắt buộc")
    private UUID speciesId;

    @NotBlank(message = "displayName không được để trống")
    @Size(max = 200, message = "displayName không được vượt quá 200 ký tự")
    private String displayName;

    @Size(max = 200, message = "location không được vượt quá 200 ký tự")
    private String location;

    private LocalDate plantedAt;

    private String note;

    private String imageUrl;

    public CreateUserPlantRequest() {}

    public UUID getSpeciesId() {
        return speciesId;
    }

    public void setSpeciesId(UUID speciesId) {
        this.speciesId = speciesId;
    }

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

    public String getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
    }
}
