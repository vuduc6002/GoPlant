package com.cmc.plant_care_backend.dto.schedule;

import com.cmc.plant_care_backend.model.enums.Frequency;
import com.cmc.plant_care_backend.model.enums.ScheduleStatus;
import com.cmc.plant_care_backend.model.enums.TaskType;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public class UpdateScheduleRequest {

    private TaskType taskType;
    private boolean taskTypePresent = false;

    @Size(max = 200, message = "taskLabel không được vượt quá 200 ký tự")
    private String taskLabel;
    private boolean taskLabelPresent = false;

    private Frequency frequency;
    private boolean frequencyPresent = false;

    private Integer intervalDays;
    private boolean intervalDaysPresent = false;

    private String reminderTime;
    private boolean reminderTimePresent = false;

    private LocalDate startDate;
    private boolean startDatePresent = false;

    private LocalDate endDate;
    private boolean endDatePresent = false;

    private ScheduleStatus status;
    private boolean statusPresent = false;

    public UpdateScheduleRequest() {}

    public TaskType getTaskType() {
        return taskType;
    }

    public void setTaskType(TaskType taskType) {
        this.taskType = taskType;
        this.taskTypePresent = true;
    }

    public boolean isTaskTypePresent() {
        return taskTypePresent;
    }

    public String getTaskLabel() {
        return taskLabel;
    }

    public void setTaskLabel(String taskLabel) {
        this.taskLabel = taskLabel;
        this.taskLabelPresent = true;
    }

    public boolean isTaskLabelPresent() {
        return taskLabelPresent;
    }

    public Frequency getFrequency() {
        return frequency;
    }

    public void setFrequency(Frequency frequency) {
        this.frequency = frequency;
        this.frequencyPresent = true;
    }

    public boolean isFrequencyPresent() {
        return frequencyPresent;
    }

    public Integer getIntervalDays() {
        return intervalDays;
    }

    public void setIntervalDays(Integer intervalDays) {
        this.intervalDays = intervalDays;
        this.intervalDaysPresent = true;
    }

    public boolean isIntervalDaysPresent() {
        return intervalDaysPresent;
    }

    public String getReminderTime() {
        return reminderTime;
    }

    public void setReminderTime(String reminderTime) {
        this.reminderTime = reminderTime;
        this.reminderTimePresent = true;
    }

    public boolean isReminderTimePresent() {
        return reminderTimePresent;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public void setStartDate(LocalDate startDate) {
        this.startDate = startDate;
        this.startDatePresent = true;
    }

    public boolean isStartDatePresent() {
        return startDatePresent;
    }

    public LocalDate getEndDate() {
        return endDate;
    }

    public void setEndDate(LocalDate endDate) {
        this.endDate = endDate;
        this.endDatePresent = true;
    }

    public boolean isEndDatePresent() {
        return endDatePresent;
    }

    public ScheduleStatus getStatus() {
        return status;
    }

    public void setStatus(ScheduleStatus status) {
        this.status = status;
        this.statusPresent = true;
    }

    public boolean isStatusPresent() {
        return statusPresent;
    }
}
