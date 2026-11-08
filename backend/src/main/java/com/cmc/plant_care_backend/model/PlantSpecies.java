package com.cmc.plant_care_backend.model;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "plant_species")
public class PlantSpecies {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "common_name", nullable = false, length = 200)
    private String commonName;

    @Column(name = "scientific_name", nullable = false, length = 200)
    private String scientificName;

    @Column(name = "category", nullable = false, length = 100)
    private String category;

    @Column(name = "difficulty", length = 50)
    private String difficulty;

    @Column(name = "light_requirement", columnDefinition = "TEXT")
    private String lightRequirement;

    @Column(name = "water_requirement", columnDefinition = "TEXT")
    private String waterRequirement;

    @Column(name = "environment", columnDefinition = "TEXT")
    private String environment;

    @Column(name = "space_requirement", columnDefinition = "TEXT")
    private String spaceRequirement;

    @Column(name = "mature_size", length = 100)
    private String matureSize;

    @Column(name = "temperature_range", length = 100)
    private String temperatureRange;

    @Column(name = "humidity_range", length = 100)
    private String humidityRange;

    @Column(name = "growing_medium", columnDefinition = "TEXT")
    private String growingMedium;

    @Column(name = "drainage", length = 100)
    private String drainage;

    @Column(name = "soil_ph", length = 50)
    private String soilPh;

    @Column(name = "sun_tolerance", length = 100)
    private String sunTolerance;

    @Column(name = "origin", columnDefinition = "TEXT")
    private String origin;

    @Column(name = "overview", columnDefinition = "TEXT")
    private String overview;

    @Column(name = "morphology", columnDefinition = "TEXT")
    private String morphology;

    @Column(name = "lifespan", length = 100)
    private String lifespan;

    @Column(name = "flowering_season", length = 100)
    private String floweringSeason;

    @Column(name = "usage_and_caution", columnDefinition = "TEXT")
    private String usageAndCaution;

    @Column(name = "growth_rate", length = 100)
    private String growthRate;

    @Column(name = "watering_frequency", length = 100)
    private String wateringFrequency;

    @Column(name = "nutrition", columnDefinition = "TEXT")
    private String nutrition;

    @Column(name = "thumbnail_url", columnDefinition = "TEXT")
    private String thumbnailUrl;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    public PlantSpecies() {}

    @PrePersist
    protected void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = OffsetDateTime.now();
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getCommonName() {
        return commonName;
    }

    public void setCommonName(String commonName) {
        this.commonName = commonName;
    }

    public String getScientificName() {
        return scientificName;
    }

    public void setScientificName(String scientificName) {
        this.scientificName = scientificName;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String getDifficulty() {
        return difficulty;
    }

    public void setDifficulty(String difficulty) {
        this.difficulty = difficulty;
    }

    public String getLightRequirement() {
        return lightRequirement;
    }

    public void setLightRequirement(String lightRequirement) {
        this.lightRequirement = lightRequirement;
    }

    public String getWaterRequirement() {
        return waterRequirement;
    }

    public void setWaterRequirement(String waterRequirement) {
        this.waterRequirement = waterRequirement;
    }

    public String getEnvironment() {
        return environment;
    }

    public void setEnvironment(String environment) {
        this.environment = environment;
    }

    public String getSpaceRequirement() {
        return spaceRequirement;
    }

    public void setSpaceRequirement(String spaceRequirement) {
        this.spaceRequirement = spaceRequirement;
    }

    public String getMatureSize() {
        return matureSize;
    }

    public void setMatureSize(String matureSize) {
        this.matureSize = matureSize;
    }

    public String getTemperatureRange() {
        return temperatureRange;
    }

    public void setTemperatureRange(String temperatureRange) {
        this.temperatureRange = temperatureRange;
    }

    public String getHumidityRange() {
        return humidityRange;
    }

    public void setHumidityRange(String humidityRange) {
        this.humidityRange = humidityRange;
    }

    public String getGrowingMedium() {
        return growingMedium;
    }

    public void setGrowingMedium(String growingMedium) {
        this.growingMedium = growingMedium;
    }

    public String getDrainage() {
        return drainage;
    }

    public void setDrainage(String drainage) {
        this.drainage = drainage;
    }

    public String getSoilPh() {
        return soilPh;
    }

    public void setSoilPh(String soilPh) {
        this.soilPh = soilPh;
    }

    public String getSunTolerance() {
        return sunTolerance;
    }

    public void setSunTolerance(String sunTolerance) {
        this.sunTolerance = sunTolerance;
    }

    public String getOrigin() {
        return origin;
    }

    public void setOrigin(String origin) {
        this.origin = origin;
    }

    public String getOverview() {
        return overview;
    }

    public void setOverview(String overview) {
        this.overview = overview;
    }

    public String getMorphology() {
        return morphology;
    }

    public void setMorphology(String morphology) {
        this.morphology = morphology;
    }

    public String getLifespan() {
        return lifespan;
    }

    public void setLifespan(String lifespan) {
        this.lifespan = lifespan;
    }

    public String getFloweringSeason() {
        return floweringSeason;
    }

    public void setFloweringSeason(String floweringSeason) {
        this.floweringSeason = floweringSeason;
    }

    public String getUsageAndCaution() {
        return usageAndCaution;
    }

    public void setUsageAndCaution(String usageAndCaution) {
        this.usageAndCaution = usageAndCaution;
    }

    public String getGrowthRate() {
        return growthRate;
    }

    public void setGrowthRate(String growthRate) {
        this.growthRate = growthRate;
    }

    public String getWateringFrequency() {
        return wateringFrequency;
    }

    public void setWateringFrequency(String wateringFrequency) {
        this.wateringFrequency = wateringFrequency;
    }

    public String getNutrition() {
        return nutrition;
    }

    public void setNutrition(String nutrition) {
        this.nutrition = nutrition;
    }

    public String getThumbnailUrl() {
        return thumbnailUrl;
    }

    public void setThumbnailUrl(String thumbnailUrl) {
        this.thumbnailUrl = thumbnailUrl;
    }

    public Boolean getIsActive() {
        return isActive;
    }

    public void setIsActive(Boolean isActive) {
        this.isActive = isActive;
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
