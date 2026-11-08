package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.common.exception.ConflictException;
import com.cmc.plant_care_backend.common.exception.ForbiddenException;
import com.cmc.plant_care_backend.common.exception.UnauthorizedException;
import com.cmc.plant_care_backend.common.exception.ValidationException;
import com.cmc.plant_care_backend.dto.auth.LoginRequest;
import com.cmc.plant_care_backend.dto.auth.LoginResponse;
import com.cmc.plant_care_backend.dto.auth.RegisterRequest;
import com.cmc.plant_care_backend.dto.auth.RegisterResponse;
import com.cmc.plant_care_backend.model.Role;
import com.cmc.plant_care_backend.model.User;
import com.cmc.plant_care_backend.model.enums.UserStatus;
import com.cmc.plant_care_backend.repository.RoleRepository;
import com.cmc.plant_care_backend.repository.UserRepository;
import com.cmc.plant_care_backend.security.JwtService;
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
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private RoleRepository roleRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtService jwtService;

    @InjectMocks
    private AuthService authService;

    private Role userRole;

    @BeforeEach
    void setUp() {
        userRole = new Role("ROLE_USER");
        userRole.setId(UUID.randomUUID());
    }

    @Test
    void register_WithValidEmail_ShouldSucceed() {
        RegisterRequest req = new RegisterRequest();
        req.setFullName("Nguyen Van A");
        req.setAccount("test@goplant.com");
        req.setPassword("Password123!");

        when(userRepository.existsByEmail("test@goplant.com")).thenReturn(false);
        when(passwordEncoder.encode(anyString())).thenReturn("hashed_password");
        when(roleRepository.findByName("ROLE_USER")).thenReturn(Optional.of(userRole));
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> {
            User u = invocation.getArgument(0);
            u.setId(UUID.randomUUID());
            return u;
        });

        RegisterResponse res = authService.register(req);

        assertNotNull(res);
        assertNotNull(res.getUserId());
        assertEquals("Nguyen Van A", res.getFullName());
        verify(userRepository).save(any(User.class));
    }

    @Test
    void register_WithDuplicateEmail_ShouldThrowConflict() {
        RegisterRequest req = new RegisterRequest();
        req.setFullName("Nguyen Van A");
        req.setAccount("existing@goplant.com");
        req.setPassword("Password123!");

        when(userRepository.existsByEmail("existing@goplant.com")).thenReturn(true);

        assertThrows(ConflictException.class, () -> authService.register(req));
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void register_WithInvalidAccountFormat_ShouldThrowValidation() {
        RegisterRequest req = new RegisterRequest();
        req.setFullName("Nguyen Van A");
        req.setAccount("invalid_account_format");
        req.setPassword("Password123!");

        assertThrows(ValidationException.class, () -> authService.register(req));
    }

    @Test
    void login_WithValidCredentials_ShouldReturnJwt() {
        LoginRequest req = new LoginRequest("test@goplant.com", "Password123!");

        User user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail("test@goplant.com");
        user.setFullName("Nguyen Van A");
        user.setPasswordHash("hashed_password");
        user.setStatus(UserStatus.ACTIVE);
        user.getRoles().add(userRole);

        when(userRepository.findByEmailOrPhoneNumberWithRoles("test@goplant.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("Password123!", "hashed_password")).thenReturn(true);
        when(jwtService.generateToken(any())).thenReturn("mock.jwt.token");
        when(jwtService.getExpirationInSeconds()).thenReturn(86400L);

        LoginResponse res = authService.login(req);

        assertNotNull(res);
        assertEquals("mock.jwt.token", res.getAccessToken());
        assertEquals("Bearer", res.getTokenType());
        assertEquals(86400L, res.getExpiresIn());
        assertNotNull(res.getUser());
        assertEquals("test@goplant.com", res.getUser().getEmail());
    }

    @Test
    void login_WithWrongPassword_ShouldThrowUnauthorized() {
        LoginRequest req = new LoginRequest("test@goplant.com", "WrongPassword!");

        User user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail("test@goplant.com");
        user.setPasswordHash("hashed_password");
        user.setStatus(UserStatus.ACTIVE);

        when(userRepository.findByEmailOrPhoneNumberWithRoles("test@goplant.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("WrongPassword!", "hashed_password")).thenReturn(false);

        assertThrows(UnauthorizedException.class, () -> authService.login(req));
    }

    @Test
    void login_WithBannedUser_ShouldThrowForbidden() {
        LoginRequest req = new LoginRequest("banned@goplant.com", "Password123!");

        User user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail("banned@goplant.com");
        user.setStatus(UserStatus.BANNED);

        when(userRepository.findByEmailOrPhoneNumberWithRoles("banned@goplant.com")).thenReturn(Optional.of(user));

        assertThrows(ForbiddenException.class, () -> authService.login(req));
    }
}
