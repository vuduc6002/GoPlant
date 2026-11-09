package com.cmc.plant_care_backend.controller;

import com.cmc.plant_care_backend.common.response.ApiResponse;
import com.cmc.plant_care_backend.dto.common.SimpleMessageResponse;
import com.cmc.plant_care_backend.dto.schedule.*;
import com.cmc.plant_care_backend.security.UserPrincipal;
import com.cmc.plant_care_backend.service.ScheduleService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/schedules")
public class ScheduleController {

    private final ScheduleService scheduleService;

    public ScheduleController(ScheduleService scheduleService) {
        this.scheduleService = scheduleService;
    }

    @PostMapping
    public ResponseEntity<ApiResponse<CareScheduleResponse>> createSchedule(
        @AuthenticationPrincipal UserPrincipal principal,
        @Valid @RequestBody CreateScheduleRequest request
    ) {
        CareScheduleResponse data = scheduleService.createSchedule(principal.getId(), request);
        return new ResponseEntity<>(ApiResponse.created(data), HttpStatus.CREATED);
    }

    @GetMapping("/today")
    public ResponseEntity<ApiResponse<List<TodayScheduleItemResponse>>> getTodaySchedules(
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        List<TodayScheduleItemResponse> data = scheduleService.getTodaySchedules(principal.getId());
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @PutMapping("/{scheduleId}")
    public ResponseEntity<ApiResponse<CareScheduleResponse>> updateSchedule(
        @PathVariable UUID scheduleId,
        @AuthenticationPrincipal UserPrincipal principal,
        @Valid @RequestBody UpdateScheduleRequest request
    ) {
        CareScheduleResponse data = scheduleService.updateSchedule(scheduleId, principal.getId(), request);
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @DeleteMapping("/{scheduleId}")
    public ResponseEntity<ApiResponse<SimpleMessageResponse>> deleteSchedule(
        @PathVariable UUID scheduleId,
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        scheduleService.deleteSchedule(scheduleId, principal.getId());
        return ResponseEntity.ok(ApiResponse.ok(new SimpleMessageResponse("Lịch chăm sóc đã được xóa.")));
    }

    @PostMapping("/{scheduleId}/complete")
    public ResponseEntity<ApiResponse<CompleteScheduleResponse>> completeSchedule(
        @PathVariable UUID scheduleId,
        @AuthenticationPrincipal UserPrincipal principal,
        @RequestBody(required = false) CompleteCareRequest request
    ) {
        CompleteScheduleResponse data = scheduleService.completeSchedule(scheduleId, principal.getId(), request);
        return new ResponseEntity<>(ApiResponse.created(data), HttpStatus.CREATED);
    }

    @PostMapping("/{scheduleId}/skip")
    public ResponseEntity<ApiResponse<CompleteScheduleResponse>> skipSchedule(
        @PathVariable UUID scheduleId,
        @AuthenticationPrincipal UserPrincipal principal,
        @RequestBody(required = false) SkipCareRequest request
    ) {
        CompleteScheduleResponse data = scheduleService.skipSchedule(scheduleId, principal.getId(), request);
        return new ResponseEntity<>(ApiResponse.created(data), HttpStatus.CREATED);
    }
}
