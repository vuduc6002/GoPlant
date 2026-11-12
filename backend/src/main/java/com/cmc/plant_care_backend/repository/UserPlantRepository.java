package com.cmc.plant_care_backend.repository;

import com.cmc.plant_care_backend.dto.monitoring.AttentionPlantDto;
import com.cmc.plant_care_backend.model.UserPlant;
import com.cmc.plant_care_backend.model.enums.HealthStatus;
import com.cmc.plant_care_backend.repository.projection.PlantHealthDistributionProjection;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserPlantRepository extends JpaRepository<UserPlant, UUID>, JpaSpecificationExecutor<UserPlant> {

    List<UserPlant> findByOwnerId(UUID ownerId);

    List<UserPlant> findByGardenId(UUID gardenId);

    Optional<UserPlant> findByIdAndOwnerId(UUID id, UUID ownerId);

    boolean existsBySpeciesId(UUID speciesId);

    long countByGardenId(UUID gardenId);

    @Query("""
        SELECT new com.cmc.plant_care_backend.repository.projection.PlantHealthDistributionProjection(
            COUNT(p.id),
            COALESCE(SUM(CASE WHEN p.healthStatus = com.cmc.plant_care_backend.model.enums.HealthStatus.HEALTHY THEN 1L ELSE 0L END), 0L),
            COALESCE(SUM(CASE WHEN p.healthStatus = com.cmc.plant_care_backend.model.enums.HealthStatus.NEEDS_ATTENTION THEN 1L ELSE 0L END), 0L),
            COALESCE(SUM(CASE WHEN p.healthStatus = com.cmc.plant_care_backend.model.enums.HealthStatus.CRITICAL THEN 1L ELSE 0L END), 0L),
            COALESCE(SUM(CASE WHEN p.healthStatus = com.cmc.plant_care_backend.model.enums.HealthStatus.UNKNOWN THEN 1L ELSE 0L END), 0L)
        )
        FROM UserPlant p
        WHERE p.owner.id = :ownerId
        """)
    PlantHealthDistributionProjection summarizeHealthDistributionByOwnerId(@Param("ownerId") UUID ownerId);

    @Query("""
        SELECT new com.cmc.plant_care_backend.dto.monitoring.AttentionPlantDto(
            p.id,
            p.displayName,
            g.id,
            g.name,
            sp.commonName,
            p.healthStatus
        )
        FROM UserPlant p
        JOIN p.garden g
        JOIN p.species sp
        WHERE p.owner.id = :ownerId
          AND p.healthStatus IN :attentionStatuses
        ORDER BY
            CASE WHEN p.healthStatus = com.cmc.plant_care_backend.model.enums.HealthStatus.CRITICAL THEN 0 ELSE 1 END ASC,
            p.updatedAt DESC,
            p.id ASC
        """)
    List<AttentionPlantDto> findAttentionPlantsByOwnerId(
        @Param("ownerId") UUID ownerId,
        @Param("attentionStatuses") Collection<HealthStatus> attentionStatuses,
        Pageable pageable
    );

    @Query("""
        SELECT p
        FROM UserPlant p
        JOIN FETCH p.owner
        JOIN FETCH p.garden
        JOIN FETCH p.species
        WHERE p.id = :plantId
        """)
    Optional<UserPlant> findByIdWithDetailsForMonitoring(@Param("plantId") UUID plantId);
}
