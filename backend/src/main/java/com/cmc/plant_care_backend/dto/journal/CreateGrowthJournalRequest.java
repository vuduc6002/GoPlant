package com.cmc.plant_care_backend.dto.journal;

import com.cmc.plant_care_backend.model.enums.EntryType;
import com.cmc.plant_care_backend.model.enums.JournalHealthStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public class CreateGrowthJournalRequest {

    @NotNull(message = "userPlantId là bắt buộc")
    private UUID userPlantId;

    private EntryType entryType = EntryType.GROWTH;

    private JournalHealthStatus healthStatus = JournalHealthStatus.HEALTHY;

    @NotBlank(message = "note không được để trống")
    private String note;

    private List<String> imageUrls;

    private OffsetDateTime recordedAt;

    public CreateGrowthJournalRequest() {}

    public UUID getUserPlantId() {
        return userPlantId;
    }

    public void setUserPlantId(UUID userPlantId) {
        this.userPlantId = userPlantId;
    }

    public EntryType getEntryType() {
        return entryType;
    }

    public void setEntryType(EntryType entryType) {
        this.entryType = entryType;
    }

    public JournalHealthStatus getHealthStatus() {
        return healthStatus;
    }

    public void setHealthStatus(JournalHealthStatus healthStatus) {
        this.healthStatus = healthStatus;
    }

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

    public OffsetDateTime getRecordedAt() {
        return recordedAt;
    }

    public void setRecordedAt(OffsetDateTime recordedAt) {
        this.recordedAt = recordedAt;
    }
}
