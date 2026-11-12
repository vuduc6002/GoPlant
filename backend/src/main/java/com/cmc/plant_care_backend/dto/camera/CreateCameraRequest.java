package com.cmc.plant_care_backend.dto.camera;

import jakarta.validation.constraints.NotBlank;

public class CreateCameraRequest {

    @NotBlank(message = "Tên camera không được để trống")
    private String name;

    private String locationDesc;

    private String connectionNote;

    public CreateCameraRequest() {}

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getLocationDesc() {
        return locationDesc;
    }

    public void setLocationDesc(String locationDesc) {
        this.locationDesc = locationDesc;
    }

    public String getConnectionNote() {
        return connectionNote;
    }

    public void setConnectionNote(String connectionNote) {
        this.connectionNote = connectionNote;
    }
}
