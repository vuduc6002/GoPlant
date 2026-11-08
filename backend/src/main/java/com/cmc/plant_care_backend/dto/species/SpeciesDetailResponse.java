package com.cmc.plant_care_backend.dto.species;

import java.time.OffsetDateTime;
import java.util.UUID;

public class SpeciesDetailResponse {

    private UUID id;
    private String commonName;
    private String scientificName;
    private String category;
    private String difficulty;
    private String lightRequirement;
    private String waterRequirement;
    private String environment;
    private String spaceRequirement;
    private String matureSize;
    private String temperatureRange;
    private String humidityRange;
    private String growingMedium;
    private String drainage;
    private String soilPh;
    private String sunTolerance;
    private String origin;
    private String overview;
    private String morphology;
    private String lifespan;
    private String floweringSeason;
    private String usageAndCaution;
    private String growthRate;
    private String wateringFrequency;
    private String nutrition;
    private String thumbnailUrl;
    private Boolean isFavorited = false;
    private Boolean isActive;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;

    public SpeciesDetailResponse() {}

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

    public Boolean getIsFavorited() {
        return isFavorited;
    }

    public void setIsFavorited(Boolean favorited) {
        isFavorited = favorited;
    }

    public Boolean getIsActive() {
        return isActive;
    }

    public void setIsActive(Boolean active) {
        isActive = active;
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
