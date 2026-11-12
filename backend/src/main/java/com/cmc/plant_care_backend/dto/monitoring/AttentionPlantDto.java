package com.cmc.plant_care_backend.dto.monitoring;

import com.cmc.plant_care_backend.model.enums.HealthStatus;

import java.util.UUID;

public class AttentionPlantDto {

    private UUID plantId;
    private String displayName;
    private UUID gardenId;
    private String gardenName;
    private String speciesName;
    private HealthStatus healthStatus;

    public AttentionPlantDto() {}

    public AttentionPlantDto(
        UUID plantId,
        String displayName,
        UUID gardenId,
        String gardenName,
        String speciesName,
        HealthStatus healthStatus
    ) {
        this.plantId = plantId;
        this.displayName = displayName;
        this.gardenId = gardenId;
        this.gardenName = gardenName;
        this.speciesName = speciesName;
        this.healthStatus = healthStatus;
    }

    public UUID getPlantId() {
        return plantId;
    }

    public void setPlantId(UUID plantId) {
        this.plantId = plantId;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public UUID getGardenId() {
        return gardenId;
    }

    public void setGardenId(UUID gardenId) {
        this.gardenId = gardenId;
    }

    public String getGardenName() {
        return gardenName;
    }

    public void setGardenName(String gardenName) {
        this.gardenName = gardenName;
    }

    public String getSpeciesName() {
        return speciesName;
    }

    public void setSpeciesName(String speciesName) {
        this.speciesName = speciesName;
    }

    public HealthStatus getHealthStatus() {
        return healthStatus;
    }

    public void setHealthStatus(HealthStatus healthStatus) {
        this.healthStatus = healthStatus;
    }
}
