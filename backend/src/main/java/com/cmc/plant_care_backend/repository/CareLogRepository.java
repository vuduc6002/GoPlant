package com.cmc.plant_care_backend.repository;

import com.cmc.plant_care_backend.model.CareLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface CareLogRepository extends JpaRepository<CareLog, UUID> {

    List<CareLog> findByUserPlantId(UUID userPlantId);

    List<CareLog> findByPerformedById(UUID performedById);

    Optional<CareLog> findByIdAndPerformedById(UUID id, UUID performedById);
}
