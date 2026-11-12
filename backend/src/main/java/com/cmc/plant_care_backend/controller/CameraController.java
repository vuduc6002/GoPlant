package com.cmc.plant_care_backend.controller;

import com.cmc.plant_care_backend.common.response.ApiResponse;
import com.cmc.plant_care_backend.dto.camera.CameraResponse;
import com.cmc.plant_care_backend.dto.camera.CreateCameraRequest;
import com.cmc.plant_care_backend.dto.camera.UpdateCameraRequest;
import com.cmc.plant_care_backend.dto.common.SimpleMessageResponse;
import com.cmc.plant_care_backend.security.UserPrincipal;
import com.cmc.plant_care_backend.service.CameraService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class CameraController {

    private final CameraService cameraService;

    public CameraController(CameraService cameraService) {
        this.cameraService = cameraService;
    }

    @GetMapping("/gardens/{gardenId}/cameras")
    public ResponseEntity<ApiResponse<List<CameraResponse>>> getGardenCameras(
        @PathVariable UUID gardenId,
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        List<CameraResponse> data = cameraService.getCamerasByGarden(gardenId, principal.getId());
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @PostMapping("/gardens/{gardenId}/cameras")
    public ResponseEntity<ApiResponse<CameraResponse>> createCamera(
        @PathVariable UUID gardenId,
        @AuthenticationPrincipal UserPrincipal principal,
        @Valid @RequestBody CreateCameraRequest request
    ) {
        CameraResponse data = cameraService.createCamera(gardenId, principal.getId(), request);
        return new ResponseEntity<>(ApiResponse.created(data), HttpStatus.CREATED);
    }

    @PutMapping("/cameras/{cameraId}")
    public ResponseEntity<ApiResponse<CameraResponse>> updateCamera(
        @PathVariable UUID cameraId,
        @AuthenticationPrincipal UserPrincipal principal,
        @Valid @RequestBody UpdateCameraRequest request
    ) {
        CameraResponse data = cameraService.updateCamera(cameraId, principal.getId(), request);
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @DeleteMapping("/cameras/{cameraId}")
    public ResponseEntity<ApiResponse<SimpleMessageResponse>> deleteCamera(
        @PathVariable UUID cameraId,
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        cameraService.deleteCamera(cameraId, principal.getId());
        return ResponseEntity.ok(ApiResponse.ok(new SimpleMessageResponse("Camera đã được xóa.")));
    }
}
