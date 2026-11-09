package com.cmc.plant_care_backend.controller;

import com.cmc.plant_care_backend.common.response.ApiResponse;
import com.cmc.plant_care_backend.dto.carelog.CareLogResponse;
import com.cmc.plant_care_backend.dto.carelog.CreateCareLogRequest;
import com.cmc.plant_care_backend.security.UserPrincipal;
import com.cmc.plant_care_backend.service.CareLogService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/care-logs")
public class CareLogController {

    private final CareLogService careLogService;

    public CareLogController(CareLogService careLogService) {
        this.careLogService = careLogService;
    }

    @PostMapping
    public ResponseEntity<ApiResponse<CareLogResponse>> createCareLog(
        @AuthenticationPrincipal UserPrincipal principal,
        @Valid @RequestBody CreateCareLogRequest request
    ) {
        CareLogResponse data = careLogService.createCareLog(principal.getId(), request);
        return new ResponseEntity<>(ApiResponse.created(data), HttpStatus.CREATED);
    }
}
