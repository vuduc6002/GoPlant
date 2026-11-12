package com.cmc.plant_care_backend.dto.monitoring;

import java.util.UUID;

public class MonitoringGardenSummaryDto {

    private UUID gardenId;
    private String name;
    private int plantCount;
    private int attentionCount;

    public MonitoringGardenSummaryDto() {}

    public MonitoringGardenSummaryDto(UUID gardenId, String name, int plantCount, int attentionCount) {
        this.gardenId = gardenId;
        this.name = name;
        this.plantCount = plantCount;
        this.attentionCount = attentionCount;
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

    public int getPlantCount() {
        return plantCount;
    }

    public void setPlantCount(int plantCount) {
        this.plantCount = plantCount;
    }

    public int getAttentionCount() {
        return attentionCount;
    }

    public void setAttentionCount(int attentionCount) {
        this.attentionCount = attentionCount;
    }
}
