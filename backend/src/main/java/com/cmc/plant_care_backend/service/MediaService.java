package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.common.exception.ForbiddenException;
import com.cmc.plant_care_backend.common.exception.MediaAttachedException;
import com.cmc.plant_care_backend.common.exception.ResourceNotFoundException;
import com.cmc.plant_care_backend.common.exception.StorageUnavailableException;
import com.cmc.plant_care_backend.common.exception.ValidationException;
import com.cmc.plant_care_backend.common.media.ImageMetadataProcessor;
import com.cmc.plant_care_backend.common.media.ProcessedImage;
import com.cmc.plant_care_backend.config.SupabaseStorageProperties;
import com.cmc.plant_care_backend.dto.media.MediaReadUrlResponse;
import com.cmc.plant_care_backend.dto.media.MediaResponse;
import com.cmc.plant_care_backend.model.Media;
import com.cmc.plant_care_backend.model.enums.MediaStatus;
import com.cmc.plant_care_backend.repository.MediaRepository;
import com.cmc.plant_care_backend.service.storage.SupabaseStorageGateway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Service
public class MediaService {

    private static final Logger log = LoggerFactory.getLogger(MediaService.class);

    private final MediaRepository mediaRepository;
    private final MediaTransactionCoordinator transactionCoordinator;
    private final SupabaseStorageGateway storageGateway;
    private final ImageMetadataProcessor imageProcessor;
    private final SupabaseStorageProperties storageProperties;

    public MediaService(
        MediaRepository mediaRepository,
        MediaTransactionCoordinator transactionCoordinator,
        SupabaseStorageGateway storageGateway,
        ImageMetadataProcessor imageProcessor,
        SupabaseStorageProperties storageProperties
    ) {
        this.mediaRepository = mediaRepository;
        this.transactionCoordinator = transactionCoordinator;
        this.storageGateway = storageGateway;
        this.imageProcessor = imageProcessor;
        this.storageProperties = storageProperties;
    }

    public MediaResponse uploadMedia(UUID userId, MultipartFile file) {
        // Step 1: Decode and strip image before initiating any DB or storage operations
        ProcessedImage processed = imageProcessor.process(file);

        UUID objectKeyUuid = UUID.randomUUID();
        String extension = resolveExtension(processed.getMimeType());
        String objectKey = userId + "/" + objectKeyUuid + "." + extension;
        String bucket = storageProperties.getBucket();

        // Step 2: Create and commit PENDING checkpoint in dedicated transaction
        Media pendingMedia = transactionCoordinator.createPendingMedia(userId, bucket, objectKey, processed);
        UUID mediaId = pendingMedia.getId();

        // Step 3: Outbound HTTP upload to Supabase Storage outside database transaction
        try {
            storageGateway.upload(bucket, objectKey, processed.getBytes(), processed.getMimeType());
        } catch (Exception uploadEx) {
            log.error("Storage upload failed for media [{}]", mediaId, uploadEx);
            boolean indefinite = isIndefiniteUploadFailure(uploadEx);

            boolean compensationSucceeded = false;
            try {
                storageGateway.delete(bucket, objectKey);
                compensationSucceeded = true;
            } catch (Exception compEx) {
                log.warn("Storage compensation delete failed for object [{}]: {}", objectKey, compEx.getMessage());
            }

            // Only immediately delete PENDING record if upload was definitely rejected and compensation succeeded.
            // On indefinite failures (timeout/connection reset), retain PENDING record for background reconciliation.
            if (!indefinite && compensationSucceeded) {
                try {
                    transactionCoordinator.deletePendingMedia(mediaId);
                } catch (Exception dbCleanupEx) {
                    log.warn("Failed to cleanup pending media record [{}] after definite rejection: {}", mediaId, dbCleanupEx.getMessage());
                }
            } else {
                log.warn("Retaining PENDING media record [{}] for storage reconciliation (indefinite={}, compDeleted={})",
                    mediaId, indefinite, compensationSucceeded);
            }
            throw new StorageUnavailableException("Không thể lưu trữ tệp tin vào kho lưu trữ.");
        }

        // Step 4: Commit READY status in dedicated transaction
        Media readyMedia;
        try {
            readyMedia = transactionCoordinator.markReady(mediaId);
        } catch (Exception commitEx) {
            log.error("Failed to commit READY status for media [{}] after storage upload, triggering compensation", mediaId, commitEx);
            try {
                storageGateway.delete(bucket, objectKey);
            } catch (Exception compEx) {
                log.warn("Compensation delete failed for object [{}] after DB commit failure: {}", objectKey, compEx.getMessage());
            }
            // Retain PENDING record for background reconciliation
            log.warn("Retaining PENDING media record [{}] for storage reconciliation after DB commit failure", mediaId);
            throw new StorageUnavailableException("Lỗi cập nhật trạng thái tệp tin sau khi lưu trữ.");
        }

        return MediaResponse.fromEntity(readyMedia);
    }

    public MediaReadUrlResponse getReadUrl(UUID mediaId, UUID userId) {
        MediaTransactionCoordinator.MediaReadSnapshot snapshot = transactionCoordinator.getReadSnapshot(mediaId, userId);

        int ttl = storageProperties.getSignedUrlTtlSeconds();
        String signedUrl = storageGateway.createSignedUrl(snapshot.bucket(), snapshot.objectKey(), ttl);
        OffsetDateTime expiresAt = OffsetDateTime.now(ZoneOffset.UTC).plusSeconds(ttl);

        return new MediaReadUrlResponse(snapshot.mediaId(), signedUrl, expiresAt);
    }

    public void deleteMedia(UUID mediaId, UUID userId) {
        // Step 1: Pessimistic write lock and commit DELETING state in dedicated transaction
        MediaTransactionCoordinator.DeleteDecision decision = transactionCoordinator.beginDelete(mediaId, userId);
        if (decision.alreadyDeleted()) {
            return; // Idempotent success
        }

        // Step 2: Storage delete outside database transaction
        try {
            storageGateway.delete(decision.bucket(), decision.objectKey());
        } catch (Exception ex) {
            log.error("Failed to delete object [{}] from storage: {}", decision.objectKey(), ex.getMessage());
            // Record failure details and clear lease so background reconciliation can pick it up
            transactionCoordinator.recordDeleteFailure(mediaId, decision.deleteToken(), ex.getMessage());
            throw new StorageUnavailableException("Không thể xóa tệp tin khỏi dịch vụ lưu trữ.");
        }

        // Step 3: Commit DELETED status in dedicated transaction
        transactionCoordinator.completeDelete(mediaId, decision.deleteToken());
    }

    private String resolveExtension(String mimeType) {
        if ("image/png".equalsIgnoreCase(mimeType)) {
            return "png";
        }
        if ("image/webp".equalsIgnoreCase(mimeType)) {
            return "webp";
        }
        return "jpg";
    }

    private boolean isIndefiniteUploadFailure(Throwable ex) {
        if (ex instanceof StorageUnavailableException sue && sue.isIndefinite()) {
            return true;
        }
        if (ex instanceof org.springframework.web.client.ResourceAccessException) {
            return true;
        }
        if (ex instanceof java.io.IOException) {
            return true;
        }
        if (ex instanceof java.util.concurrent.TimeoutException) {
            return true;
        }
        String msg = ex.getMessage() != null ? ex.getMessage().toLowerCase() : "";
        return msg.contains("timeout") || msg.contains("timed out") || msg.contains("connection reset") || msg.contains("broken pipe");
    }
}
