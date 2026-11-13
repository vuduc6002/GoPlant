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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
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
    private UserRepository userRepository;

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
            "test-key",
            "goplant-private-media",
            5242880L,
            300
        );
        mediaService = new MediaService(
            mediaRepository,
            userRepository,
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
    @DisplayName("uploadMedia successfully validates, saves PENDING, uploads, and updates to READY")
    void uploadMedia_Success() throws Exception {
        byte[] imageBytes = new byte[] { 1, 2, 3 };
        MockMultipartFile file = new MockMultipartFile("file", "test.jpg", "image/jpeg", imageBytes);
        ProcessedImage processed = new ProcessedImage(imageBytes, "image/jpeg", 100, 100, 3, "sha256hex");

        when(userRepository.findById(ownerId)).thenReturn(Optional.of(owner));
        when(imageProcessor.process(any(MultipartFile.class))).thenReturn(processed);

        Media savedPending = new Media();
        savedPending.setId(mediaId);
        savedPending.setOwner(owner);
        savedPending.setStatus(MediaStatus.PENDING);
        savedPending.setBucket("goplant-private-media");
        savedPending.setObjectKey("users/" + ownerId + "/" + mediaId + ".jpg");

        when(mediaRepository.save(any(Media.class))).thenAnswer(invocation -> {
            Media m = invocation.getArgument(0);
            if (m.getId() == null) {
                m.setId(mediaId);
            }
            return m;
        });

        MediaResponse response = mediaService.uploadMedia(ownerId, file);

        assertNotNull(response);
        assertNotNull(response.getId());
        assertEquals("image/jpeg", response.getMimeType());
        assertEquals(MediaStatus.READY.name(), response.getStatus());

        verify(storageGateway).upload(eq("goplant-private-media"), anyString(), eq(imageBytes), eq("image/jpeg"));
        verify(mediaRepository, times(2)).save(any(Media.class));
    }

    @Test
    @DisplayName("uploadMedia cleans up PENDING record if Supabase storage upload fails")
    void uploadMedia_StorageFailure_DeletesPendingRecord() throws Exception {
        byte[] imageBytes = new byte[] { 1, 2, 3 };
        MockMultipartFile file = new MockMultipartFile("file", "test.jpg", "image/jpeg", imageBytes);
        ProcessedImage processed = new ProcessedImage(imageBytes, "image/jpeg", 100, 100, 3, "sha256hex");

        when(userRepository.findById(ownerId)).thenReturn(Optional.of(owner));
        when(imageProcessor.process(any(MultipartFile.class))).thenReturn(processed);
        when(mediaRepository.save(any(Media.class))).thenAnswer(invocation -> {
            Media m = invocation.getArgument(0);
            if (m.getId() == null) {
                m.setId(mediaId);
            }
            return m;
        });

        doThrow(new StorageUnavailableException("Storage down"))
            .when(storageGateway).upload(anyString(), anyString(), any(), anyString());

        assertThrows(StorageUnavailableException.class, () -> mediaService.uploadMedia(ownerId, file));
        verify(mediaRepository).delete(any(Media.class));
    }

    @Test
    @DisplayName("getReadUrl succeeds for owner and returns signed URL with ISO-8601 expiry")
    void getReadUrl_Owner_Success() {
        Media media = new Media();
        media.setId(mediaId);
        media.setOwner(owner);
        media.setStatus(MediaStatus.READY);
        media.setBucket("goplant-private-media");
        media.setObjectKey("users/" + ownerId + "/" + mediaId + ".jpg");

        when(mediaRepository.findById(mediaId)).thenReturn(Optional.of(media));
        when(storageGateway.createSignedUrl(eq("goplant-private-media"), eq(media.getObjectKey()), anyInt()))
            .thenReturn("https://test.supabase.co/storage/v1/object/sign/url?token=abc");

        MediaReadUrlResponse response = mediaService.getReadUrl(mediaId, ownerId);

        assertNotNull(response);
        assertEquals(mediaId, response.getMediaId());
        assertEquals("https://test.supabase.co/storage/v1/object/sign/url?token=abc", response.getReadUrl());
        assertNotNull(response.getExpiresAt());
    }

    @Test
    @DisplayName("getReadUrl throws ForbiddenException when accessed by non-owner")
    void getReadUrl_NonOwner_ThrowsForbidden() {
        Media media = new Media();
        media.setId(mediaId);
        media.setOwner(owner);
        media.setStatus(MediaStatus.READY);

        when(mediaRepository.findById(mediaId)).thenReturn(Optional.of(media));

        assertThrows(ForbiddenException.class, () -> mediaService.getReadUrl(mediaId, otherUserId));
        verify(storageGateway, never()).createSignedUrl(any(), any(), anyInt());
    }

    @Test
    @DisplayName("getReadUrl throws ValidationException when media is not READY or ATTACHED")
    void getReadUrl_NotReady_ThrowsValidation() {
        Media media = new Media();
        media.setId(mediaId);
        media.setOwner(owner);
        media.setStatus(MediaStatus.PENDING);

        when(mediaRepository.findById(mediaId)).thenReturn(Optional.of(media));

        ValidationException ex = assertThrows(ValidationException.class, () -> mediaService.getReadUrl(mediaId, ownerId));
        assertTrue(ex.getMessage().contains("chưa sẵn sàng"));
    }

    @Test
    @DisplayName("deleteMedia throws ForbiddenException for non-owner")
    void deleteMedia_NonOwner_ThrowsForbidden() {
        Media media = new Media();
        media.setId(mediaId);
        media.setOwner(owner);
        media.setStatus(MediaStatus.READY);

        when(mediaRepository.findById(mediaId)).thenReturn(Optional.of(media));

        assertThrows(ForbiddenException.class, () -> mediaService.deleteMedia(mediaId, otherUserId));
        verify(storageGateway, never()).delete(any(), any());
    }

    @Test
    @DisplayName("deleteMedia throws MediaAttachedException (409) when media status is ATTACHED")
    void deleteMedia_Attached_ThrowsConflict() {
        Media media = new Media();
        media.setId(mediaId);
        media.setOwner(owner);
        media.setStatus(MediaStatus.ATTACHED);

        when(mediaRepository.findById(mediaId)).thenReturn(Optional.of(media));

        MediaAttachedException ex = assertThrows(MediaAttachedException.class,
            () -> mediaService.deleteMedia(mediaId, ownerId));
        assertEquals(mediaId, ex.getMediaId());
        verify(storageGateway, never()).delete(any(), any());
    }

    @Test
    @DisplayName("deleteMedia transitions through DELETING to DELETED and removes from storage")
    void deleteMedia_Ready_Success() {
        Media media = new Media();
        media.setId(mediaId);
        media.setOwner(owner);
        media.setStatus(MediaStatus.READY);
        media.setBucket("goplant-private-media");
        media.setObjectKey("users/" + ownerId + "/" + mediaId + ".jpg");

        when(mediaRepository.findById(mediaId)).thenReturn(Optional.of(media));
        when(mediaRepository.save(any(Media.class))).thenAnswer(i -> i.getArgument(0));

        mediaService.deleteMedia(mediaId, ownerId);

        verify(storageGateway).delete("goplant-private-media", media.getObjectKey());
        assertEquals(MediaStatus.DELETED, media.getStatus());
        verify(mediaRepository, times(2)).save(media);
    }
}
