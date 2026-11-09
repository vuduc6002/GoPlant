package com.cmc.plant_care_backend.controller;

import com.cmc.plant_care_backend.common.response.ApiResponse;
import com.cmc.plant_care_backend.dto.common.SimpleMessageResponse;
import com.cmc.plant_care_backend.dto.journal.CreateGrowthJournalRequest;
import com.cmc.plant_care_backend.dto.journal.GrowthJournalResponse;
import com.cmc.plant_care_backend.dto.journal.UpdateGrowthJournalRequest;
import com.cmc.plant_care_backend.security.UserPrincipal;
import com.cmc.plant_care_backend.service.GrowthJournalService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/journals")
public class GrowthJournalController {

    private final GrowthJournalService growthJournalService;

    public GrowthJournalController(GrowthJournalService growthJournalService) {
        this.growthJournalService = growthJournalService;
    }

    @PostMapping
    public ResponseEntity<ApiResponse<GrowthJournalResponse>> createJournal(
        @AuthenticationPrincipal UserPrincipal principal,
        @Valid @RequestBody CreateGrowthJournalRequest request
    ) {
        GrowthJournalResponse data = growthJournalService.createJournal(principal.getId(), request);
        return new ResponseEntity<>(ApiResponse.created(data), HttpStatus.CREATED);
    }

    @PutMapping("/{journalId}")
    public ResponseEntity<ApiResponse<GrowthJournalResponse>> updateJournal(
        @PathVariable UUID journalId,
        @AuthenticationPrincipal UserPrincipal principal,
        @RequestBody UpdateGrowthJournalRequest request
    ) {
        GrowthJournalResponse data = growthJournalService.updateJournal(journalId, principal.getId(), request);
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @DeleteMapping("/{journalId}")
    public ResponseEntity<ApiResponse<SimpleMessageResponse>> deleteJournal(
        @PathVariable UUID journalId,
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        growthJournalService.deleteJournal(journalId, principal.getId());
        return ResponseEntity.ok(ApiResponse.ok(new SimpleMessageResponse("Ghi nhận đã được xóa.")));
    }
}
