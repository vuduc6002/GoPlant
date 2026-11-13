package com.cmc.plant_care_backend.repository;

import com.cmc.plant_care_backend.model.Media;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface MediaRepository extends JpaRepository<Media, UUID> {

    Optional<Media> findByIdAndOwnerId(UUID id, UUID ownerId);

    Optional<Media> findByBucketAndObjectKey(String bucket, String objectKey);

    List<Media> findByOwnerIdOrderByCreatedAtDesc(UUID ownerId);
}
