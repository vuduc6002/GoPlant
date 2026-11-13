package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.common.exception.ForbiddenException;
import com.cmc.plant_care_backend.common.exception.MediaAttachedException;
import com.cmc.plant_care_backend.common.exception.ResourceNotFoundException;
import com.cmc.plant_care_backend.common.media.ProcessedImage;
import com.cmc.plant_care_backend.model.Media;
import com.cmc.plant_care_backend.model.User;
import com.cmc.plant_care_backend.model.enums.MediaStatus;
import com.cmc.plant_care_backend.repository.MediaRepository;
import com.cmc.plant_care_backend.repository.UserRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Component
public class MediaTransactionCoordinator {

    public record DeleteDecision(boolean alreadyDeleted, String bucket, String objectKey) {
        public static DeleteDecision ofAlreadyDeleted() {
            return new DeleteDecision(true, null, null);
        }

        public static DeleteDecision ofProceed(String bucket, String objectKey) {
            return new DeleteDecision(false, bucket, objectKey);
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
        Media media = mediaRepository.findById(mediaId)
            .orElseThrow(() -> new ResourceNotFoundException("Tệp tin đa phương tiện", mediaId));
        media.setStatus(MediaStatus.READY);
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
        mediaRepository.saveAndFlush(media);
        return DeleteDecision.ofProceed(media.getBucket(), media.getObjectKey());
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void completeDelete(UUID mediaId) {
        mediaRepository.findById(mediaId).ifPresent(media -> {
            media.setStatus(MediaStatus.DELETED);
            mediaRepository.saveAndFlush(media);
        });
    }
}
