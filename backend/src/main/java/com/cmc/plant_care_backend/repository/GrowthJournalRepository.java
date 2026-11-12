package com.cmc.plant_care_backend.repository;

import com.cmc.plant_care_backend.model.GrowthJournal;
import com.cmc.plant_care_backend.repository.projection.RecentMonitoringJournalProjection;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface GrowthJournalRepository extends JpaRepository<GrowthJournal, UUID> {

    List<GrowthJournal> findByUserPlantId(UUID userPlantId);

    List<GrowthJournal> findByAuthorId(UUID authorId);

    Optional<GrowthJournal> findByIdAndAuthorId(UUID id, UUID authorId);

    Page<GrowthJournal> findByUserPlantIdAndAuthorId(UUID userPlantId, UUID authorId, Pageable pageable);

    @Query("""
        SELECT new com.cmc.plant_care_backend.repository.projection.RecentMonitoringJournalProjection(
            j.id,
            j.entryType,
            j.healthStatus,
            j.note,
            j.recordedAt
        )
        FROM GrowthJournal j
        WHERE j.userPlant.id = :plantId
          AND j.author.id = :ownerId
        ORDER BY j.recordedAt DESC, j.id DESC
        """)
    List<RecentMonitoringJournalProjection> findRecentMonitoringJournalsByPlantIdAndOwnerId(
        @Param("plantId") UUID plantId,
        @Param("ownerId") UUID ownerId,
        Pageable pageable
    );
}
