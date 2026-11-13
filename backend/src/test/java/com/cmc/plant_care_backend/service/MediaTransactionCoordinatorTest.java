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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MediaTransactionCoordinatorTest {

    @Mock
    private MediaRepository mediaRepository;

    @Mock
    private UserRepository userRepository;

    private MediaTransactionCoordinator coordinator;

    private UUID userId;
    private UUID otherUserId;
    private UUID mediaId;
    private User user;

    @BeforeEach
    void setUp() {
        coordinator = new MediaTransactionCoordinator(mediaRepository, userRepository);

        userId = UUID.randomUUID();
        otherUserId = UUID.randomUUID();
        mediaId = UUID.randomUUID();

        user = new User();
        user.setId(userId);
        user.setEmail("test@goplant.vn");
    }

    @Test
    @DisplayName("createPendingMedia saves and flushes new media with PENDING status")
    void createPendingMedia_Success() {
        ProcessedImage processed = new ProcessedImage(new byte[] { 1, 2 }, "image/jpeg", 50, 50, 2, "hash");

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(mediaRepository.saveAndFlush(any(Media.class))).thenAnswer(i -> {
            Media m = i.getArgument(0);
            m.setId(mediaId);
            return m;
        });

        Media result = coordinator.createPendingMedia(userId, "bucket", "objKey.jpg", processed);

        assertNotNull(result);
        assertEquals(mediaId, result.getId());
        assertEquals(MediaStatus.PENDING, result.getStatus());
        assertEquals(user, result.getOwner());
        verify(mediaRepository).saveAndFlush(any(Media.class));
    }

    @Test
    @DisplayName("markReady updates media status to READY and flushes")
    void markReady_Success() {
        Media media = new Media();
        media.setId(mediaId);
        media.setStatus(MediaStatus.PENDING);

        when(mediaRepository.findByIdForUpdate(mediaId)).thenReturn(Optional.of(media));
        when(mediaRepository.saveAndFlush(any(Media.class))).thenAnswer(i -> i.getArgument(0));

        Media result = coordinator.markReady(mediaId);

        assertEquals(MediaStatus.READY, result.getStatus());
        verify(mediaRepository).saveAndFlush(media);
    }

    @Test
    @DisplayName("deletePendingMedia deletes only if status is PENDING")
    void deletePendingMedia_OnlyDeletesIfPending() {
        Media mediaPending = new Media();
        mediaPending.setId(mediaId);
        mediaPending.setStatus(MediaStatus.PENDING);

        when(mediaRepository.findById(mediaId)).thenReturn(Optional.of(mediaPending));

        coordinator.deletePendingMedia(mediaId);

        verify(mediaRepository).delete(mediaPending);
        verify(mediaRepository).flush();
    }

    @Test
    @DisplayName("deletePendingMedia does not delete if status is READY")
    void deletePendingMedia_IgnoresIfReady() {
        Media mediaReady = new Media();
        mediaReady.setId(mediaId);
        mediaReady.setStatus(MediaStatus.READY);

        when(mediaRepository.findById(mediaId)).thenReturn(Optional.of(mediaReady));

        coordinator.deletePendingMedia(mediaId);

        verify(mediaRepository, never()).delete(any());
    }

    @Test
    @DisplayName("beginDelete locks record, checks ownership and ATTACHED status, and commits DELETING")
    void beginDelete_Success() {
        Media media = new Media();
        media.setId(mediaId);
        media.setOwner(user);
        media.setBucket("bucket");
        media.setObjectKey("key.jpg");
        media.setStatus(MediaStatus.READY);

        when(mediaRepository.findByIdForUpdate(mediaId)).thenReturn(Optional.of(media));
        when(mediaRepository.saveAndFlush(any(Media.class))).thenAnswer(i -> i.getArgument(0));

        MediaTransactionCoordinator.DeleteDecision decision = coordinator.beginDelete(mediaId, userId);

        assertFalse(decision.alreadyDeleted());
        assertEquals("bucket", decision.bucket());
        assertEquals("key.jpg", decision.objectKey());
        assertEquals(MediaStatus.DELETING, media.getStatus());
        verify(mediaRepository).saveAndFlush(media);
    }

    @Test
    @DisplayName("beginDelete returns ofAlreadyDeleted when status is DELETED")
    void beginDelete_AlreadyDeleted() {
        Media media = new Media();
        media.setId(mediaId);
        media.setOwner(user);
        media.setStatus(MediaStatus.DELETED);

        when(mediaRepository.findByIdForUpdate(mediaId)).thenReturn(Optional.of(media));

        MediaTransactionCoordinator.DeleteDecision decision = coordinator.beginDelete(mediaId, userId);

        assertTrue(decision.alreadyDeleted());
        verify(mediaRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("beginDelete throws ForbiddenException when accessed by non-owner")
    void beginDelete_NonOwner_ThrowsForbidden() {
        Media media = new Media();
        media.setId(mediaId);
        media.setOwner(user);

        when(mediaRepository.findByIdForUpdate(mediaId)).thenReturn(Optional.of(media));

        assertThrows(ForbiddenException.class, () -> coordinator.beginDelete(mediaId, otherUserId));
    }

    @Test
    @DisplayName("beginDelete throws MediaAttachedException (409) when media is ATTACHED")
    void beginDelete_Attached_ThrowsConflict() {
        Media media = new Media();
        media.setId(mediaId);
        media.setOwner(user);
        media.setStatus(MediaStatus.ATTACHED);

        when(mediaRepository.findByIdForUpdate(mediaId)).thenReturn(Optional.of(media));

        assertThrows(MediaAttachedException.class, () -> coordinator.beginDelete(mediaId, userId));
    }

    @Test
    @DisplayName("completeDelete marks media as DELETED and flushes")
    void completeDelete_Success() {
        Media media = new Media();
        media.setId(mediaId);
        media.setStatus(MediaStatus.DELETING);

        when(mediaRepository.findById(mediaId)).thenReturn(Optional.of(media));
        when(mediaRepository.saveAndFlush(any(Media.class))).thenAnswer(i -> i.getArgument(0));

        coordinator.completeDelete(mediaId);

        assertEquals(MediaStatus.DELETED, media.getStatus());
        verify(mediaRepository).saveAndFlush(media);
    }

    @Test
    @DisplayName("getReadSnapshot returns snapshot for owner when READY or ATTACHED")
    void getReadSnapshot_Success() {
        Media media = new Media();
        media.setId(mediaId);
        media.setOwner(user);
        media.setBucket("goplant-private-media");
        media.setObjectKey("users/test.jpg");
        media.setStatus(MediaStatus.READY);

        when(mediaRepository.findById(mediaId)).thenReturn(Optional.of(media));

        MediaTransactionCoordinator.MediaReadSnapshot snapshot = coordinator.getReadSnapshot(mediaId, userId);

        assertNotNull(snapshot);
        assertEquals(mediaId, snapshot.mediaId());
        assertEquals("goplant-private-media", snapshot.bucket());
        assertEquals("users/test.jpg", snapshot.objectKey());
    }

    @Test
    @DisplayName("beginReconciliation returns candidate for PENDING and DELETING media")
    void beginReconciliation_PendingAndDeleting() {
        Media pending = new Media();
        pending.setId(mediaId);
        pending.setBucket("bucket");
        pending.setObjectKey("pending.jpg");
        pending.setStatus(MediaStatus.PENDING);

        when(mediaRepository.findByIdForUpdate(mediaId)).thenReturn(Optional.of(pending));
        when(mediaRepository.saveAndFlush(any(Media.class))).thenAnswer(i -> i.getArgument(0));

        MediaTransactionCoordinator.ReconciliationCandidate candidate = coordinator.beginReconciliation(mediaId);
        assertNotNull(candidate);
        assertEquals(mediaId, candidate.mediaId());
        assertEquals(MediaStatus.RECONCILING, candidate.status());
    }

    @Test
    @DisplayName("beginReconciliation returns null for ATTACHED or READY media to prevent false deletions")
    void beginReconciliation_ProtectedMedia_ReturnsNull() {
        Media ready = new Media();
        ready.setId(mediaId);
        ready.setStatus(MediaStatus.READY);

        when(mediaRepository.findByIdForUpdate(mediaId)).thenReturn(Optional.of(ready));

        assertNull(coordinator.beginReconciliation(mediaId));

        Media attached = new Media();
        attached.setId(mediaId);
        attached.setStatus(MediaStatus.ATTACHED);

        when(mediaRepository.findByIdForUpdate(mediaId)).thenReturn(Optional.of(attached));

        assertNull(coordinator.beginReconciliation(mediaId));
    }

    @Test
    @DisplayName("completeReconciliation transitions stuck media to DELETED")
    void completeReconciliation_Success() {
        Media pending = new Media();
        pending.setId(mediaId);
        pending.setStatus(MediaStatus.PENDING);

        when(mediaRepository.findByIdForUpdate(mediaId)).thenReturn(Optional.of(pending));
        when(mediaRepository.saveAndFlush(any(Media.class))).thenAnswer(i -> i.getArgument(0));

        coordinator.completeReconciliation(mediaId);

        assertEquals(MediaStatus.DELETED, pending.getStatus());
        verify(mediaRepository).saveAndFlush(pending);
    }
}
