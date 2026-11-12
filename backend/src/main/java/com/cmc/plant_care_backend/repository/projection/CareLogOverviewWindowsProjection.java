package com.cmc.plant_care_backend.repository.projection;

public record CareLogOverviewWindowsProjection(
    Long unlinkedCompletedLogs7d,
    Long unlinkedSkippedLogs7d,
    Long linkedScheduledCompletedLogs7d,
    Long linkedScheduledSkippedLogs7d,
    Long unlinkedCompletedLogs30d,
    Long unlinkedSkippedLogs30d,
    Long linkedScheduledCompletedLogs30d,
    Long linkedScheduledSkippedLogs30d
) {
}
