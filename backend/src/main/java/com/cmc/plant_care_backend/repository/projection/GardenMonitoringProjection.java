package com.cmc.plant_care_backend.repository.projection;

import java.util.UUID;

public record GardenMonitoringProjection(
    UUID gardenId,
    String name,
    Long plantCount,
    Long attentionCount
) {
}
