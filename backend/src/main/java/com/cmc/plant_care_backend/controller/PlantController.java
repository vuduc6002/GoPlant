package com.cmc.plant_care_backend.controller;

import com.cmc.plant_care_backend.common.response.ApiResponse;
import com.cmc.plant_care_backend.common.response.PageResponse;
import com.cmc.plant_care_backend.dto.carelog.CareLogResponse;
import com.cmc.plant_care_backend.dto.common.SimpleMessageResponse;
import com.cmc.plant_care_backend.dto.journal.GrowthJournalResponse;
import com.cmc.plant_care_backend.dto.plant.CreateUserPlantRequest;
import com.cmc.plant_care_backend.dto.plant.UpdateUserPlantRequest;
import com.cmc.plant_care_backend.dto.plant.UserPlantDetailResponse;
import com.cmc.plant_care_backend.dto.plant.UserPlantSummaryResponse;
import com.cmc.plant_care_backend.dto.schedule.CareScheduleResponse;
import com.cmc.plant_care_backend.model.enums.HealthStatus;
import com.cmc.plant_care_backend.model.enums.ScheduleStatus;
import com.cmc.plant_care_backend.security.UserPrincipal;
import com.cmc.plant_care_backend.service.PlantService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class PlantController {

    private final PlantService plantService;

    public PlantController(PlantService plantService) {
        this.plantService = plantService;
    }

    @PostMapping("/gardens/{gardenId}/plants")
    public ResponseEntity<ApiResponse<UserPlantDetailResponse>> createPlant(
        @PathVariable UUID gardenId,
        @AuthenticationPrincipal UserPrincipal principal,
        @Valid @RequestBody CreateUserPlantRequest request
    ) {
        UserPlantDetailResponse data = plantService.createPlant(gardenId, principal.getId(), request);
        return new ResponseEntity<>(ApiResponse.created(data), HttpStatus.CREATED);
    }

    @GetMapping("/plants")
    public ResponseEntity<ApiResponse<PageResponse<UserPlantSummaryResponse>>> getMyPlants(
        @AuthenticationPrincipal UserPrincipal principal,
        @RequestParam(required = false) String keyword,
        @RequestParam(required = false) UUID gardenId,
        @RequestParam(required = false) HealthStatus healthStatus,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size,
        @RequestParam(defaultValue = "createdAt,desc") String sort
    ) {
        PageResponse<UserPlantSummaryResponse> data = plantService.getMyPlants(
            principal.getId(), keyword, gardenId, healthStatus, page, size, sort
        );
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @GetMapping("/plants/{plantId}")
    public ResponseEntity<ApiResponse<UserPlantDetailResponse>> getPlantDetail(
        @PathVariable UUID plantId,
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        UserPlantDetailResponse data = plantService.getPlantDetail(plantId, principal.getId());
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @PutMapping("/plants/{plantId}")
    public ResponseEntity<ApiResponse<UserPlantDetailResponse>> updatePlant(
        @PathVariable UUID plantId,
        @AuthenticationPrincipal UserPrincipal principal,
        @Valid @RequestBody UpdateUserPlantRequest request
    ) {
        UserPlantDetailResponse data = plantService.updatePlant(plantId, principal.getId(), request);
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @DeleteMapping("/plants/{plantId}")
    public ResponseEntity<ApiResponse<SimpleMessageResponse>> deletePlant(
        @PathVariable UUID plantId,
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        plantService.deletePlant(plantId, principal.getId());
        return ResponseEntity.ok(ApiResponse.ok(new SimpleMessageResponse("Cây trồng đã được xóa.")));
    }

    @GetMapping("/plants/{plantId}/schedules")
    public ResponseEntity<ApiResponse<PageResponse<CareScheduleResponse>>> getPlantSchedules(
        @PathVariable UUID plantId,
        @AuthenticationPrincipal UserPrincipal principal,
        @RequestParam(required = false) ScheduleStatus status,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        PageResponse<CareScheduleResponse> data = plantService.getPlantSchedules(
            plantId, principal.getId(), status, page, size
        );
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @GetMapping("/plants/{plantId}/care-logs")
    public ResponseEntity<ApiResponse<PageResponse<CareLogResponse>>> getPlantCareLogs(
        @PathVariable UUID plantId,
        @AuthenticationPrincipal UserPrincipal principal,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        PageResponse<CareLogResponse> data = plantService.getPlantCareLogs(
            plantId, principal.getId(), page, size
        );
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @GetMapping("/plants/{plantId}/journals")
    public ResponseEntity<ApiResponse<PageResponse<GrowthJournalResponse>>> getPlantJournals(
        @PathVariable UUID plantId,
        @AuthenticationPrincipal UserPrincipal principal,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        PageResponse<GrowthJournalResponse> data = plantService.getPlantJournals(
            plantId, principal.getId(), page, size
        );
        return ResponseEntity.ok(ApiResponse.ok(data));
    }
}
