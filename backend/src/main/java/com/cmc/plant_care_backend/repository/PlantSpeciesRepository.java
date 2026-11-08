package com.cmc.plant_care_backend.repository;

import com.cmc.plant_care_backend.model.PlantSpecies;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface PlantSpeciesRepository extends JpaRepository<PlantSpecies, UUID> {

    @Query("SELECT s FROM PlantSpecies s WHERE s.isActive = true " +
           "AND (:keyword IS NULL OR LOWER(s.commonName) LIKE LOWER(CONCAT('%', :keyword, '%')) " +
           "OR LOWER(s.scientificName) LIKE LOWER(CONCAT('%', :keyword, '%'))) " +
           "AND (:category IS NULL OR s.category = :category)")
    Page<PlantSpecies> searchActiveSpecies(
        @Param("keyword") String keyword,
        @Param("category") String category,
        Pageable pageable
    );

    @Query("SELECT s FROM PlantSpecies s " +
           "WHERE (:keyword IS NULL OR LOWER(s.commonName) LIKE LOWER(CONCAT('%', :keyword, '%')) " +
           "OR LOWER(s.scientificName) LIKE LOWER(CONCAT('%', :keyword, '%')))")
    Page<PlantSpecies> searchAllSpecies(
        @Param("keyword") String keyword,
        Pageable pageable
    );

    @Query("SELECT CASE WHEN COUNT(up) > 0 THEN true ELSE false END FROM UserPlant up WHERE up.species.id = :speciesId")
    boolean isSpeciesInUse(@Param("speciesId") UUID speciesId);

    boolean existsByScientificName(String scientificName);

    boolean existsByScientificNameAndIdNot(String scientificName, UUID id);
}
