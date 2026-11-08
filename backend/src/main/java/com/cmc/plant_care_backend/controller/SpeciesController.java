package com.cmc.plant_care_backend.controller;

import com.cmc.plant_care_backend.common.response.ApiResponse;
import com.cmc.plant_care_backend.common.response.PageResponse;
import com.cmc.plant_care_backend.dto.common.SimpleMessageResponse;
import com.cmc.plant_care_backend.dto.species.SpeciesDetailResponse;
import com.cmc.plant_care_backend.dto.species.SpeciesSummaryResponse;
import com.cmc.plant_care_backend.security.UserPrincipal;
import com.cmc.plant_care_backend.service.SpeciesService;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/species")
public class SpeciesController {

    private final SpeciesService speciesService;

    public SpeciesController(SpeciesService speciesService) {
        this.speciesService = speciesService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<PageResponse<SpeciesSummaryResponse>>> getSpecies(
        @RequestParam(required = false) String keyword,
        @RequestParam(required = false) String category,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size,
        @RequestParam(defaultValue = "commonName,asc") String sort,
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        Pageable pageable = createPageable(page, size, sort);
        UUID currentUserId = principal != null ? principal.getId() : null;
        PageResponse<SpeciesSummaryResponse> data = speciesService.getSpeciesList(keyword, category, currentUserId, pageable);
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @GetMapping("/{speciesId}")
    public ResponseEntity<ApiResponse<SpeciesDetailResponse>> getSpeciesDetail(
        @PathVariable UUID speciesId,
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        UUID currentUserId = principal != null ? principal.getId() : null;
        SpeciesDetailResponse data = speciesService.getSpeciesDetail(speciesId, currentUserId);
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @PostMapping("/{speciesId}/favorite")
    public ResponseEntity<ApiResponse<SimpleMessageResponse>> addFavorite(
        @PathVariable UUID speciesId,
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        speciesService.addFavorite(speciesId, principal.getId());
        return new ResponseEntity<>(
            ApiResponse.ok(new SimpleMessageResponse("Đã thêm vào danh sách yêu thích.")),
            HttpStatus.CREATED
        );
    }

    @DeleteMapping("/{speciesId}/favorite")
    public ResponseEntity<ApiResponse<SimpleMessageResponse>> removeFavorite(
        @PathVariable UUID speciesId,
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        speciesService.removeFavorite(speciesId, principal.getId());
        return ResponseEntity.ok(ApiResponse.ok(new SimpleMessageResponse("Đã bỏ khỏi danh sách yêu thích.")));
    }

    @GetMapping("/favorites")
    public ResponseEntity<ApiResponse<PageResponse<SpeciesSummaryResponse>>> getFavoriteSpecies(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size,
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        Pageable pageable = PageRequest.of(page, size);
        PageResponse<SpeciesSummaryResponse> data = speciesService.getFavoriteSpecies(principal.getId(), pageable);
        return ResponseEntity.ok(ApiResponse.ok(data));
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
