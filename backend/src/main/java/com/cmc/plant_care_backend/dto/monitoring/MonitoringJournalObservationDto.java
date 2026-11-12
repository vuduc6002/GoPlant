package com.cmc.plant_care_backend.dto.monitoring;

import com.cmc.plant_care_backend.model.enums.EntryType;
import com.cmc.plant_care_backend.model.enums.JournalHealthStatus;

import java.time.OffsetDateTime;
import java.util.UUID;

public class MonitoringJournalObservationDto {

    private UUID journalId;
    private OffsetDateTime recordedAt;
    private EntryType entryType;
    private JournalHealthStatus healthStatus;
    private String notePreview;

    public MonitoringJournalObservationDto() {}

    public MonitoringJournalObservationDto(
        UUID journalId,
        OffsetDateTime recordedAt,
        EntryType entryType,
        JournalHealthStatus healthStatus,
        String notePreview
    ) {
        this.journalId = journalId;
        this.recordedAt = recordedAt;
        this.entryType = entryType;
        this.healthStatus = healthStatus;
        this.notePreview = notePreview;
    }

    public UUID getJournalId() {
        return journalId;
    }

    public void setJournalId(UUID journalId) {
        this.journalId = journalId;
    }

    public OffsetDateTime getRecordedAt() {
        return recordedAt;
    }

    public void setRecordedAt(OffsetDateTime recordedAt) {
        this.recordedAt = recordedAt;
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

    public String getNotePreview() {
        return notePreview;
    }

    public void setNotePreview(String notePreview) {
        this.notePreview = notePreview;
    }
}
