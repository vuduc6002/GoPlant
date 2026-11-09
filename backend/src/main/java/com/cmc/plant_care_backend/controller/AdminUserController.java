package com.cmc.plant_care_backend.controller;

import com.cmc.plant_care_backend.common.response.ApiResponse;
import com.cmc.plant_care_backend.common.response.PageResponse;
import com.cmc.plant_care_backend.dto.admin.AdminUserDetailResponse;
import com.cmc.plant_care_backend.dto.admin.AdminUserItemResponse;
import com.cmc.plant_care_backend.dto.admin.AdminUserStatusResponse;
import com.cmc.plant_care_backend.dto.admin.UpdateUserStatusRequest;
import com.cmc.plant_care_backend.model.enums.UserStatus;
import com.cmc.plant_care_backend.service.AdminUserService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/users")
@PreAuthorize("hasAuthority('ROLE_ADMIN')")
public class AdminUserController {

    private final AdminUserService adminUserService;

    public AdminUserController(AdminUserService adminUserService) {
        this.adminUserService = adminUserService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<PageResponse<AdminUserItemResponse>>> getUsers(
        @RequestParam(required = false) String keyword,
        @RequestParam(required = false) UserStatus status,
        @RequestParam(required = false) String role,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size,
        @RequestParam(defaultValue = "createdAt,desc") String sort
    ) {
        PageResponse<AdminUserItemResponse> data = adminUserService.getUsers(
            keyword, status, role, page, size, sort
        );
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @GetMapping("/{userId}")
    public ResponseEntity<ApiResponse<AdminUserDetailResponse>> getUserDetail(
        @PathVariable UUID userId
    ) {
        AdminUserDetailResponse data = adminUserService.getUserDetail(userId);
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @PatchMapping("/{userId}/status")
    public ResponseEntity<ApiResponse<AdminUserStatusResponse>> updateUserStatus(
        @PathVariable UUID userId,
        @Valid @RequestBody UpdateUserStatusRequest request
    ) {
        AdminUserStatusResponse data = adminUserService.updateUserStatus(userId, request);
        return ResponseEntity.ok(ApiResponse.ok(data));
    }
}
