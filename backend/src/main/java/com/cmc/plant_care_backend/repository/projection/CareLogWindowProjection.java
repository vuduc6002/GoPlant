package com.cmc.plant_care_backend.repository.projection;

public record CareLogWindowProjection(
    Long unlinkedCompletedLogs,
    Long unlinkedSkippedLogs,
    Long linkedScheduledCompletedLogs,
    Long linkedScheduledSkippedLogs
) {
}
