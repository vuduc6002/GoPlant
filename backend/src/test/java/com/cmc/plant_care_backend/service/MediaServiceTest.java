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
import com.cmc.plant_care_backend.service.storage.SupabaseStorageGateway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MediaServiceTest {

    @Mock
    private MediaRepository mediaRepository;

    @Mock
    private MediaTransactionCoordinator transactionCoordinator;

    @Mock
    private SupabaseStorageGateway storageGateway;

    @Mock
    private ImageMetadataProcessor imageProcessor;

    private SupabaseStorageProperties properties;
    private MediaService mediaService;

    private UUID ownerId;
    private UUID otherUserId;
    private UUID mediaId;
    private User owner;

    @BeforeEach
    void setUp() {
        properties = new SupabaseStorageProperties(
            "https://test.supabase.co",
            "sb_secret_mock_test_key_12345678",
            "goplant-private-media",
            5242880L,
            300
        );
        mediaService = new MediaService(
            mediaRepository,
            transactionCoordinator,
            storageGateway,
            imageProcessor,
            properties
        );

        ownerId = UUID.randomUUID();
        otherUserId = UUID.randomUUID();
        mediaId = UUID.randomUUID();

        owner = new User();
        owner.setId(ownerId);
        owner.setEmail("owner@goplant.vn");
    }

    @Test
    @DisplayName("uploadMedia successfully creates PENDING checkpoint, uploads to storage, and commits READY")
    void uploadMedia_Success() throws Exception {
        byte[] imageBytes = new byte[] { 1, 2, 3 };
        MockMultipartFile file = new MockMultipartFile("file", "test.jpg", "image/jpeg", imageBytes);
        ProcessedImage processed = new ProcessedImage(imageBytes, "image/jpeg", 100, 100, 3, "sha256hex");

        when(imageProcessor.process(any(MultipartFile.class))).thenReturn(processed);

        Media pendingMedia = new Media();
        pendingMedia.setId(mediaId);
        pendingMedia.setOwner(owner);
        pendingMedia.setStatus(MediaStatus.PENDING);
        pendingMedia.setBucket("goplant-private-media");
        pendingMedia.setObjectKey("users/" + ownerId + "/" + mediaId + ".jpg");

        Media readyMedia = new Media();
        readyMedia.setId(mediaId);
        readyMedia.setOwner(owner);
        readyMedia.setStatus(MediaStatus.READY);
        readyMedia.setMimeType("image/jpeg");
        readyMedia.setSizeBytes(3L);
        readyMedia.setBucket("goplant-private-media");
        readyMedia.setObjectKey("users/" + ownerId + "/" + mediaId + ".jpg");

        when(transactionCoordinator.createPendingMedia(eq(ownerId), eq("goplant-private-media"), anyString(), eq(processed)))
            .thenReturn(pendingMedia);
        when(transactionCoordinator.markReady(mediaId)).thenReturn(readyMedia);

        MediaResponse response = mediaService.uploadMedia(ownerId, file);

        assertNotNull(response);
        assertEquals(mediaId, response.getId());
        assertEquals("image/jpeg", response.getMimeType());
        assertEquals(MediaStatus.READY.name(), response.getStatus());

        verify(transactionCoordinator).createPendingMedia(eq(ownerId), eq("goplant-private-media"), anyString(), eq(processed));
        verify(storageGateway).upload(eq("goplant-private-media"), anyString(), eq(imageBytes), eq("image/jpeg"));
        verify(transactionCoordinator).markReady(mediaId);
    }

    @Test
    @DisplayName("uploadMedia triggers compensation delete and cleans up PENDING record if Supabase storage upload definitely rejects")
    void uploadMedia_StorageFailure_DefiniteRejection_TriggersCompensationAndDeletesPendingRecord() throws Exception {
        byte[] imageBytes = new byte[] { 1, 2, 3 };
        MockMultipartFile file = new MockMultipartFile("file", "test.jpg", "image/jpeg", imageBytes);
        ProcessedImage processed = new ProcessedImage(imageBytes, "image/jpeg", 100, 100, 3, "sha256hex");

        when(imageProcessor.process(any(MultipartFile.class))).thenReturn(processed);

        Media pendingMedia = new Media();
        pendingMedia.setId(mediaId);
        pendingMedia.setOwner(owner);
        pendingMedia.setStatus(MediaStatus.PENDING);
        pendingMedia.setBucket("goplant-private-media");
        pendingMedia.setObjectKey("users/" + ownerId + "/" + mediaId + ".jpg");

        when(transactionCoordinator.createPendingMedia(eq(ownerId), eq("goplant-private-media"), anyString(), eq(processed)))
            .thenReturn(pendingMedia);

        // Definite failure (e.g. 4xx client rejection)
        doThrow(new StorageUnavailableException("Storage client rejection (400)", false))
            .when(storageGateway).upload(anyString(), anyString(), any(), anyString());

        assertThrows(StorageUnavailableException.class, () -> mediaService.uploadMedia(ownerId, file));

        verify(storageGateway).delete(eq("goplant-private-media"), anyString());
        verify(transactionCoordinator).deletePendingMedia(mediaId);
        verify(transactionCoordinator, never()).markReady(any());
    }

    @Test
    @DisplayName("uploadMedia retains PENDING record for reconciliation when upload fails due to indefinite timeout")
    void uploadMedia_StorageFailure_IndefiniteTimeout_RetainsPendingRecord() throws Exception {
        byte[] imageBytes = new byte[] { 1, 2, 3 };
        MockMultipartFile file = new MockMultipartFile("file", "test.jpg", "image/jpeg", imageBytes);
        ProcessedImage processed = new ProcessedImage(imageBytes, "image/jpeg", 100, 100, 3, "sha256hex");

        when(imageProcessor.process(any(MultipartFile.class))).thenReturn(processed);

        Media pendingMedia = new Media();
        pendingMedia.setId(mediaId);
        pendingMedia.setOwner(owner);
        pendingMedia.setStatus(MediaStatus.PENDING);
        pendingMedia.setBucket("goplant-private-media");
        pendingMedia.setObjectKey("users/" + ownerId + "/" + mediaId + ".jpg");

        when(transactionCoordinator.createPendingMedia(eq(ownerId), eq("goplant-private-media"), anyString(), eq(processed)))
            .thenReturn(pendingMedia);

        // Indefinite failure (timeout/network drop)
        doThrow(new StorageUnavailableException("Storage connection timeout", true))
            .when(storageGateway).upload(anyString(), anyString(), any(), anyString());

        assertThrows(StorageUnavailableException.class, () -> mediaService.uploadMedia(ownerId, file));

        // Compensation delete attempted, but PENDING record is RETAINED for reconciliation
        verify(storageGateway).delete(eq("goplant-private-media"), anyString());
        verify(transactionCoordinator, never()).deletePendingMedia(any());
    }

    @Test
    @DisplayName("uploadMedia compensation failure retains PENDING record for reconciliation")
    void uploadMedia_StorageFailure_CompensationFails_RetainsPendingRecord() throws Exception {
        byte[] imageBytes = new byte[] { 1, 2, 3 };
        MockMultipartFile file = new MockMultipartFile("file", "test.jpg", "image/jpeg", imageBytes);
        ProcessedImage processed = new ProcessedImage(imageBytes, "image/jpeg", 100, 100, 3, "sha256hex");

        when(imageProcessor.process(any(MultipartFile.class))).thenReturn(processed);

        Media pendingMedia = new Media();
        pendingMedia.setId(mediaId);
        pendingMedia.setOwner(owner);
        pendingMedia.setStatus(MediaStatus.PENDING);
        pendingMedia.setBucket("goplant-private-media");
        pendingMedia.setObjectKey("users/" + ownerId + "/" + mediaId + ".jpg");

        when(transactionCoordinator.createPendingMedia(eq(ownerId), eq("goplant-private-media"), anyString(), eq(processed)))
            .thenReturn(pendingMedia);

        doThrow(new StorageUnavailableException("Upload timeout", true))
            .when(storageGateway).upload(anyString(), anyString(), any(), anyString());
        doThrow(new RuntimeException("Storage compensation delete failed"))
            .when(storageGateway).delete(anyString(), anyString());

        assertThrows(StorageUnavailableException.class, () -> mediaService.uploadMedia(ownerId, file));

        // When compensation delete fails, we do NOT delete the pending media record so it can be reconciled
        verify(transactionCoordinator, never()).deletePendingMedia(any());
    }

    @Test
    @DisplayName("uploadMedia triggers compensation delete and retains PENDING record if DB markReady fails after storage upload")
    void uploadMedia_DbCommitReadyFailure_TriggersCompensationAndRetainsPending() throws Exception {
        byte[] imageBytes = new byte[] { 1, 2, 3 };
        MockMultipartFile file = new MockMultipartFile("file", "test.jpg", "image/jpeg", imageBytes);
        ProcessedImage processed = new ProcessedImage(imageBytes, "image/jpeg", 100, 100, 3, "sha256hex");

        when(imageProcessor.process(any(MultipartFile.class))).thenReturn(processed);

        Media pendingMedia = new Media();
        pendingMedia.setId(mediaId);
        pendingMedia.setOwner(owner);
        pendingMedia.setStatus(MediaStatus.PENDING);
        pendingMedia.setBucket("goplant-private-media");
        pendingMedia.setObjectKey("users/" + ownerId + "/" + mediaId + ".jpg");

        when(transactionCoordinator.createPendingMedia(eq(ownerId), eq("goplant-private-media"), anyString(), eq(processed)))
            .thenReturn(pendingMedia);
        when(transactionCoordinator.markReady(mediaId)).thenThrow(new RuntimeException("DB Connection timeout"));

        assertThrows(StorageUnavailableException.class, () -> mediaService.uploadMedia(ownerId, file));

        // Compensation delete triggered and PENDING record retained for reconciliation
        verify(storageGateway).delete(eq("goplant-private-media"), anyString());
        verify(transactionCoordinator, never()).deletePendingMedia(any());
    }

    @Test
    @DisplayName("getReadUrl succeeds for owner and returns signed URL with ISO-8601 expiry via snapshot")
    void getReadUrl_Owner_Success() {
        when(transactionCoordinator.getReadSnapshot(mediaId, ownerId))
            .thenReturn(new MediaTransactionCoordinator.MediaReadSnapshot(mediaId, "goplant-private-media", "users/" + ownerId + "/" + mediaId + ".jpg"));
        when(storageGateway.createSignedUrl(eq("goplant-private-media"), eq("users/" + ownerId + "/" + mediaId + ".jpg"), anyInt()))
            .thenReturn("https://test.supabase.co/storage/v1/object/sign/url?token=abc");

        MediaReadUrlResponse response = mediaService.getReadUrl(mediaId, ownerId);

        assertNotNull(response);
        assertEquals(mediaId, response.getMediaId());
        assertEquals("https://test.supabase.co/storage/v1/object/sign/url?token=abc", response.getReadUrl());
        assertNotNull(response.getExpiresAt());
        verify(transactionCoordinator).getReadSnapshot(mediaId, ownerId);
    }

    @Test
    @DisplayName("getReadUrl throws ForbiddenException when accessed by non-owner")
    void getReadUrl_NonOwner_ThrowsForbidden() {
        when(transactionCoordinator.getReadSnapshot(mediaId, otherUserId))
            .thenThrow(new ForbiddenException("Bạn không có quyền truy cập tệp tin này."));

        assertThrows(ForbiddenException.class, () -> mediaService.getReadUrl(mediaId, otherUserId));
        verify(storageGateway, never()).createSignedUrl(any(), any(), anyInt());
    }

    @Test
    @DisplayName("getReadUrl throws ValidationException when media is not READY or ATTACHED")
    void getReadUrl_NotReady_ThrowsValidation() {
        when(transactionCoordinator.getReadSnapshot(mediaId, ownerId))
            .thenThrow(new ValidationException("Tệp tin chưa sẵn sàng hoặc đã bị xóa.", "mediaId"));

        ValidationException ex = assertThrows(ValidationException.class, () -> mediaService.getReadUrl(mediaId, ownerId));
        assertTrue(ex.getMessage().contains("chưa sẵn sàng"));
        verify(storageGateway, never()).createSignedUrl(any(), any(), anyInt());
    }

    @Test
    @DisplayName("deleteMedia delegates beginDelete to coordinator and throws ForbiddenException for non-owner")
    void deleteMedia_NonOwner_ThrowsForbidden() {
        when(transactionCoordinator.beginDelete(mediaId, otherUserId))
            .thenThrow(new ForbiddenException("Bạn không có quyền thao tác trên tệp tin này."));

        assertThrows(ForbiddenException.class, () -> mediaService.deleteMedia(mediaId, otherUserId));
        verify(storageGateway, never()).delete(any(), any());
    }

    @Test
    @DisplayName("deleteMedia throws MediaAttachedException (409) when media status is ATTACHED")
    void deleteMedia_Attached_ThrowsConflict() {
        when(transactionCoordinator.beginDelete(mediaId, ownerId))
            .thenThrow(new MediaAttachedException("Không thể xóa tệp phương tiện đang được liên kết sử dụng.", mediaId));

        MediaAttachedException ex = assertThrows(MediaAttachedException.class,
            () -> mediaService.deleteMedia(mediaId, ownerId));
        assertEquals(mediaId, ex.getMediaId());
        verify(storageGateway, never()).delete(any(), any());
    }

    @Test
    @DisplayName("deleteMedia returns immediately when already DELETED (idempotent)")
    void deleteMedia_AlreadyDeleted_Idempotent() {
        when(transactionCoordinator.beginDelete(mediaId, ownerId))
            .thenReturn(MediaTransactionCoordinator.DeleteDecision.ofAlreadyDeleted());

        assertDoesNotThrow(() -> mediaService.deleteMedia(mediaId, ownerId));
        verify(storageGateway, never()).delete(any(), any());
        verify(transactionCoordinator, never()).completeDelete(any());
    }

    @Test
    @DisplayName("deleteMedia transitions through DELETING checkpoint, calls storage delete, and completes DELETED")
    void deleteMedia_Success() {
        when(transactionCoordinator.beginDelete(mediaId, ownerId))
            .thenReturn(MediaTransactionCoordinator.DeleteDecision.ofProceed("goplant-private-media", "users/file.jpg", "token-xyz"));

        mediaService.deleteMedia(mediaId, ownerId);

        verify(transactionCoordinator).beginDelete(mediaId, ownerId);
        verify(storageGateway).delete("goplant-private-media", "users/file.jpg");
        verify(transactionCoordinator).completeDelete(mediaId, "token-xyz");
    }

    @Test
    @DisplayName("deleteMedia preserves DELETING state when storage delete fails")
    void deleteMedia_StorageFailure_PreservesDeletingState() {
        when(transactionCoordinator.beginDelete(mediaId, ownerId))
            .thenReturn(MediaTransactionCoordinator.DeleteDecision.ofProceed("goplant-private-media", "users/file.jpg", "token-xyz"));
        doThrow(new StorageUnavailableException("Storage network error"))
            .when(storageGateway).delete("goplant-private-media", "users/file.jpg");

        assertThrows(StorageUnavailableException.class, () -> mediaService.deleteMedia(mediaId, ownerId));

        verify(transactionCoordinator).beginDelete(mediaId, ownerId);
        verify(storageGateway).delete("goplant-private-media", "users/file.jpg");
        verify(transactionCoordinator).recordDeleteFailure(eq(mediaId), eq("token-xyz"), anyString());
        verify(transactionCoordinator, never()).completeDelete(any(), any());
    }
}
