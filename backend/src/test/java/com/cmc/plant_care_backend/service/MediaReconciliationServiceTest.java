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
import org.springframework.data.domain.Pageable;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
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
            storageGateway,
            50,
            300,
            60,
            5,
            30
        );
        lenient().when(storageGateway.sanitizeLogMessage(anyString())).thenAnswer(inv -> inv.getArgument(0));
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

        when(mediaRepository.findStuckMediaForReconciliation(any(OffsetDateTime.class), any(OffsetDateTime.class), any(Pageable.class)))
            .thenReturn(List.of(pendingMedia, deletingMedia));

        when(coordinator.beginReconciliation(eq(pendingId), anyString(), any(Duration.class)))
            .thenReturn(new MediaTransactionCoordinator.ReconciliationCandidate(pendingId, "goplant-private-media", "users/pending.jpg", MediaStatus.PENDING, "token1"));
        when(coordinator.beginReconciliation(eq(deletingId), anyString(), any(Duration.class)))
            .thenReturn(new MediaTransactionCoordinator.ReconciliationCandidate(deletingId, "goplant-private-media", "users/deleting.jpg", MediaStatus.DELETING, "token2"));

        int reconciled = reconciliationService.reconcileStuckMedia(Duration.ofMinutes(5));

        assertEquals(2, reconciled);
        verify(storageGateway).delete("goplant-private-media", "users/pending.jpg");
        verify(storageGateway).delete("goplant-private-media", "users/deleting.jpg");
        verify(coordinator).completeReconciliationSuccess(eq(pendingId), anyString());
        verify(coordinator).completeReconciliationSuccess(eq(deletingId), anyString());
    }

    @Test
    @DisplayName("reconcileStuckMedia ignores media when beginReconciliation returns null (READY, ATTACHED or DELETED)")
    void reconcileStuckMedia_IgnoresProtectedOrResolvedMedia() {
        UUID attachedId = UUID.randomUUID();
        Media attachedSummary = new Media();
        attachedSummary.setId(attachedId);

        when(mediaRepository.findStuckMediaForReconciliation(any(OffsetDateTime.class), any(OffsetDateTime.class), any(Pageable.class)))
            .thenReturn(List.of(attachedSummary));

        // Coordinator rejects because candidate transitioned to ATTACHED or READY
        when(coordinator.beginReconciliation(eq(attachedId), anyString(), any(Duration.class))).thenReturn(null);

        int reconciled = reconciliationService.reconcileStuckMedia(Duration.ofMinutes(5));

        assertEquals(0, reconciled);
        verify(storageGateway, never()).delete(any(), any());
        verify(coordinator, never()).completeReconciliationSuccess(any(), any());
    }

    @Test
    @DisplayName("reconcileStuckMedia records failure and retry backoff if storage delete fails")
    void reconcileStuckMedia_StorageDeleteFails_SkipsCompletionForRetry() {
        UUID mediaId = UUID.randomUUID();
        Media summary = new Media();
        summary.setId(mediaId);

        when(mediaRepository.findStuckMediaForReconciliation(any(OffsetDateTime.class), any(OffsetDateTime.class), any(Pageable.class)))
            .thenReturn(List.of(summary));

        when(coordinator.beginReconciliation(eq(mediaId), anyString(), any(Duration.class)))
            .thenReturn(new MediaTransactionCoordinator.ReconciliationCandidate(mediaId, "goplant-private-media", "users/file.jpg", MediaStatus.PENDING, "token1"));

        doThrow(new RuntimeException("Supabase Storage gateway timeout"))
            .when(storageGateway).delete("goplant-private-media", "users/file.jpg");

        int reconciled = reconciliationService.reconcileStuckMedia(Duration.ofMinutes(5));

        assertEquals(0, reconciled);
        verify(storageGateway).delete("goplant-private-media", "users/file.jpg");
        verify(coordinator).recordReconciliationFailure(eq(mediaId), anyString(), anyString(), eq(5), any(Duration.class));
        verify(coordinator, never()).completeReconciliationSuccess(any(), any());
    }

    @Test
    @DisplayName("reconcileStuckMedia returns 0 when no stuck media found")
    void reconcileStuckMedia_EmptyList() {
        when(mediaRepository.findStuckMediaForReconciliation(any(OffsetDateTime.class), any(OffsetDateTime.class), any(Pageable.class)))
            .thenReturn(Collections.emptyList());

        int reconciled = reconciliationService.reconcileStuckMedia(Duration.ofMinutes(5));

        assertEquals(0, reconciled);
        verifyNoInteractions(coordinator);
        verifyNoInteractions(storageGateway);
    }
}
