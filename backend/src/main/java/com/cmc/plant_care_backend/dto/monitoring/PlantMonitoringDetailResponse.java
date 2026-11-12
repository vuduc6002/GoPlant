package com.cmc.plant_care_backend.dto.monitoring;

import com.cmc.plant_care_backend.model.enums.HealthStatus;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public class PlantMonitoringDetailResponse {

    private UUID plantId;
    private String displayName;
    private MonitoringPlantGardenDto garden;
    private MonitoringPlantSpeciesDto species;
    private HealthStatus currentHealthStatus;
    private LocalDate plantedAt;
    private Integer ageDays;
    private SchedulesSummaryDto schedulesSummary;
    private CareLogsWindowSummaryDto careLogsSummary30d;
    private List<MonitoringActivityItemDto> recentActivityTimeline;
    private List<MonitoringJournalObservationDto> recentJournalObservations;
    private SpeciesCareGuideDto speciesCareGuide;
    private boolean sensorConnected;
    private OffsetDateTime generatedAt;

    public PlantMonitoringDetailResponse() {}

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

    public MonitoringPlantGardenDto getGarden() {
        return garden;
    }

    public void setGarden(MonitoringPlantGardenDto garden) {
        this.garden = garden;
    }

    public MonitoringPlantSpeciesDto getSpecies() {
        return species;
    }

    public void setSpecies(MonitoringPlantSpeciesDto species) {
        this.species = species;
    }

    public HealthStatus getCurrentHealthStatus() {
        return currentHealthStatus;
    }

    public void setCurrentHealthStatus(HealthStatus currentHealthStatus) {
        this.currentHealthStatus = currentHealthStatus;
    }

    public LocalDate getPlantedAt() {
        return plantedAt;
    }

    public void setPlantedAt(LocalDate plantedAt) {
        this.plantedAt = plantedAt;
    }

    public Integer getAgeDays() {
        return ageDays;
    }

    public void setAgeDays(Integer ageDays) {
        this.ageDays = ageDays;
    }

    public SchedulesSummaryDto getSchedulesSummary() {
        return schedulesSummary;
    }

    public void setSchedulesSummary(SchedulesSummaryDto schedulesSummary) {
        this.schedulesSummary = schedulesSummary;
    }

    public CareLogsWindowSummaryDto getCareLogsSummary30d() {
        return careLogsSummary30d;
    }

    public void setCareLogsSummary30d(CareLogsWindowSummaryDto careLogsSummary30d) {
        this.careLogsSummary30d = careLogsSummary30d;
    }

    public List<MonitoringActivityItemDto> getRecentActivityTimeline() {
        return recentActivityTimeline;
    }

    public void setRecentActivityTimeline(List<MonitoringActivityItemDto> recentActivityTimeline) {
        this.recentActivityTimeline = recentActivityTimeline;
    }

    public List<MonitoringJournalObservationDto> getRecentJournalObservations() {
        return recentJournalObservations;
    }

    public void setRecentJournalObservations(List<MonitoringJournalObservationDto> recentJournalObservations) {
        this.recentJournalObservations = recentJournalObservations;
    }

    public SpeciesCareGuideDto getSpeciesCareGuide() {
        return speciesCareGuide;
    }

    public void setSpeciesCareGuide(SpeciesCareGuideDto speciesCareGuide) {
        this.speciesCareGuide = speciesCareGuide;
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
