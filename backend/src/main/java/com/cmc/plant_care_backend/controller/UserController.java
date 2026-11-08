package com.cmc.plant_care_backend.controller;

import com.cmc.plant_care_backend.common.response.ApiResponse;
import com.cmc.plant_care_backend.dto.common.SimpleMessageResponse;
import com.cmc.plant_care_backend.dto.user.ChangePasswordRequest;
import com.cmc.plant_care_backend.dto.user.UpdateProfileRequest;
import com.cmc.plant_care_backend.dto.user.UserProfileResponse;
import com.cmc.plant_care_backend.security.UserPrincipal;
import com.cmc.plant_care_backend.service.UserService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<UserProfileResponse>> getCurrentUser(
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        UserProfileResponse profile = userService.getCurrentUser(principal.getId());
        return ResponseEntity.ok(ApiResponse.ok(profile));
    }

    @PutMapping("/me")
    public ResponseEntity<ApiResponse<UserProfileResponse>> updateProfile(
        @AuthenticationPrincipal UserPrincipal principal,
        @Valid @RequestBody UpdateProfileRequest request
    ) {
        UserProfileResponse updated = userService.updateCurrentUser(principal.getId(), request);
        return ResponseEntity.ok(ApiResponse.ok(updated));
    }

    @PutMapping("/me/password")
    public ResponseEntity<ApiResponse<SimpleMessageResponse>> changePassword(
        @AuthenticationPrincipal UserPrincipal principal,
        @Valid @RequestBody ChangePasswordRequest request
    ) {
        userService.changePassword(principal.getId(), request);
        return ResponseEntity.ok(ApiResponse.ok(new SimpleMessageResponse("Mật khẩu đã được cập nhật.")));
    }
}
