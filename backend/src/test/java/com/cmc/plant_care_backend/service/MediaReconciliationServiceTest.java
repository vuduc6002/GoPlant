package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.model.Media;
import com.cmc.plant_care_backend.model.enums.MediaStatus;
import com.cmc.plant_care_backend.repository.MediaRepository;
import com.cmc.plant_care_backend.service.storage.SupabaseStorageGateway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MediaReconciliationServiceTest {

    @Mock
    private MediaRepository mediaRepository;

    @Mock
    private MediaTransactionCoordinator coordinator;

    @Mock
    private SupabaseStorageGateway storageGateway;

    private MediaReconciliationService reconciliationService;

    @BeforeEach
    void setUp() {
        reconciliationService = new MediaReconciliationService(
            mediaRepository,
            coordinator,
            storageGateway
        );
    }

    @Test
    @DisplayName("reconcileStuckMedia successfully cleans up storage and marks DELETED for stuck PENDING and DELETING media")
    void reconcileStuckMedia_Success() {
        UUID pendingId = UUID.randomUUID();
        UUID deletingId = UUID.randomUUID();

        Media pendingMedia = new Media();
        pendingMedia.setId(pendingId);
        pendingMedia.setStatus(MediaStatus.PENDING);
        pendingMedia.setBucket("goplant-private-media");
        pendingMedia.setObjectKey("users/pending.jpg");

        Media deletingMedia = new Media();
        deletingMedia.setId(deletingId);
        deletingMedia.setStatus(MediaStatus.DELETING);
        deletingMedia.setBucket("goplant-private-media");
        deletingMedia.setObjectKey("users/deleting.jpg");

        when(mediaRepository.findStuckMediaForReconciliation(any(OffsetDateTime.class)))
            .thenReturn(List.of(pendingMedia, deletingMedia));

        when(coordinator.beginReconciliation(pendingId))
            .thenReturn(new MediaTransactionCoordinator.ReconciliationCandidate(pendingId, "goplant-private-media", "users/pending.jpg", MediaStatus.PENDING));
        when(coordinator.beginReconciliation(deletingId))
            .thenReturn(new MediaTransactionCoordinator.ReconciliationCandidate(deletingId, "goplant-private-media", "users/deleting.jpg", MediaStatus.DELETING));

        int reconciled = reconciliationService.reconcileStuckMedia(Duration.ofMinutes(5));

        assertEquals(2, reconciled);
        verify(storageGateway).delete("goplant-private-media", "users/pending.jpg");
        verify(storageGateway).delete("goplant-private-media", "users/deleting.jpg");
        verify(coordinator).completeReconciliation(pendingId);
        verify(coordinator).completeReconciliation(deletingId);
    }

    @Test
    @DisplayName("reconcileStuckMedia ignores media when beginReconciliation returns null (READY, ATTACHED or DELETED)")
    void reconcileStuckMedia_IgnoresProtectedOrResolvedMedia() {
        UUID attachedId = UUID.randomUUID();
        Media attachedSummary = new Media();
        attachedSummary.setId(attachedId);

        when(mediaRepository.findStuckMediaForReconciliation(any(OffsetDateTime.class)))
            .thenReturn(List.of(attachedSummary));

        // Coordinator rejects because candidate transitioned to ATTACHED or READY
        when(coordinator.beginReconciliation(attachedId)).thenReturn(null);

        int reconciled = reconciliationService.reconcileStuckMedia(Duration.ofMinutes(5));

        assertEquals(0, reconciled);
        verify(storageGateway, never()).delete(any(), any());
        verify(coordinator, never()).completeReconciliation(any());
    }

    @Test
    @DisplayName("reconcileStuckMedia skips completion if storage delete fails, allowing retry on next run")
    void reconcileStuckMedia_StorageDeleteFails_SkipsCompletionForRetry() {
        UUID mediaId = UUID.randomUUID();
        Media summary = new Media();
        summary.setId(mediaId);

        when(mediaRepository.findStuckMediaForReconciliation(any(OffsetDateTime.class)))
            .thenReturn(List.of(summary));

        when(coordinator.beginReconciliation(mediaId))
            .thenReturn(new MediaTransactionCoordinator.ReconciliationCandidate(mediaId, "goplant-private-media", "users/file.jpg", MediaStatus.PENDING));

        doThrow(new RuntimeException("Supabase Storage gateway timeout"))
            .when(storageGateway).delete("goplant-private-media", "users/file.jpg");

        int reconciled = reconciliationService.reconcileStuckMedia(Duration.ofMinutes(5));

        assertEquals(0, reconciled);
        verify(storageGateway).delete("goplant-private-media", "users/file.jpg");
        // Must NOT mark complete so it remains eligible for next retry run
        verify(coordinator, never()).completeReconciliation(any());
    }

    @Test
    @DisplayName("reconcileStuckMedia returns 0 when no stuck media found")
    void reconcileStuckMedia_EmptyList() {
        when(mediaRepository.findStuckMediaForReconciliation(any(OffsetDateTime.class)))
            .thenReturn(Collections.emptyList());

        int reconciled = reconciliationService.reconcileStuckMedia(Duration.ofMinutes(5));

        assertEquals(0, reconciled);
        verifyNoInteractions(coordinator);
        verifyNoInteractions(storageGateway);
    }
}
