package com.cmc.plant_care_backend.dto.monitoring;

public class SchedulesSummaryDto {

    private int activeCount;
    private int dueTodayCount;
    private int overdueCount;

    public SchedulesSummaryDto() {}

    public SchedulesSummaryDto(int activeCount, int dueTodayCount, int overdueCount) {
        this.activeCount = activeCount;
        this.dueTodayCount = dueTodayCount;
        this.overdueCount = overdueCount;
    }

    public int getActiveCount() {
        return activeCount;
    }

    public void setActiveCount(int activeCount) {
        this.activeCount = activeCount;
    }

    public int getDueTodayCount() {
        return dueTodayCount;
    }

    public void setDueTodayCount(int dueTodayCount) {
        this.dueTodayCount = dueTodayCount;
    }

    public int getOverdueCount() {
        return overdueCount;
    }

    public void setOverdueCount(int overdueCount) {
        this.overdueCount = overdueCount;
    }
}
