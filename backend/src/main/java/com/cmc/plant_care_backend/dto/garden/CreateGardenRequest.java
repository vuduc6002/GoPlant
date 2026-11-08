package com.cmc.plant_care_backend.dto.garden;

import com.cmc.plant_care_backend.model.enums.SpaceType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class CreateGardenRequest {

    @NotBlank(message = "Tên khu vườn không được để trống")
    @Size(min = 1, max = 200, message = "Tên khu vườn từ 1 đến 200 ký tự")
    private String name;

    @NotBlank(message = "Vị trí không được để trống")
    private String location;

    private SpaceType spaceType = SpaceType.BAN_CONG;

    private String description;

    private String coverImageUrl;

    public CreateGardenRequest() {}

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
