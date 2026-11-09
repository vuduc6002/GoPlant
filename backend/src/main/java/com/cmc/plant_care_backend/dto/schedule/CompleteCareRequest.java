package com.cmc.plant_care_backend.dto.schedule;

import java.time.OffsetDateTime;
import java.util.List;

public class CompleteCareRequest {

    private String note;
    private List<String> imageUrls;
    private OffsetDateTime performedAt;

    public CompleteCareRequest() {}

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public List<String> getImageUrls() {
        return imageUrls;
    }

    public void setImageUrls(List<String> imageUrls) {
        this.imageUrls = imageUrls;
    }

    public OffsetDateTime getPerformedAt() {
        return performedAt;
    }

    public void setPerformedAt(OffsetDateTime performedAt) {
        this.performedAt = performedAt;
    }
}
