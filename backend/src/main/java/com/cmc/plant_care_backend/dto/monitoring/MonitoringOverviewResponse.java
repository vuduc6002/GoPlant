package com.cmc.plant_care_backend.dto.monitoring;

import java.time.OffsetDateTime;
import java.util.List;

public class MonitoringOverviewResponse {

    private int gardensCount;
    private int plantsCount;
    private HealthDistributionDto healthDistribution;
    private SchedulesSummaryDto schedulesSummary;
    private CareLogsWindowSummaryDto careLogsSummary7d;
    private CareLogsWindowSummaryDto careLogsSummary30d;
    private List<AttentionPlantDto> attentionPlants;
    private List<MonitoringGardenSummaryDto> gardensSummary;
    private boolean sensorConnected;
    private OffsetDateTime generatedAt;

    public MonitoringOverviewResponse() {}

    public int getGardensCount() {
        return gardensCount;
    }

    public void setGardensCount(int gardensCount) {
        this.gardensCount = gardensCount;
    }

    public int getPlantsCount() {
        return plantsCount;
    }

    public void setPlantsCount(int plantsCount) {
        this.plantsCount = plantsCount;
    }

    public HealthDistributionDto getHealthDistribution() {
        return healthDistribution;
    }

    public void setHealthDistribution(HealthDistributionDto healthDistribution) {
        this.healthDistribution = healthDistribution;
    }

    public SchedulesSummaryDto getSchedulesSummary() {
        return schedulesSummary;
    }

    public void setSchedulesSummary(SchedulesSummaryDto schedulesSummary) {
        this.schedulesSummary = schedulesSummary;
    }

    public CareLogsWindowSummaryDto getCareLogsSummary7d() {
        return careLogsSummary7d;
    }

    public void setCareLogsSummary7d(CareLogsWindowSummaryDto careLogsSummary7d) {
        this.careLogsSummary7d = careLogsSummary7d;
    }

    public CareLogsWindowSummaryDto getCareLogsSummary30d() {
        return careLogsSummary30d;
    }

    public void setCareLogsSummary30d(CareLogsWindowSummaryDto careLogsSummary30d) {
        this.careLogsSummary30d = careLogsSummary30d;
    }

    public List<AttentionPlantDto> getAttentionPlants() {
        return attentionPlants;
    }

    public void setAttentionPlants(List<AttentionPlantDto> attentionPlants) {
        this.attentionPlants = attentionPlants;
    }

    public List<MonitoringGardenSummaryDto> getGardensSummary() {
        return gardensSummary;
    }

    public void setGardensSummary(List<MonitoringGardenSummaryDto> gardensSummary) {
        this.gardensSummary = gardensSummary;
    }

    public boolean isSensorConnected() {
        return sensorConnected;
    }

    public void setSensorConnected(boolean sensorConnected) {
        this.sensorConnected = sensorConnected;
    }

    public OffsetDateTime getGeneratedAt() {
        return generatedAt;
    }

    public void setGeneratedAt(OffsetDateTime generatedAt) {
        this.generatedAt = generatedAt;
    }
}
