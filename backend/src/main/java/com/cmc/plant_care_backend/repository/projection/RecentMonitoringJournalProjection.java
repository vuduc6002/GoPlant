package com.cmc.plant_care_backend.repository.projection;

import com.cmc.plant_care_backend.model.enums.EntryType;
import com.cmc.plant_care_backend.model.enums.JournalHealthStatus;

import java.time.OffsetDateTime;
import java.util.UUID;

public record RecentMonitoringJournalProjection(
    UUID id,
    EntryType entryType,
    JournalHealthStatus healthStatus,
    String note,
    OffsetDateTime recordedAt
) {
}
