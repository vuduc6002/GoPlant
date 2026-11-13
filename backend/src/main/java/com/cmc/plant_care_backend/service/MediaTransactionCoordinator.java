package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.common.exception.ForbiddenException;
import com.cmc.plant_care_backend.common.exception.MediaAttachedException;
import com.cmc.plant_care_backend.common.exception.ResourceNotFoundException;
import com.cmc.plant_care_backend.common.exception.ValidationException;
import com.cmc.plant_care_backend.common.media.ProcessedImage;
import com.cmc.plant_care_backend.model.Media;
import com.cmc.plant_care_backend.model.User;
import com.cmc.plant_care_backend.model.enums.MediaStatus;
import com.cmc.plant_care_backend.repository.MediaRepository;
import com.cmc.plant_care_backend.repository.UserRepository;
import com.cmc.plant_care_backend.service.storage.SupabaseStorageGateway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Component
public class MediaTransactionCoordinator {

    private static final Logger log = LoggerFactory.getLogger(MediaTransactionCoordinator.class);

    public record DeleteDecision(boolean alreadyDeleted, String bucket, String objectKey) {
        public static DeleteDecision ofAlreadyDeleted() {
            return new DeleteDecision(true, null, null);
        }

        public static DeleteDecision ofProceed(String bucket, String objectKey) {
            return new DeleteDecision(false, bucket, objectKey);
        }
    }

    public record MediaReadSnapshot(UUID mediaId, String bucket, String objectKey) {}

    public record ReconciliationCandidate(UUID mediaId, String bucket, String objectKey, MediaStatus status, String leaseToken) {
        public ReconciliationCandidate(UUID mediaId, String bucket, String objectKey, MediaStatus status) {
            this(mediaId, bucket, objectKey, status, null);
        }
    }

    private final MediaRepository mediaRepository;
    private final UserRepository userRepository;

