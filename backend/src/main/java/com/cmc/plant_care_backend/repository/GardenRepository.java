package com.cmc.plant_care_backend.repository;

import com.cmc.plant_care_backend.model.Garden;
import com.cmc.plant_care_backend.model.enums.HealthStatus;
import com.cmc.plant_care_backend.repository.projection.GardenMonitoringProjection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface GardenRepository extends JpaRepository<Garden, UUID> {

    List<Garden> findByOwnerId(UUID ownerId);

    Optional<Garden> findByIdAndOwnerId(UUID id, UUID ownerId);

    boolean existsByOwnerIdAndName(UUID ownerId, String name);

    boolean existsByOwnerIdAndNameAndIdNot(UUID ownerId, String name, UUID id);

    @Query("SELECT COUNT(up) FROM UserPlant up WHERE up.garden.id = :gardenId")
    long countPlantsByGardenId(@Param("gardenId") UUID gardenId);

    @Query("""
        SELECT new com.cmc.plant_care_backend.repository.projection.GardenMonitoringProjection(
            g.id,
            g.name,
            COUNT(p.id),
            COALESCE(SUM(CASE WHEN p.healthStatus IN :attentionStatuses THEN 1L ELSE 0L END), 0L)
        )
        FROM Garden g
        LEFT JOIN g.plants p
        WHERE g.owner.id = :ownerId
        GROUP BY g.id, g.name, g.createdAt
        ORDER BY g.createdAt ASC, g.id ASC
        """)
    List<GardenMonitoringProjection> findMonitoringGardenSummariesByOwnerId(
        @Param("ownerId") UUID ownerId,
        @Param("attentionStatuses") Collection<HealthStatus> attentionStatuses
    );
}
