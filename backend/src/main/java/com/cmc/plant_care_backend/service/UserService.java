package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.common.exception.ResourceNotFoundException;
import com.cmc.plant_care_backend.common.exception.ValidationException;
import com.cmc.plant_care_backend.dto.user.ChangePasswordRequest;
import com.cmc.plant_care_backend.dto.user.UpdateProfileRequest;
import com.cmc.plant_care_backend.dto.user.UserProfileResponse;
import com.cmc.plant_care_backend.model.Role;
import com.cmc.plant_care_backend.model.User;
import com.cmc.plant_care_backend.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public UserService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional(readOnly = true)
    public UserProfileResponse getCurrentUser(UUID userId) {
        User user = userRepository.findByIdWithRoles(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Người dùng", userId));

        return mapToProfileResponse(user);
    }

    @Transactional
    public UserProfileResponse updateCurrentUser(UUID userId, UpdateProfileRequest req) {
        User user = userRepository.findByIdWithRoles(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Người dùng", userId));

        if (req.getFullName() != null && !req.getFullName().trim().isEmpty()) {
            user.setFullName(req.getFullName().trim());
        }
        if (req.getRecoveryEmail() != null) {
            user.setRecoveryEmail(req.getRecoveryEmail().trim());
        }
        if (req.getPreferredDevice() != null) {
            user.setPreferredDevice(req.getPreferredDevice());
        }
        if (req.getAvatarUrl() != null) {
            user.setAvatarUrl(req.getAvatarUrl().trim());
        }

        User updated = userRepository.save(user);
        return mapToProfileResponse(updated);
    }

    @Transactional
    public void changePassword(UUID userId, ChangePasswordRequest req) {
        if (!req.getNewPassword().equals(req.getConfirmPassword())) {
            throw new ValidationException("Mật khẩu mới và xác nhận mật khẩu không khớp.", "confirmPassword");
        }

        User user = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Người dùng", userId));

        if (!passwordEncoder.matches(req.getCurrentPassword(), user.getPasswordHash())) {
            throw new ValidationException("Mật khẩu hiện tại không chính xác.", "currentPassword");
        }

        if (passwordEncoder.matches(req.getNewPassword(), user.getPasswordHash())) {
            throw new ValidationException("Mật khẩu mới không được trùng với mật khẩu cũ.", "newPassword");
        }

        user.setPasswordHash(passwordEncoder.encode(req.getNewPassword()));
        userRepository.save(user);
    }

    private UserProfileResponse mapToProfileResponse(User user) {
        UserProfileResponse res = new UserProfileResponse();
        res.setId(user.getId());
        res.setFullName(user.getFullName());
        res.setEmail(user.getEmail());
        res.setPhoneNumber(user.getPhoneNumber());
        res.setRecoveryEmail(user.getRecoveryEmail());
        res.setPreferredDevice(user.getPreferredDevice());
        res.setStatus(user.getStatus());
        res.setAvatarUrl(user.getAvatarUrl());
        res.setRoles(user.getRoles().stream().map(Role::getName).collect(Collectors.toList()));
        res.setCreatedAt(user.getCreatedAt());
        return res;
    }
}
