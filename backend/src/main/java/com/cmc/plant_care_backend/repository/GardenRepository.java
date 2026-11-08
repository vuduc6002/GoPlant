package com.cmc.plant_care_backend.repository;

import com.cmc.plant_care_backend.model.Garden;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

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
}
