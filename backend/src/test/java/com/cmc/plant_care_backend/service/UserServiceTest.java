package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.common.exception.ResourceNotFoundException;
import com.cmc.plant_care_backend.common.exception.ValidationException;
import com.cmc.plant_care_backend.dto.user.ChangePasswordRequest;
import com.cmc.plant_care_backend.dto.user.UpdateProfileRequest;
import com.cmc.plant_care_backend.dto.user.UserProfileResponse;
import com.cmc.plant_care_backend.model.Role;
import com.cmc.plant_care_backend.model.User;
import com.cmc.plant_care_backend.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @InjectMocks
    private UserService userService;

    private UUID userId;
    private User testUser;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
        testUser = new User();
        testUser.setId(userId);
        testUser.setFullName("Nguyen Van A");
        testUser.setEmail("a@goplant.com");
        testUser.setPasswordHash("encoded_old_pw");
        testUser.getRoles().add(new Role("ROLE_USER"));
    }

    @Test
    void getCurrentUser_WhenExists_ShouldReturnProfile() {
        when(userRepository.findByIdWithRoles(userId)).thenReturn(Optional.of(testUser));

        UserProfileResponse res = userService.getCurrentUser(userId);

        assertNotNull(res);
        assertEquals(userId, res.getId());
        assertEquals("Nguyen Van A", res.getFullName());
    }

    @Test
    void updateCurrentUser_WhenValid_ShouldUpdateAndReturn() {
        when(userRepository.findByIdWithRoles(userId)).thenReturn(Optional.of(testUser));
        when(userRepository.save(any(User.class))).thenReturn(testUser);

        UpdateProfileRequest req = new UpdateProfileRequest();
        req.setFullName("Nguyen Van B");

        UserProfileResponse res = userService.updateCurrentUser(userId, req);

        assertNotNull(res);
        assertEquals("Nguyen Van B", testUser.getFullName());
        verify(userRepository).save(testUser);
    }

    @Test
    void changePassword_WhenValid_ShouldSucceed() {
        ChangePasswordRequest req = new ChangePasswordRequest("old_pw", "new_password_123", "new_password_123");

        when(userRepository.findById(userId)).thenReturn(Optional.of(testUser));
        when(passwordEncoder.matches("old_pw", "encoded_old_pw")).thenReturn(true);
        when(passwordEncoder.matches("new_password_123", "encoded_old_pw")).thenReturn(false);
        when(passwordEncoder.encode("new_password_123")).thenReturn("encoded_new_pw");

        userService.changePassword(userId, req);

        assertEquals("encoded_new_pw", testUser.getPasswordHash());
        verify(userRepository).save(testUser);
    }

    @Test
    void changePassword_MismatchConfirm_ShouldThrowValidation() {
        ChangePasswordRequest req = new ChangePasswordRequest("old_pw", "new_password_123", "mismatch_password");

        assertThrows(ValidationException.class, () -> userService.changePassword(userId, req));
        verify(userRepository, never()).save(any());
    }

    @Test
    void changePassword_WrongCurrentPassword_ShouldThrowValidation() {
        ChangePasswordRequest req = new ChangePasswordRequest("wrong_old", "new_password_123", "new_password_123");

        when(userRepository.findById(userId)).thenReturn(Optional.of(testUser));
        when(passwordEncoder.matches("wrong_old", "encoded_old_pw")).thenReturn(false);

        assertThrows(ValidationException.class, () -> userService.changePassword(userId, req));
        verify(userRepository, never()).save(any());
    }
}
