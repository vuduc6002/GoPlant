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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class CameraService {

    public static final int CAMERA_NAME_MAX_LENGTH = 200;

    private final CameraRepository cameraRepository;
    private final GardenRepository gardenRepository;
    private final UserRepository userRepository;
    private final CameraConnectionNoteValidator connectionNoteValidator;

    public CameraService(
        CameraRepository cameraRepository,
        GardenRepository gardenRepository,
        UserRepository userRepository,
        CameraConnectionNoteValidator connectionNoteValidator
    ) {
        this.cameraRepository = cameraRepository;
        this.gardenRepository = gardenRepository;
        this.userRepository = userRepository;
        this.connectionNoteValidator = connectionNoteValidator;
    }

    @Transactional(readOnly = true)
    public List<CameraResponse> getCamerasByGarden(UUID gardenId, UUID currentUserId) {
        Garden garden = gardenRepository.findById(gardenId)
            .orElseThrow(() -> new ResourceNotFoundException("Khu vườn", gardenId));

        validateGardenOwnership(garden, currentUserId);

        return cameraRepository.findByGardenIdAndOwnerIdOrderByCreatedAtAscIdAsc(garden.getId(), currentUserId)
            .stream()
            .map(this::mapToResponse)
            .collect(Collectors.toList());
    }

    @Transactional
    public CameraResponse createCamera(UUID gardenId, UUID currentUserId, CreateCameraRequest req) {
        Garden garden = gardenRepository.findById(gardenId)
            .orElseThrow(() -> new ResourceNotFoundException("Khu vườn", gardenId));

        validateGardenOwnership(garden, currentUserId);

        String trimmedName = validateCameraName(req.getName());
        String normalizedLocationDesc = normalizeOptionalText(req.getLocationDesc());
        String normalizedConnectionNote = normalizeAndValidateConnectionNote(req.getConnectionNote());

        User owner = userRepository.getReferenceById(currentUserId);

        Camera camera = new Camera();
        camera.setOwner(owner);
        camera.setGarden(garden);
        camera.setName(trimmedName);
        camera.setLocationDesc(normalizedLocationDesc);
        camera.setConnectionNote(normalizedConnectionNote);
        camera.setStatus(CameraStatus.OFFLINE);

        Camera saved = cameraRepository.save(camera);
        return mapToResponse(saved);
    }

    @Transactional
    public CameraResponse updateCamera(UUID cameraId, UUID currentUserId, UpdateCameraRequest req) {
        Camera camera = cameraRepository.findById(cameraId)
            .orElseThrow(() -> new ResourceNotFoundException("Camera", cameraId));

        validateCameraOwnership(camera, currentUserId);

        if (req.getName() != null) {
            camera.setName(validateCameraName(req.getName()));
        }
        if (req.getLocationDesc() != null) {
            camera.setLocationDesc(normalizeOptionalText(req.getLocationDesc()));
        }
        if (req.getStatus() != null) {
            camera.setStatus(req.getStatus());
        }
        if (req.getConnectionNote() != null) {
            camera.setConnectionNote(normalizeAndValidateConnectionNote(req.getConnectionNote()));
        }

        Camera updated = cameraRepository.save(camera);
        return mapToResponse(updated);
    }

    @Transactional
    public void deleteCamera(UUID cameraId, UUID currentUserId) {
        Camera camera = cameraRepository.findById(cameraId)
            .orElseThrow(() -> new ResourceNotFoundException("Camera", cameraId));

        validateCameraOwnership(camera, currentUserId);

        cameraRepository.delete(camera);
    }

    private void validateGardenOwnership(Garden garden, UUID currentUserId) {
        if (garden.getOwner() == null || !garden.getOwner().getId().equals(currentUserId)) {
            throw new ForbiddenException("Bạn không có quyền truy cập khu vườn này.");
        }
    }

    private void validateCameraOwnership(Camera camera, UUID currentUserId) {
        if (camera.getOwner() == null || !camera.getOwner().getId().equals(currentUserId)) {
            throw new ForbiddenException("Bạn không có quyền thao tác trên camera này.");
        }
    }

    private String validateCameraName(String rawName) {
        if (rawName == null || rawName.trim().isEmpty()) {
            throw new ValidationException("Tên camera không được để trống", "name");
        }
        String trimmed = rawName.trim();
        if (trimmed.length() > CAMERA_NAME_MAX_LENGTH) {
            throw new ValidationException("Tên camera từ 1 đến 200 ký tự", "name");
        }
        return trimmed;
    }

    private String normalizeOptionalText(String rawValue) {
        if (rawValue == null) {
            return null;
        }
        String trimmed = rawValue.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String normalizeAndValidateConnectionNote(String rawNote) {
        if (rawNote == null) {
            return null;
        }
        String trimmed = rawNote.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        connectionNoteValidator.validate(trimmed);
        return trimmed;
    }

    private CameraResponse mapToResponse(Camera camera) {
        CameraResponse res = new CameraResponse();
        res.setId(camera.getId());
        res.setGardenId(camera.getGarden().getId());
        res.setName(camera.getName());
        res.setLocationDesc(camera.getLocationDesc());
        res.setStatus(camera.getStatus());
        res.setConnectionNote(camera.getConnectionNote());
        res.setCreatedAt(camera.getCreatedAt());
        res.setUpdatedAt(camera.getUpdatedAt());
        return res;
    }
}
