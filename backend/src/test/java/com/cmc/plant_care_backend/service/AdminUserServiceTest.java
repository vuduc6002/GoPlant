package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.common.exception.ResourceNotFoundException;
import com.cmc.plant_care_backend.common.response.PageResponse;
import com.cmc.plant_care_backend.dto.admin.AdminUserDetailResponse;
import com.cmc.plant_care_backend.dto.admin.AdminUserItemResponse;
import com.cmc.plant_care_backend.dto.admin.AdminUserStatusResponse;
import com.cmc.plant_care_backend.dto.admin.UpdateUserStatusRequest;
import com.cmc.plant_care_backend.model.Role;
import com.cmc.plant_care_backend.model.User;
import com.cmc.plant_care_backend.model.enums.UserStatus;
import com.cmc.plant_care_backend.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AdminUserServiceTest {

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private AdminUserService adminUserService;

    private UUID userId;
    private User user;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
        user = new User();
        user.setId(userId);
        user.setFullName("Nguyen Van A");
        user.setEmail("a@example.com");
        user.setStatus(UserStatus.ACTIVE);
        user.setRoles(Set.of(new Role("ROLE_USER")));
    }

    @Test
    void getUsers_WithFilters_ReturnsPage() {
        when(userRepository.findAll(any(Specification.class), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(user)));

        PageResponse<AdminUserItemResponse> res = adminUserService.getUsers(
            "Nguyen", UserStatus.ACTIVE, "ROLE_USER", 0, 10, "createdAt,desc"
        );

        assertNotNull(res);
        assertEquals(1, res.getContent().size());
        assertEquals("Nguyen Van A", res.getContent().get(0).getFullName());
        assertEquals(UserStatus.ACTIVE, res.getContent().get(0).getStatus());
        assertTrue(res.getContent().get(0).getRoles().contains("ROLE_USER"));
    }

    @Test
    void getUserDetail_Success() {
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        AdminUserDetailResponse res = adminUserService.getUserDetail(userId);

        assertNotNull(res);
        assertEquals(userId, res.getId());
        assertEquals("Nguyen Van A", res.getFullName());
    }

    @Test
    void getUserDetail_NotFound_ThrowsResourceNotFound() {
        UUID nonExistent = UUID.randomUUID();
        when(userRepository.findById(nonExistent)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () ->
            adminUserService.getUserDetail(nonExistent));
    }

    @Test
    void updateUserStatus_Success() {
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userRepository.save(any(User.class))).thenAnswer(i -> i.getArgument(0));

        UpdateUserStatusRequest req = new UpdateUserStatusRequest();
        req.setStatus(UserStatus.BANNED);

        AdminUserStatusResponse res = adminUserService.updateUserStatus(userId, req);

        assertNotNull(res);
        assertEquals(UserStatus.BANNED, res.getNewStatus());
        assertEquals(UserStatus.BANNED, user.getStatus());
    }
}
