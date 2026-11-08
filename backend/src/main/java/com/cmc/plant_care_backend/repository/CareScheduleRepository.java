package com.cmc.plant_care_backend.repository;

import com.cmc.plant_care_backend.model.CareSchedule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface CareScheduleRepository extends JpaRepository<CareSchedule, UUID> {

    List<CareSchedule> findByUserPlantId(UUID userPlantId);

    List<CareSchedule> findByOwnerId(UUID ownerId);

    Optional<CareSchedule> findByIdAndOwnerId(UUID id, UUID ownerId);
}
