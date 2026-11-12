package com.cmc.plant_care_backend.repository;

import com.cmc.plant_care_backend.model.CareLog;
import com.cmc.plant_care_backend.repository.projection.CareLogOverviewWindowsProjection;
import com.cmc.plant_care_backend.repository.projection.CareLogWindowProjection;
import com.cmc.plant_care_backend.repository.projection.RecentMonitoringCareLogProjection;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface CareLogRepository extends JpaRepository<CareLog, UUID> {

    List<CareLog> findByUserPlantId(UUID userPlantId);

    List<CareLog> findByPerformedById(UUID performedById);

    Optional<CareLog> findByIdAndPerformedById(UUID id, UUID performedById);

    Page<CareLog> findByUserPlantIdAndPerformedById(UUID userPlantId, UUID performedById, Pageable pageable);

    @Modifying
    @Query("UPDATE CareLog c SET c.schedule = NULL WHERE c.schedule.id = :scheduleId")
    void detachSchedule(@Param("scheduleId") UUID scheduleId);

    @Query("""
        SELECT new com.cmc.plant_care_backend.repository.projection.CareLogOverviewWindowsProjection(
            COALESCE(SUM(CASE WHEN c.performedAt >= :window7dStart AND c.schedule IS NULL AND c.status = com.cmc.plant_care_backend.model.enums.CareLogStatus.COMPLETED THEN 1L ELSE 0L END), 0L),
            COALESCE(SUM(CASE WHEN c.performedAt >= :window7dStart AND c.schedule IS NULL AND c.status = com.cmc.plant_care_backend.model.enums.CareLogStatus.SKIPPED THEN 1L ELSE 0L END), 0L),
            COALESCE(SUM(CASE WHEN c.performedAt >= :window7dStart AND c.schedule IS NOT NULL AND c.status = com.cmc.plant_care_backend.model.enums.CareLogStatus.COMPLETED THEN 1L ELSE 0L END), 0L),
            COALESCE(SUM(CASE WHEN c.performedAt >= :window7dStart AND c.schedule IS NOT NULL AND c.status = com.cmc.plant_care_backend.model.enums.CareLogStatus.SKIPPED THEN 1L ELSE 0L END), 0L),
            COALESCE(SUM(CASE WHEN c.schedule IS NULL AND c.status = com.cmc.plant_care_backend.model.enums.CareLogStatus.COMPLETED THEN 1L ELSE 0L END), 0L),
            COALESCE(SUM(CASE WHEN c.schedule IS NULL AND c.status = com.cmc.plant_care_backend.model.enums.CareLogStatus.SKIPPED THEN 1L ELSE 0L END), 0L),
            COALESCE(SUM(CASE WHEN c.schedule IS NOT NULL AND c.status = com.cmc.plant_care_backend.model.enums.CareLogStatus.COMPLETED THEN 1L ELSE 0L END), 0L),
            COALESCE(SUM(CASE WHEN c.schedule IS NOT NULL AND c.status = com.cmc.plant_care_backend.model.enums.CareLogStatus.SKIPPED THEN 1L ELSE 0L END), 0L)
        )
        FROM CareLog c
        WHERE c.performedBy.id = :ownerId
          AND c.performedAt >= :window30dStart
          AND c.performedAt <= :now
        """)
    CareLogOverviewWindowsProjection summarizeOverviewWindowsByOwnerId(
        @Param("ownerId") UUID ownerId,
        @Param("window7dStart") OffsetDateTime window7dStart,
        @Param("window30dStart") OffsetDateTime window30dStart,
        @Param("now") OffsetDateTime now
    );

    @Query("""
        SELECT new com.cmc.plant_care_backend.repository.projection.CareLogWindowProjection(
            COALESCE(SUM(CASE WHEN c.schedule IS NULL AND c.status = com.cmc.plant_care_backend.model.enums.CareLogStatus.COMPLETED THEN 1L ELSE 0L END), 0L),
            COALESCE(SUM(CASE WHEN c.schedule IS NULL AND c.status = com.cmc.plant_care_backend.model.enums.CareLogStatus.SKIPPED THEN 1L ELSE 0L END), 0L),
            COALESCE(SUM(CASE WHEN c.schedule IS NOT NULL AND c.status = com.cmc.plant_care_backend.model.enums.CareLogStatus.COMPLETED THEN 1L ELSE 0L END), 0L),
            COALESCE(SUM(CASE WHEN c.schedule IS NOT NULL AND c.status = com.cmc.plant_care_backend.model.enums.CareLogStatus.SKIPPED THEN 1L ELSE 0L END), 0L)
        )
        FROM CareLog c
        WHERE c.userPlant.id = :plantId
          AND c.performedBy.id = :ownerId
          AND c.performedAt >= :window30dStart
          AND c.performedAt <= :now
        """)
    CareLogWindowProjection summarizePlantWindowByPlantIdAndOwnerId(
        @Param("plantId") UUID plantId,
        @Param("ownerId") UUID ownerId,
        @Param("window30dStart") OffsetDateTime window30dStart,
        @Param("now") OffsetDateTime now
    );

    @Query("""
        SELECT new com.cmc.plant_care_backend.repository.projection.RecentMonitoringCareLogProjection(
            c.id,
            s.id,
            c.taskType,
            c.status,
            c.note,
            c.performedAt
        )
        FROM CareLog c
        LEFT JOIN c.schedule s
        WHERE c.userPlant.id = :plantId
          AND c.performedBy.id = :ownerId
        ORDER BY c.performedAt DESC, c.id DESC
        """)
    List<RecentMonitoringCareLogProjection> findRecentMonitoringLogsByPlantIdAndOwnerId(
        @Param("plantId") UUID plantId,
        @Param("ownerId") UUID ownerId,
        Pageable pageable
    );
}
