package com.cmc.plant_care_backend.controller;

import com.cmc.plant_care_backend.common.response.ApiResponse;
import com.cmc.plant_care_backend.dto.monitoring.MonitoringOverviewResponse;
import com.cmc.plant_care_backend.dto.monitoring.PlantMonitoringDetailResponse;
import com.cmc.plant_care_backend.security.UserPrincipal;
import com.cmc.plant_care_backend.service.MonitoringService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/monitoring")
public class MonitoringController {

    private final MonitoringService monitoringService;

    public MonitoringController(MonitoringService monitoringService) {
        this.monitoringService = monitoringService;
    }

    @GetMapping("/overview")
    public ResponseEntity<ApiResponse<MonitoringOverviewResponse>> getOverview(
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        MonitoringOverviewResponse data = monitoringService.getOverview(principal.getId());
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @GetMapping("/plants/{plantId}")
    public ResponseEntity<ApiResponse<PlantMonitoringDetailResponse>> getPlantDetail(
        @PathVariable UUID plantId,
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        PlantMonitoringDetailResponse data = monitoringService.getPlantDetail(plantId, principal.getId());
        return ResponseEntity.ok(ApiResponse.ok(data));
    }
}
