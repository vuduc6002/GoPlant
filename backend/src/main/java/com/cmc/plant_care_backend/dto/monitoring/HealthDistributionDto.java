package com.cmc.plant_care_backend.dto.monitoring;

public class HealthDistributionDto {

    private int healthyCount;
    private int needsAttentionCount;
    private int criticalCount;
    private int unknownCount;

    public HealthDistributionDto() {}

    public HealthDistributionDto(int healthyCount, int needsAttentionCount, int criticalCount, int unknownCount) {
        this.healthyCount = healthyCount;
        this.needsAttentionCount = needsAttentionCount;
        this.criticalCount = criticalCount;
        this.unknownCount = unknownCount;
    }

    public int getHealthyCount() {
        return healthyCount;
    }

    public void setHealthyCount(int healthyCount) {
        this.healthyCount = healthyCount;
    }

    public int getNeedsAttentionCount() {
        return needsAttentionCount;
    }

    public void setNeedsAttentionCount(int needsAttentionCount) {
        this.needsAttentionCount = needsAttentionCount;
    }

    public int getCriticalCount() {
        return criticalCount;
    }

    public void setCriticalCount(int criticalCount) {
        this.criticalCount = criticalCount;
    }

    public int getUnknownCount() {
        return unknownCount;
    }

    public void setUnknownCount(int unknownCount) {
        this.unknownCount = unknownCount;
    }
}
