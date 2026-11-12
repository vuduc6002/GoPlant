package com.cmc.plant_care_backend.dto.monitoring;

import com.cmc.plant_care_backend.model.enums.EntryType;
import com.cmc.plant_care_backend.model.enums.JournalHealthStatus;

import java.time.OffsetDateTime;
import java.util.UUID;

public class MonitoringActivityItemDto {

    private UUID id;
    private MonitoringActivitySourceType sourceType;
    private String title;
    private String taskType;
    private String status;
    private EntryType entryType;
    private JournalHealthStatus healthStatus;
    private String notePreview;
    private OffsetDateTime occurredAt;

    public MonitoringActivityItemDto() {}

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public MonitoringActivitySourceType getSourceType() {
        return sourceType;
    }

    public void setSourceType(MonitoringActivitySourceType sourceType) {
        this.sourceType = sourceType;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getTaskType() {
        return taskType;
    }

    public void setTaskType(String taskType) {
        this.taskType = taskType;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
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

    public OffsetDateTime getOccurredAt() {
        return occurredAt;
    }

    public void setOccurredAt(OffsetDateTime occurredAt) {
        this.occurredAt = occurredAt;
    }
}
