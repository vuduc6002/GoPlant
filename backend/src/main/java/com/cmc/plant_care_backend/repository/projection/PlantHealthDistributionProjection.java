package com.cmc.plant_care_backend.repository.projection;

public record PlantHealthDistributionProjection(
    Long totalCount,
    Long healthyCount,
    Long needsAttentionCount,
    Long criticalCount,
    Long unknownCount
) {
}
