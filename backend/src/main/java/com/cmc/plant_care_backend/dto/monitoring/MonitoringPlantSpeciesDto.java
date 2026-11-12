package com.cmc.plant_care_backend.dto.monitoring;

import java.util.UUID;

public class MonitoringPlantSpeciesDto {

    private UUID id;
    private String commonName;
    private String scientificName;
    private String category;

    public MonitoringPlantSpeciesDto() {}

    public MonitoringPlantSpeciesDto(UUID id, String commonName, String scientificName, String category) {
        this.id = id;
        this.commonName = commonName;
        this.scientificName = scientificName;
        this.category = category;
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
}
