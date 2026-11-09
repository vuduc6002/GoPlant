package com.cmc.plant_care_backend.dto.plant;

import com.cmc.plant_care_backend.dto.species.SpeciesSummaryResponse;
import com.cmc.plant_care_backend.model.enums.HealthStatus;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

public class UserPlantDetailResponse {

    private UUID id;
    private String displayName;
    private String location;
    private LocalDate plantedAt;
    private String note;
    private HealthStatus healthStatus;
    private String plantCode;
    private String imageUrl;
    private SpeciesSummaryResponse species;
    private PlantGardenSummaryDto garden;
    private OffsetDateTime createdAt;

    public UserPlantDetailResponse() {}

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
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

    public HealthStatus getHealthStatus() {
        return healthStatus;
    }

    public void setHealthStatus(HealthStatus healthStatus) {
        this.healthStatus = healthStatus;
    }

    public String getPlantCode() {
        return plantCode;
    }

    public void setPlantCode(String plantCode) {
        this.plantCode = plantCode;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
    }

    public SpeciesSummaryResponse getSpecies() {
        return species;
    }

    public void setSpecies(SpeciesSummaryResponse species) {
        this.species = species;
    }

    public PlantGardenSummaryDto getGarden() {
        return garden;
    }

    public void setGarden(PlantGardenSummaryDto garden) {
        this.garden = garden;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
