package com.cmc.plant_care_backend.repository;

import com.cmc.plant_care_backend.model.CareLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

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
}
