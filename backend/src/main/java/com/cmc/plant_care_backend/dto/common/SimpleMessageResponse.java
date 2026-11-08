package com.cmc.plant_care_backend.dto.common;

public class SimpleMessageResponse {

    private String message;

    public SimpleMessageResponse() {}

    public SimpleMessageResponse(String message) {
        this.message = message;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}
