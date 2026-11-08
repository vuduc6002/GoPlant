package com.cmc.plant_care_backend.dto.garden;

import com.cmc.plant_care_backend.model.enums.SpaceType;
import jakarta.validation.constraints.Size;

public class UpdateGardenRequest {

    @Size(min = 1, max = 200, message = "Tên khu vườn từ 1 đến 200 ký tự")
    private String name;

    private String location;

    private SpaceType spaceType;

    private String description;

    private String coverImageUrl;

    public UpdateGardenRequest() {}

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public SpaceType getSpaceType() {
        return spaceType;
    }

    public void setSpaceType(SpaceType spaceType) {
        this.spaceType = spaceType;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getCoverImageUrl() {
        return coverImageUrl;
    }

    public void setCoverImageUrl(String coverImageUrl) {
        this.coverImageUrl = coverImageUrl;
    }
}
