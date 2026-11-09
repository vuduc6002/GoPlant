package com.cmc.plant_care_backend.repository;

import com.cmc.plant_care_backend.model.CareSchedule;
import com.cmc.plant_care_backend.model.enums.ScheduleStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface CareScheduleRepository extends JpaRepository<CareSchedule, UUID> {

    List<CareSchedule> findByUserPlantId(UUID userPlantId);

    List<CareSchedule> findByOwnerId(UUID ownerId);

    Optional<CareSchedule> findByIdAndOwnerId(UUID id, UUID ownerId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM CareSchedule s WHERE s.id = :id")
    Optional<CareSchedule> findByIdWithPessimisticLock(@Param("id") UUID id);

    Page<CareSchedule> findByUserPlantIdAndOwnerId(UUID userPlantId, UUID ownerId, Pageable pageable);

    Page<CareSchedule> findByUserPlantIdAndStatusAndOwnerId(UUID userPlantId, ScheduleStatus status, UUID ownerId, Pageable pageable);

    List<CareSchedule> findByOwnerIdAndStatusAndNextScheduledAtLessThanEqualOrderByNextScheduledAtAsc(
        UUID ownerId,
        ScheduleStatus status,
        OffsetDateTime dateTime
    );
}
