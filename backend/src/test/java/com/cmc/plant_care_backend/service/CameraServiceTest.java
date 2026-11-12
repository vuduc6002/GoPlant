package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.common.exception.ForbiddenException;
import com.cmc.plant_care_backend.common.exception.ResourceNotFoundException;
import com.cmc.plant_care_backend.common.exception.ValidationException;
import com.cmc.plant_care_backend.common.validation.CameraConnectionNoteValidator;
import com.cmc.plant_care_backend.dto.camera.CameraResponse;
import com.cmc.plant_care_backend.dto.camera.CreateCameraRequest;
import com.cmc.plant_care_backend.dto.camera.UpdateCameraRequest;
import com.cmc.plant_care_backend.model.Camera;
import com.cmc.plant_care_backend.model.Garden;
import com.cmc.plant_care_backend.model.User;
import com.cmc.plant_care_backend.model.enums.CameraStatus;
import com.cmc.plant_care_backend.repository.CameraRepository;
import com.cmc.plant_care_backend.repository.GardenRepository;
import com.cmc.plant_care_backend.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CameraServiceTest {

    @Mock
    private CameraRepository cameraRepository;

    @Mock
    private GardenRepository gardenRepository;

    @Mock
    private UserRepository userRepository;

    private CameraService cameraService;

    private UUID ownerId;
    private UUID otherUserId;
    private UUID gardenId;
    private User owner;
    private User otherUser;
    private Garden garden;

    @BeforeEach
    void setUp() {
        cameraService = new CameraService(
            cameraRepository,
            gardenRepository,
            userRepository,
            new CameraConnectionNoteValidator()
        );
        ownerId = UUID.randomUUID();
        otherUserId = UUID.randomUUID();
        gardenId = UUID.randomUUID();

        owner = new User();
        owner.setId(ownerId);

        otherUser = new User();
        otherUser.setId(otherUserId);

        garden = new Garden();
        garden.setId(gardenId);
        garden.setOwner(owner);
        garden.setName("Ban công tầng 3");
    }

    @Test
    void getCamerasByGarden_WhenOwner_ShouldReturnOrderedCameras() {
        Camera cam = new Camera();
        cam.setId(UUID.randomUUID());
        cam.setGarden(garden);
        cam.setOwner(owner);
        cam.setName("Camera Đông");
        cam.setLocationDesc("Góc tường phải");
        cam.setStatus(CameraStatus.OFFLINE);
        cam.setConnectionNote("Đã kiểm tra nguồn điện và cáp mạng");
        cam.setCreatedAt(OffsetDateTime.now(ZoneOffset.UTC));
        cam.setUpdatedAt(OffsetDateTime.now(ZoneOffset.UTC));

        when(gardenRepository.findById(gardenId)).thenReturn(Optional.of(garden));
        when(cameraRepository.findByGardenIdAndOwnerIdOrderByCreatedAtAscIdAsc(gardenId, ownerId))
            .thenReturn(List.of(cam));

        List<CameraResponse> result = cameraService.getCamerasByGarden(gardenId, ownerId);

        assertEquals(1, result.size());
        assertEquals(cam.getId(), result.get(0).getId());
        assertEquals(gardenId, result.get(0).getGardenId());
        assertEquals("Camera Đông", result.get(0).getName());
        assertEquals(CameraStatus.OFFLINE, result.get(0).getStatus());
    }

    @Test
    void getCamerasByGarden_WhenGardenNotFound_ShouldThrow404() {
        when(gardenRepository.findById(gardenId)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class,
            () -> cameraService.getCamerasByGarden(gardenId, ownerId));
        verify(cameraRepository, never()).findByGardenIdAndOwnerIdOrderByCreatedAtAscIdAsc(any(), any());
    }

    @Test
    void getCamerasByGarden_WhenNotOwner_ShouldThrow403WithoutQueryingCameras() {
        when(gardenRepository.findById(gardenId)).thenReturn(Optional.of(garden));

        assertThrows(ForbiddenException.class,
            () -> cameraService.getCamerasByGarden(gardenId, otherUserId));
        verify(cameraRepository, never()).findByGardenIdAndOwnerIdOrderByCreatedAtAscIdAsc(any(), any());
    }

    @Test
    void createCamera_ShouldDefaultOfflineAndUseServerOwner() {
        CreateCameraRequest req = new CreateCameraRequest();
        req.setName("  Camera Cửa Sổ  ");
        req.setLocationDesc("  Cạnh cửa kính  ");
        req.setConnectionNote("   ");

        when(gardenRepository.findById(gardenId)).thenReturn(Optional.of(garden));
        when(userRepository.getReferenceById(ownerId)).thenReturn(owner);
        when(cameraRepository.save(any(Camera.class))).thenAnswer(inv -> {
            Camera c = inv.getArgument(0);
            c.setId(UUID.randomUUID());
            c.setCreatedAt(OffsetDateTime.now(ZoneOffset.UTC));
            c.setUpdatedAt(OffsetDateTime.now(ZoneOffset.UTC));
            return c;
        });

        CameraResponse created = cameraService.createCamera(gardenId, ownerId, req);

        assertEquals("Camera Cửa Sổ", created.getName());
        assertEquals("Cạnh cửa kính", created.getLocationDesc());
        assertNull(created.getConnectionNote());
        assertEquals(CameraStatus.OFFLINE, created.getStatus());
        assertEquals(gardenId, created.getGardenId());
    }

    @Test
    void createCamera_WhenInvalidNameOrCredentialNote_ShouldRejectAndNeverSave() {
        when(gardenRepository.findById(gardenId)).thenReturn(Optional.of(garden));

        CreateCameraRequest blankName = new CreateCameraRequest();
        blankName.setName("   ");
        ValidationException exBlank = assertThrows(ValidationException.class,
            () -> cameraService.createCamera(gardenId, ownerId, blankName));
        assertEquals("name", exBlank.getField());

        CreateCameraRequest longName = new CreateCameraRequest();
        longName.setName("A".repeat(201));
        ValidationException exLong = assertThrows(ValidationException.class,
            () -> cameraService.createCamera(gardenId, ownerId, longName));
        assertEquals("name", exLong.getField());

        CreateCameraRequest secretNote = new CreateCameraRequest();
        secretNote.setName("Camera Tây");
        secretNote.setConnectionNote("rtsp://admin:SuperPass@192.168.1.50:554/stream");
        ValidationException exSecret = assertThrows(ValidationException.class,
            () -> cameraService.createCamera(gardenId, ownerId, secretNote));
        assertEquals("connectionNote", exSecret.getField());
        assertFalse(exSecret.getMessage().contains("SuperPass"));

        verify(cameraRepository, never()).save(any());
    }

    @Test
    void updateCamera_PartialAndClearSemantics_ShouldWork() {
        UUID cameraId = UUID.randomUUID();
        Camera existing = new Camera();
        existing.setId(cameraId);
        existing.setGarden(garden);
        existing.setOwner(owner);
        existing.setName("Camera Gốc");
        existing.setLocationDesc("Vị trí cũ");
        existing.setConnectionNote("Ghi chú cũ");
        existing.setStatus(CameraStatus.OFFLINE);

        when(cameraRepository.findById(cameraId)).thenReturn(Optional.of(existing));
        when(cameraRepository.save(any(Camera.class))).thenAnswer(inv -> inv.getArgument(0));

        // 1. Omitted fields are preserved
        UpdateCameraRequest partialReq = new UpdateCameraRequest();
        partialReq.setStatus(CameraStatus.ONLINE);
        CameraResponse afterStatusOnly = cameraService.updateCamera(cameraId, ownerId, partialReq);
        assertEquals("Camera Gốc", afterStatusOnly.getName());
        assertEquals("Vị trí cũ", afterStatusOnly.getLocationDesc());
        assertEquals("Ghi chú cũ", afterStatusOnly.getConnectionNote());
        assertEquals(CameraStatus.ONLINE, afterStatusOnly.getStatus());

        // 2. Empty optional strings clear to null
        UpdateCameraRequest clearReq = new UpdateCameraRequest();
        clearReq.setLocationDesc("   ");
        clearReq.setConnectionNote("");
        CameraResponse afterClear = cameraService.updateCamera(cameraId, ownerId, clearReq);
        assertEquals("Camera Gốc", afterClear.getName());
        assertNull(afterClear.getLocationDesc());
        assertNull(afterClear.getConnectionNote());
    }

    @Test
    void updateCamera_WhenBlankNameOrNotOwner_ShouldReject() {
        UUID cameraId = UUID.randomUUID();
        Camera existing = new Camera();
        existing.setId(cameraId);
        existing.setGarden(garden);
        existing.setOwner(owner);
        existing.setName("Camera Gốc");

        when(cameraRepository.findById(cameraId)).thenReturn(Optional.of(existing));

        UpdateCameraRequest blankNameReq = new UpdateCameraRequest();
        blankNameReq.setName("   ");
        ValidationException ex = assertThrows(ValidationException.class,
            () -> cameraService.updateCamera(cameraId, ownerId, blankNameReq));
        assertEquals("name", ex.getField());

        UpdateCameraRequest otherUserReq = new UpdateCameraRequest();
        otherUserReq.setName("Đổi trái phép");
        assertThrows(ForbiddenException.class,
            () -> cameraService.updateCamera(cameraId, otherUserId, otherUserReq));

        verify(cameraRepository, never()).save(any());
    }

    @Test
    void deleteCamera_ShouldEnforceOwnershipAndNotFound() {
        UUID cameraId = UUID.randomUUID();
        Camera existing = new Camera();
        existing.setId(cameraId);
        existing.setGarden(garden);
        existing.setOwner(owner);

        when(cameraRepository.findById(cameraId)).thenReturn(Optional.empty());
        assertThrows(ResourceNotFoundException.class, () -> cameraService.deleteCamera(cameraId, ownerId));

        when(cameraRepository.findById(cameraId)).thenReturn(Optional.of(existing));
        assertThrows(ForbiddenException.class, () -> cameraService.deleteCamera(cameraId, otherUserId));
        verify(cameraRepository, never()).delete(any());

        cameraService.deleteCamera(cameraId, ownerId);
        verify(cameraRepository).delete(existing);
    }
}
