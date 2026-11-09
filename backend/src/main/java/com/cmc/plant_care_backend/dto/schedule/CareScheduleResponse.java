package com.cmc.plant_care_backend.dto.schedule;

import com.cmc.plant_care_backend.model.enums.Frequency;
import com.cmc.plant_care_backend.model.enums.ScheduleStatus;
import com.cmc.plant_care_backend.model.enums.TaskType;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

public class CareScheduleResponse {

    private UUID id;
    private UUID userPlantId;
    private String plantName;
    private TaskType taskType;
    private String taskLabel;
    private Frequency frequency;
    private Integer intervalDays;
    private String reminderTime;
    private LocalDate startDate;
    private LocalDate endDate;
    private OffsetDateTime nextScheduledAt;
    private boolean isOverdue;
    private ScheduleStatus status;

    public CareScheduleResponse() {}

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getUserPlantId() {
        return userPlantId;
    }

    public void setUserPlantId(UUID userPlantId) {
        this.userPlantId = userPlantId;
    }

    public String getPlantName() {
        return plantName;
    }

    public void setPlantName(String plantName) {
        this.plantName = plantName;
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

    public Frequency getFrequency() {
        return frequency;
    }

    public void setFrequency(Frequency frequency) {
        this.frequency = frequency;
    }

    public Integer getIntervalDays() {
        return intervalDays;
    }

    public void setIntervalDays(Integer intervalDays) {
        this.intervalDays = intervalDays;
    }

    public String getReminderTime() {
        return reminderTime;
    }

    public void setReminderTime(String reminderTime) {
        this.reminderTime = reminderTime;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public void setStartDate(LocalDate startDate) {
        this.startDate = startDate;
    }

    public LocalDate getEndDate() {
        return endDate;
    }

    public void setEndDate(LocalDate endDate) {
        this.endDate = endDate;
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
