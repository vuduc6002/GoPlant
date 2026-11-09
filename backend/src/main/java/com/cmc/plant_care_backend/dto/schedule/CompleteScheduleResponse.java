package com.cmc.plant_care_backend.dto.schedule;

import java.time.OffsetDateTime;
import java.util.UUID;

public class CompleteScheduleResponse {

    private UUID careLogId;
    private String scheduleStatus;
    private OffsetDateTime nextScheduledAt;

    public CompleteScheduleResponse() {}

    public CompleteScheduleResponse(UUID careLogId, String scheduleStatus, OffsetDateTime nextScheduledAt) {
        this.careLogId = careLogId;
        this.scheduleStatus = scheduleStatus;
        this.nextScheduledAt = nextScheduledAt;
    }

    public UUID getCareLogId() {
        return careLogId;
    }

    public void setCareLogId(UUID careLogId) {
        this.careLogId = careLogId;
    }

    public String getScheduleStatus() {
        return scheduleStatus;
    }

    public void setScheduleStatus(String scheduleStatus) {
        this.scheduleStatus = scheduleStatus;
    }

    public OffsetDateTime getNextScheduledAt() {
        return nextScheduledAt;
    }

    public void setNextScheduledAt(OffsetDateTime nextScheduledAt) {
        this.nextScheduledAt = nextScheduledAt;
    }
}