    public MediaTransactionCoordinator(MediaRepository mediaRepository, UserRepository userRepository) {
        this.mediaRepository = mediaRepository;
        this.userRepository = userRepository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Media createPendingMedia(UUID userId, String bucket, String objectKey, ProcessedImage processed) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Người dùng", userId));

        Media media = new Media();
        media.setOwner(user);
        media.setBucket(bucket);
        media.setObjectKey(objectKey);
        media.setMimeType(processed.getMimeType());
        media.setSizeBytes(processed.getSizeBytes());
        media.setSha256(processed.getSha256());
        media.setWidth(processed.getWidth());
        media.setHeight(processed.getHeight());
        media.setStatus(MediaStatus.PENDING);

        return mediaRepository.saveAndFlush(media);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Media markReady(UUID mediaId) {
        Media media = mediaRepository.findByIdForUpdate(mediaId)
            .orElseThrow(() -> new ResourceNotFoundException("Tệp tin đa phương tiện", mediaId));

        if (media.getStatus() == MediaStatus.READY) {
            return media; // Idempotent success
        }

        if (media.getStatus() != MediaStatus.PENDING) {
            throw new IllegalStateException("Không thể chuyển Media sang trạng thái READY từ trạng thái hiện tại: " + media.getStatus());
        }

        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        if (media.getLeaseExpiresAt() != null && media.getLeaseExpiresAt().isAfter(now)) {
            throw new IllegalStateException("Media đang được đối soát bởi worker, không thể chuyển sang READY");
        }

        media.setStatus(MediaStatus.READY);
        media.setLeaseToken(null);
        media.setLeaseExpiresAt(null);
        return mediaRepository.saveAndFlush(media);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void deletePendingMedia(UUID mediaId) {
        mediaRepository.findById(mediaId).ifPresent(media -> {
            if (media.getStatus() == MediaStatus.PENDING) {
                mediaRepository.delete(media);
                mediaRepository.flush();
            }
        });
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public DeleteDecision beginDelete(UUID mediaId, UUID userId) {
        Media media = mediaRepository.findByIdForUpdate(mediaId)
            .orElseThrow(() -> new ResourceNotFoundException("Tệp tin đa phương tiện", mediaId));

        if (!media.getOwner().getId().equals(userId)) {
            throw new ForbiddenException("Bạn không có quyền thao tác trên tệp tin này.");
        }

        if (media.getStatus() == MediaStatus.ATTACHED) {
            throw new MediaAttachedException("Không thể xóa tệp phương tiện đang được liên kết sử dụng.", mediaId);
        }

        if (media.getStatus() == MediaStatus.DELETED) {
            return DeleteDecision.ofAlreadyDeleted();
        }

        media.setStatus(MediaStatus.DELETING);
        media.setLeaseToken(null);
        media.setLeaseExpiresAt(null);
        mediaRepository.saveAndFlush(media);
        return DeleteDecision.ofProceed(media.getBucket(), media.getObjectKey());
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void completeDelete(UUID mediaId) {
        mediaRepository.findById(mediaId).ifPresent(media -> {
            media.setStatus(MediaStatus.DELETED);
            media.setLeaseToken(null);
            media.setLeaseExpiresAt(null);
            mediaRepository.saveAndFlush(media);
        });
    }

    @Transactional(readOnly = true)
    public MediaReadSnapshot getReadSnapshot(UUID mediaId, UUID userId) {
        Media media = mediaRepository.findById(mediaId)
            .orElseThrow(() -> new ResourceNotFoundException("Tệp tin đa phương tiện", mediaId));

        if (!media.getOwner().getId().equals(userId)) {
            throw new ForbiddenException("Bạn không có quyền truy cập tệp tin này.");
        }

        if (media.getStatus() != MediaStatus.READY && media.getStatus() != MediaStatus.ATTACHED) {
            throw new ValidationException("Tệp tin chưa sẵn sàng hoặc đã bị xóa.", "mediaId");
        }

        return new MediaReadSnapshot(media.getId(), media.getBucket(), media.getObjectKey());
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public ReconciliationCandidate beginReconciliation(UUID mediaId, String leaseToken, Duration leaseDuration) {
        Media media = mediaRepository.findByIdForUpdate(mediaId).orElse(null);
        if (media == null) {
            return null;
        }

        // Strictly protect READY and ATTACHED
        if (media.getStatus() == MediaStatus.READY || media.getStatus() == MediaStatus.ATTACHED) {
            return null;
        }

        // Already deleted or marked permanently failed
        if (media.getStatus() == MediaStatus.DELETED || media.getStatus() == MediaStatus.FAILED) {
            return null;
        }

        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);

        // Check active lease held by another worker
        if (media.getLeaseExpiresAt() != null && media.getLeaseExpiresAt().isAfter(now)) {
            if (media.getLeaseToken() != null && !media.getLeaseToken().equals(leaseToken)) {
                return null;
            }
        }

        // Check retry backoff
        if (media.getNextRetryAt() != null && media.getNextRetryAt().isAfter(now)) {
            return null;
        }

        // Atomically claim lease
        media.setLeaseToken(leaseToken);
        media.setLeaseExpiresAt(now.plus(leaseDuration));
        media.setLastAttemptAt(now);
        media.setAttemptCount(media.getAttemptCount() + 1);

        if (media.getStatus() == MediaStatus.PENDING) {
            media.setStatus(MediaStatus.RECONCILING);
        }

        Media saved = mediaRepository.saveAndFlush(media);
        return new ReconciliationCandidate(saved.getId(), saved.getBucket(), saved.getObjectKey(), saved.getStatus(), leaseToken);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public ReconciliationCandidate beginReconciliation(UUID mediaId) {
        return beginReconciliation(mediaId, UUID.randomUUID().toString(), Duration.ofSeconds(60));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void completeReconciliationSuccess(UUID mediaId, String leaseToken) {
        Media media = mediaRepository.findByIdForUpdate(mediaId).orElse(null);
        if (media == null) {
            return;
        }

        // Invariant protection: NEVER overwrite READY or ATTACHED
        if (media.getStatus() == MediaStatus.READY || media.getStatus() == MediaStatus.ATTACHED) {
            log.warn("Reconciliation attempt on protected media [{}], aborting completion", mediaId);
            return;
        }

        if (leaseToken != null && media.getLeaseToken() != null && !leaseToken.equals(media.getLeaseToken())) {
            log.warn("Lease token mismatch on completing reconciliation for media [{}]", mediaId);
            return;
        }

        media.setStatus(MediaStatus.DELETED);
        media.setLeaseToken(null);
        media.setLeaseExpiresAt(null);
        media.setNextRetryAt(null);
        media.setErrorDetail(null);
        mediaRepository.saveAndFlush(media);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void completeReconciliation(UUID mediaId) {
        completeReconciliationSuccess(mediaId, null);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordReconciliationFailure(UUID mediaId, String leaseToken, String errorMessage, int maxAttempts, Duration baseBackoff) {
        Media media = mediaRepository.findByIdForUpdate(mediaId).orElse(null);
        if (media == null) {
            return;
        }

        if (media.getStatus() == MediaStatus.READY || media.getStatus() == MediaStatus.ATTACHED) {
            return;
        }

        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        String sanitized = SupabaseStorageGateway.sanitizeLogMessageStatic(errorMessage);
        if (sanitized != null && sanitized.length() > 950) {
            sanitized = sanitized.substring(0, 950);
        }
        media.setErrorDetail(sanitized);
        media.setLeaseToken(null);
        media.setLeaseExpiresAt(null);

        if (media.getAttemptCount() >= maxAttempts) {
            media.setStatus(MediaStatus.FAILED);
            media.setNextRetryAt(null);
            log.error("Media [{}] exceeded max reconciliation attempts ({}). Marked FAILED for manual intervention.",
                mediaId, media.getAttemptCount());
        } else {
            long multiplier = 1L << Math.min(media.getAttemptCount() - 1, 10);
            Duration backoff = baseBackoff.multipliedBy(multiplier);
            media.setNextRetryAt(now.plus(backoff));
            log.warn("Media [{}] reconciliation attempt {} failed, scheduling retry at {}",
                mediaId, media.getAttemptCount(), media.getNextRetryAt());
        }

        mediaRepository.saveAndFlush(media);
    }
}
