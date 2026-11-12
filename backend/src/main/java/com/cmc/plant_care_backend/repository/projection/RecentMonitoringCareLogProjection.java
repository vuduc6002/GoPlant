package com.cmc.plant_care_backend.repository.projection;

import com.cmc.plant_care_backend.model.enums.CareLogStatus;

import java.time.OffsetDateTime;
import java.util.UUID;

public record RecentMonitoringCareLogProjection(
    UUID id,
    UUID scheduleId,
    String taskType,
    CareLogStatus status,
    String note,
    OffsetDateTime performedAt
) {
}
