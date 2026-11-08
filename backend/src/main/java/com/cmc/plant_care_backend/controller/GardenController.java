package com.cmc.plant_care_backend.controller;

import com.cmc.plant_care_backend.common.response.ApiResponse;
import com.cmc.plant_care_backend.dto.common.SimpleMessageResponse;
import com.cmc.plant_care_backend.dto.garden.CreateGardenRequest;
import com.cmc.plant_care_backend.dto.garden.GardenDetailResponse;
import com.cmc.plant_care_backend.dto.garden.GardenSummaryResponse;
import com.cmc.plant_care_backend.dto.garden.UpdateGardenRequest;
import com.cmc.plant_care_backend.security.UserPrincipal;
import com.cmc.plant_care_backend.service.GardenService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/gardens")
public class GardenController {

    private final GardenService gardenService;

    public GardenController(GardenService gardenService) {
        this.gardenService = gardenService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<GardenSummaryResponse>>> getGardens(
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        List<GardenSummaryResponse> data = gardenService.getGardens(principal.getId());
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<GardenDetailResponse>> createGarden(
        @AuthenticationPrincipal UserPrincipal principal,
        @Valid @RequestBody CreateGardenRequest request
    ) {
        GardenDetailResponse data = gardenService.createGarden(principal.getId(), request);
        return new ResponseEntity<>(ApiResponse.created(data), HttpStatus.CREATED);
    }

    @GetMapping("/{gardenId}")
    public ResponseEntity<ApiResponse<GardenDetailResponse>> getGardenDetail(
        @PathVariable UUID gardenId,
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        GardenDetailResponse data = gardenService.getGardenDetail(gardenId, principal.getId());
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @PutMapping("/{gardenId}")
    public ResponseEntity<ApiResponse<GardenDetailResponse>> updateGarden(
        @PathVariable UUID gardenId,
        @AuthenticationPrincipal UserPrincipal principal,
        @Valid @RequestBody UpdateGardenRequest request
    ) {
        GardenDetailResponse data = gardenService.updateGarden(gardenId, principal.getId(), request);
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @DeleteMapping("/{gardenId}")
    public ResponseEntity<ApiResponse<SimpleMessageResponse>> deleteGarden(
        @PathVariable UUID gardenId,
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        gardenService.deleteGarden(gardenId, principal.getId());
        return ResponseEntity.ok(ApiResponse.ok(new SimpleMessageResponse("Khu vườn đã được xóa.")));
    }
}
