package com.cmc.plant_care_backend.repository;

import com.cmc.plant_care_backend.model.GrowthJournal;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
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
}
