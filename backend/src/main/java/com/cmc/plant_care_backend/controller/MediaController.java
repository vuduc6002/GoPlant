package com.cmc.plant_care_backend.controller;

import com.cmc.plant_care_backend.common.response.ApiResponse;
import com.cmc.plant_care_backend.dto.common.SimpleMessageResponse;
import com.cmc.plant_care_backend.dto.media.MediaReadUrlResponse;
import com.cmc.plant_care_backend.dto.media.MediaResponse;
import com.cmc.plant_care_backend.security.UserPrincipal;
import com.cmc.plant_care_backend.service.MediaService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/media")
public class MediaController {

    private final MediaService mediaService;

    public MediaController(MediaService mediaService) {
        this.mediaService = mediaService;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<MediaResponse>> uploadMedia(
        @RequestParam("file") MultipartFile file,
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        MediaResponse data = mediaService.uploadMedia(principal.getId(), file);
        return new ResponseEntity<>(ApiResponse.created(data), HttpStatus.CREATED);
    }

    @GetMapping("/{mediaId}/read-url")
    public ResponseEntity<ApiResponse<MediaReadUrlResponse>> getReadUrl(
        @PathVariable UUID mediaId,
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        MediaReadUrlResponse data = mediaService.getReadUrl(mediaId, principal.getId());
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @DeleteMapping("/{mediaId}")
    public ResponseEntity<ApiResponse<SimpleMessageResponse>> deleteMedia(
        @PathVariable UUID mediaId,
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        mediaService.deleteMedia(mediaId, principal.getId());
        return ResponseEntity.ok(ApiResponse.ok(new SimpleMessageResponse("Đã xóa tệp tin đa phương tiện thành công.")));
    }
}
