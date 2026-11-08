package com.cmc.plant_care_backend.repository;

import com.cmc.plant_care_backend.model.PlantSpecies;
import com.cmc.plant_care_backend.model.UserFavoriteSpecies;
import com.cmc.plant_care_backend.model.UserFavoriteSpeciesId;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Set;
import java.util.UUID;

@Repository
public interface UserFavoriteSpeciesRepository extends JpaRepository<UserFavoriteSpecies, UserFavoriteSpeciesId> {

    boolean existsByUserIdAndSpeciesId(UUID userId, UUID speciesId);

    void deleteByUserIdAndSpeciesId(UUID userId, UUID speciesId);

    @Query("SELECT f.species FROM UserFavoriteSpecies f WHERE f.user.id = :userId AND f.species.isActive = true")
    Page<PlantSpecies> findFavoriteSpeciesByUserId(@Param("userId") UUID userId, Pageable pageable);

    @Query("SELECT f.species.id FROM UserFavoriteSpecies f WHERE f.user.id = :userId")
    Set<UUID> findFavoriteSpeciesIdsByUserId(@Param("userId") UUID userId);
}
