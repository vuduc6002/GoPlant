package com.cmc.plant_care_backend.dto.camera;

import com.cmc.plant_care_backend.model.enums.CameraStatus;

public class UpdateCameraRequest {

    private String name;

    private String locationDesc;

    private CameraStatus status;

    private String connectionNote;

    public UpdateCameraRequest() {}

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

    public CameraStatus getStatus() {
        return status;
    }

    public void setStatus(CameraStatus status) {
        this.status = status;
    }

    public String getConnectionNote() {
        return connectionNote;
    }

    public void setConnectionNote(String connectionNote) {
        this.connectionNote = connectionNote;
    }
}
