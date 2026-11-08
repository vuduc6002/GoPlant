package com.cmc.plant_care_backend.controller;

import com.cmc.plant_care_backend.common.response.ApiResponse;
import com.cmc.plant_care_backend.common.response.PageResponse;
import com.cmc.plant_care_backend.dto.common.SimpleMessageResponse;
import com.cmc.plant_care_backend.dto.species.AdminCreateSpeciesRequest;
import com.cmc.plant_care_backend.dto.species.AdminUpdateSpeciesRequest;
import com.cmc.plant_care_backend.dto.species.SpeciesDetailResponse;
import com.cmc.plant_care_backend.dto.species.SpeciesSummaryResponse;
import com.cmc.plant_care_backend.service.AdminSpeciesService;
import jakarta.validation.Valid;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/species")
@PreAuthorize("hasAuthority('ROLE_ADMIN')")
public class AdminSpeciesController {

    private final AdminSpeciesService adminSpeciesService;

    public AdminSpeciesController(AdminSpeciesService adminSpeciesService) {
        this.adminSpeciesService = adminSpeciesService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<PageResponse<SpeciesSummaryResponse>>> getSpecies(
        @RequestParam(required = false) String keyword,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size,
        @RequestParam(defaultValue = "commonName,asc") String sort
    ) {
        Pageable pageable = createPageable(page, size, sort);
        PageResponse<SpeciesSummaryResponse> data = adminSpeciesService.getSpeciesList(keyword, pageable);
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<SpeciesDetailResponse>> createSpecies(
        @Valid @RequestBody AdminCreateSpeciesRequest request
    ) {
        SpeciesDetailResponse data = adminSpeciesService.createSpecies(request);
        return new ResponseEntity<>(ApiResponse.created(data), HttpStatus.CREATED);
    }

    @PutMapping("/{speciesId}")
    public ResponseEntity<ApiResponse<SpeciesDetailResponse>> updateSpecies(
        @PathVariable UUID speciesId,
        @Valid @RequestBody AdminUpdateSpeciesRequest request
    ) {
        SpeciesDetailResponse data = adminSpeciesService.updateSpecies(speciesId, request);
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @DeleteMapping("/{speciesId}")
    public ResponseEntity<ApiResponse<SimpleMessageResponse>> deleteSpecies(
        @PathVariable UUID speciesId
    ) {
        adminSpeciesService.deleteSpecies(speciesId);
        return ResponseEntity.ok(ApiResponse.ok(new SimpleMessageResponse("Đã xóa giống cây.")));
    }

    private Pageable createPageable(int page, int size, String sort) {
        String[] parts = sort.split(",");
        String property = parts[0].trim();
        Sort.Direction direction = parts.length > 1 && parts[1].trim().equalsIgnoreCase("desc")
            ? Sort.Direction.DESC
            : Sort.Direction.ASC;
        return PageRequest.of(page, size, Sort.by(direction, property));
    }
}
