package com.cmc.plant_care_backend.dto.schedule;

import com.cmc.plant_care_backend.model.enums.ScheduleStatus;
import com.cmc.plant_care_backend.model.enums.TaskType;

import java.time.OffsetDateTime;
import java.util.UUID;

public class TodayScheduleItemResponse {

    private UUID scheduleId;
    private UUID plantId;
    private String plantName;
    private String gardenName;
    private TaskType taskType;
    private String taskLabel;
    private OffsetDateTime nextScheduledAt;
    private boolean isOverdue;
    private ScheduleStatus status;

    public TodayScheduleItemResponse() {}

    public UUID getScheduleId() {
        return scheduleId;
    }

    public void setScheduleId(UUID scheduleId) {
        this.scheduleId = scheduleId;
    }

    public UUID getPlantId() {
        return plantId;
    }

    public void setPlantId(UUID plantId) {
        this.plantId = plantId;
    }

    public String getPlantName() {
        return plantName;
    }

    public void setPlantName(String plantName) {
        this.plantName = plantName;
    }

    public String getGardenName() {
        return gardenName;
    }

    public void setGardenName(String gardenName) {
        this.gardenName = gardenName;
    }

    public TaskType getTaskType() {
        return taskType;
    }

    public void setTaskType(TaskType taskType) {
        this.taskType = taskType;
    }

    public String getTaskLabel() {
        return taskLabel;
    }

    public void setTaskLabel(String taskLabel) {
        this.taskLabel = taskLabel;
    }

    public OffsetDateTime getNextScheduledAt() {
        return nextScheduledAt;
    }

    public void setNextScheduledAt(OffsetDateTime nextScheduledAt) {
        this.nextScheduledAt = nextScheduledAt;
    }

    public boolean isOverdue() {
        return isOverdue;
    }

    public void setOverdue(boolean overdue) {
        isOverdue = overdue;
    }

    public ScheduleStatus getStatus() {
        return status;
    }

    public void setStatus(ScheduleStatus status) {
        this.status = status;
    }
}
