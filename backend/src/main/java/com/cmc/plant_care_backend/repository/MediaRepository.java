package com.cmc.plant_care_backend.repository;

import com.cmc.plant_care_backend.model.Media;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
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

    @Query("""
        SELECT m FROM Media m
        WHERE (
            (m.status = com.cmc.plant_care_backend.model.enums.MediaStatus.PENDING AND m.createdAt <= :cutoff)
            OR (m.status = com.cmc.plant_care_backend.model.enums.MediaStatus.RECONCILING AND (m.leaseExpiresAt IS NULL OR m.leaseExpiresAt <= :now))
            OR (m.status = com.cmc.plant_care_backend.model.enums.MediaStatus.DELETING AND ((m.leaseExpiresAt IS NULL AND m.updatedAt <= :cutoff) OR (m.leaseExpiresAt IS NOT NULL AND m.leaseExpiresAt <= :now)))
        )
        AND (m.nextRetryAt IS NULL OR m.nextRetryAt <= :now)
        ORDER BY m.createdAt ASC
    """)
    List<Media> findStuckMediaForReconciliation(
        @Param("cutoff") OffsetDateTime cutoff,
        @Param("now") OffsetDateTime now,
        Pageable pageable
    );

    default List<Media> findStuckMediaForReconciliation(OffsetDateTime cutoff) {
        return findStuckMediaForReconciliation(cutoff, OffsetDateTime.now(ZoneOffset.UTC), Pageable.unpaged());
    }
}
