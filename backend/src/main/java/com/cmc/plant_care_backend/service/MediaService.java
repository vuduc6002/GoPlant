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
import com.cmc.plant_care_backend.model.User;
import com.cmc.plant_care_backend.model.enums.MediaStatus;
import com.cmc.plant_care_backend.repository.MediaRepository;
import com.cmc.plant_care_backend.repository.UserRepository;
import com.cmc.plant_care_backend.service.storage.SupabaseStorageGateway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Service
@Transactional
public class MediaService {

    private static final Logger log = LoggerFactory.getLogger(MediaService.class);

    private final MediaRepository mediaRepository;
    private final UserRepository userRepository;
    private final SupabaseStorageGateway storageGateway;
    private final ImageMetadataProcessor imageProcessor;
    private final SupabaseStorageProperties storageProperties;

    public MediaService(
        MediaRepository mediaRepository,
        UserRepository userRepository,
        SupabaseStorageGateway storageGateway,
        ImageMetadataProcessor imageProcessor,
        SupabaseStorageProperties storageProperties
    ) {
        this.mediaRepository = mediaRepository;
        this.userRepository = userRepository;
        this.storageGateway = storageGateway;
        this.imageProcessor = imageProcessor;
        this.storageProperties = storageProperties;
    }

    public MediaResponse uploadMedia(UUID userId, MultipartFile file) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Người dùng", userId));

        ProcessedImage processed = imageProcessor.process(file);

        UUID objectKeyUuid = UUID.randomUUID();
        String extension = resolveExtension(processed.getMimeType());
        String objectKey = userId + "/" + objectKeyUuid + "." + extension;
        String bucket = storageProperties.getBucket();

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

        media = mediaRepository.save(media);
        UUID mediaId = media.getId();

        try {
            storageGateway.upload(bucket, objectKey, processed.getBytes(), processed.getMimeType());
        } catch (Exception ex) {
            log.error("Storage upload failed for media [{}], rolling back pending record", mediaId, ex);
            mediaRepository.delete(media);
            throw new StorageUnavailableException("Không thể lưu trữ tệp tin vào kho lưu trữ: " + ex.getMessage());
        }

        try {
            media.setStatus(MediaStatus.READY);
            media = mediaRepository.save(media);
        } catch (Exception ex) {
            log.error("Failed to update media status to READY for [{}], attempting compensation delete", mediaId, ex);
            try {
                storageGateway.delete(bucket, objectKey);
            } catch (Exception deleteEx) {
                log.warn("Compensation delete failed for object [{}]: {}", objectKey, deleteEx.getMessage());
            }
            throw new StorageUnavailableException("Lỗi cập nhật trạng thái tệp tin sau khi lưu trữ.");
        }

        return MediaResponse.fromEntity(media);
    }

    @Transactional(readOnly = true)
    public MediaReadUrlResponse getReadUrl(UUID mediaId, UUID userId) {
        Media media = mediaRepository.findById(mediaId)
            .orElseThrow(() -> new ResourceNotFoundException("Tệp tin đa phương tiện", mediaId));

        if (!media.getOwner().getId().equals(userId)) {
            throw new ForbiddenException("Bạn không có quyền truy cập tệp tin này.");
        }

        if (media.getStatus() != MediaStatus.READY && media.getStatus() != MediaStatus.ATTACHED) {
            throw new ValidationException("Tệp tin chưa sẵn sàng hoặc đã bị xóa.", "mediaId");
        }

        int ttl = storageProperties.getSignedUrlTtlSeconds();
        String signedUrl = storageGateway.createSignedUrl(media.getBucket(), media.getObjectKey(), ttl);
        OffsetDateTime expiresAt = OffsetDateTime.now(ZoneOffset.UTC).plusSeconds(ttl);

        return new MediaReadUrlResponse(media.getId(), signedUrl, expiresAt);
    }

    public void deleteMedia(UUID mediaId, UUID userId) {
        Media media = mediaRepository.findById(mediaId)
            .orElseThrow(() -> new ResourceNotFoundException("Tệp tin đa phương tiện", mediaId));

        if (!media.getOwner().getId().equals(userId)) {
            throw new ForbiddenException("Bạn không có quyền thao tác trên tệp tin này.");
        }

        if (media.getStatus() == MediaStatus.ATTACHED) {
            throw new MediaAttachedException("Không thể xóa tệp phương tiện đang được liên kết sử dụng.", mediaId);
        }

        if (media.getStatus() == MediaStatus.DELETED) {
            return; // Idempotent
        }

        media.setStatus(MediaStatus.DELETING);
        media = mediaRepository.save(media);

        try {
            storageGateway.delete(media.getBucket(), media.getObjectKey());
        } catch (Exception ex) {
            log.error("Failed to delete object [{}] from storage: {}", media.getObjectKey(), ex.getMessage());
            throw new StorageUnavailableException("Không thể xóa tệp tin khỏi dịch vụ lưu trữ: " + ex.getMessage());
        }

        media.setStatus(MediaStatus.DELETED);
        mediaRepository.save(media);
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
}
