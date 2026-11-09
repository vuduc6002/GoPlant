package com.cmc.plant_care_backend.dto.schedule;

import com.cmc.plant_care_backend.model.enums.Frequency;
import com.cmc.plant_care_backend.model.enums.TaskType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.UUID;

public class CreateScheduleRequest {

    @NotNull(message = "userPlantId là bắt buộc")
    private UUID userPlantId;

    @NotNull(message = "taskType là bắt buộc")
    private TaskType taskType;

    @Size(max = 200, message = "taskLabel không được vượt quá 200 ký tự")
    private String taskLabel;

    @NotNull(message = "frequency là bắt buộc")
    private Frequency frequency;

    private Integer intervalDays;

    private String reminderTime;

    @NotNull(message = "startDate là bắt buộc")
    private LocalDate startDate;

    private LocalDate endDate;

    public CreateScheduleRequest() {}

    public UUID getUserPlantId() {
        return userPlantId;
    }

    public void setUserPlantId(UUID userPlantId) {
        this.userPlantId = userPlantId;
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
}
