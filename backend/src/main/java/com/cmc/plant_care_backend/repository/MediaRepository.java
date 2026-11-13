package com.cmc.plant_care_backend.repository;

import com.cmc.plant_care_backend.model.Media;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface MediaRepository extends JpaRepository<Media, UUID> {

    Optional<Media> findByIdAndOwnerId(UUID id, UUID ownerId);

    Optional<Media> findByBucketAndObjectKey(String bucket, String objectKey);

    List<Media> findByOwnerIdOrderByCreatedAtDesc(UUID ownerId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT m FROM Media m WHERE m.id = :id")
    Optional<Media> findByIdForUpdate(@Param("id") UUID id);
}
