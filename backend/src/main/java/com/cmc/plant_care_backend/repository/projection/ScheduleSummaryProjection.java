package com.cmc.plant_care_backend.repository.projection;

public record ScheduleSummaryProjection(
    Long activeCount,
    Long dueTodayCount,
    Long overdueCount
) {
}
