package com.cmc.plant_care_backend.repository;

import com.cmc.plant_care_backend.model.UserPlant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserPlantRepository extends JpaRepository<UserPlant, UUID> {

    List<UserPlant> findByOwnerId(UUID ownerId);

    List<UserPlant> findByGardenId(UUID gardenId);

    Optional<UserPlant> findByIdAndOwnerId(UUID id, UUID ownerId);

    boolean existsBySpeciesId(UUID speciesId);
}
