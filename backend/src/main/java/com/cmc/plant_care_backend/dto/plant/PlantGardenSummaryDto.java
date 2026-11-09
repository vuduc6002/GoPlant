package com.cmc.plant_care_backend.dto.plant;

import java.util.UUID;

public class PlantGardenSummaryDto {

    private UUID id;
    private String name;

    public PlantGardenSummaryDto() {}

    public PlantGardenSummaryDto(UUID id, String name) {
        this.id = id;
        this.name = name;
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }
}
