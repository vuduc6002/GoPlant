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

    Page<PlantSpecies> findByIsActiveTrue(Pageable pageable);

    Page<PlantSpecies> findByIsActiveTrueAndCategory(String category, Pageable pageable);

    @Query("SELECT s FROM PlantSpecies s WHERE s.isActive = true " +
           "AND (LOWER(s.commonName) LIKE LOWER(CONCAT('%', :keyword, '%')) " +
           "OR LOWER(s.scientificName) LIKE LOWER(CONCAT('%', :keyword, '%')))")
    Page<PlantSpecies> searchActiveByKeyword(@Param("keyword") String keyword, Pageable pageable);

    @Query("SELECT s FROM PlantSpecies s WHERE s.isActive = true " +
           "AND s.category = :category " +
           "AND (LOWER(s.commonName) LIKE LOWER(CONCAT('%', :keyword, '%')) " +
           "OR LOWER(s.scientificName) LIKE LOWER(CONCAT('%', :keyword, '%')))")
    Page<PlantSpecies> searchActiveByKeywordAndCategory(
        @Param("keyword") String keyword,
        @Param("category") String category,
        Pageable pageable
    );

    @Query("SELECT s FROM PlantSpecies s " +
           "WHERE LOWER(s.commonName) LIKE LOWER(CONCAT('%', :keyword, '%')) " +
           "OR LOWER(s.scientificName) LIKE LOWER(CONCAT('%', :keyword, '%'))")
    Page<PlantSpecies> searchAllByKeyword(@Param("keyword") String keyword, Pageable pageable);

    default Page<PlantSpecies> searchActiveSpecies(String keyword, String category, Pageable pageable) {
        String cleanKeyword = (keyword != null && !keyword.trim().isEmpty()) ? keyword.trim() : null;
        String cleanCategory = (category != null && !category.trim().isEmpty()) ? category.trim() : null;
        if (cleanKeyword != null && cleanCategory != null) {
            return searchActiveByKeywordAndCategory(cleanKeyword, cleanCategory, pageable);
        } else if (cleanKeyword != null) {
            return searchActiveByKeyword(cleanKeyword, pageable);
        } else if (cleanCategory != null) {
            return findByIsActiveTrueAndCategory(cleanCategory, pageable);
        } else {
            return findByIsActiveTrue(pageable);
        }
    }

    default Page<PlantSpecies> searchAllSpecies(String keyword, Pageable pageable) {
        String cleanKeyword = (keyword != null && !keyword.trim().isEmpty()) ? keyword.trim() : null;
        if (cleanKeyword != null) {
            return searchAllByKeyword(cleanKeyword, pageable);
        } else {
            return findAll(pageable);
        }
    }

    @Query("SELECT CASE WHEN COUNT(up) > 0 THEN true ELSE false END FROM UserPlant up WHERE up.species.id = :speciesId")
    boolean isSpeciesInUse(@Param("speciesId") UUID speciesId);

    boolean existsByScientificName(String scientificName);

    boolean existsByScientificNameAndIdNot(String scientificName, UUID id);
}
