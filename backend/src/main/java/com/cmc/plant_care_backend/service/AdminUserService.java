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
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@Transactional
public class AdminUserService {

    private static final Set<String> ALLOWED_SORT_PROPERTIES = Set.of(
        "createdAt", "email", "fullName", "status", "updatedAt"
    );

    private final UserRepository userRepository;

    public AdminUserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public PageResponse<AdminUserItemResponse> getUsers(
        String keyword,
        UserStatus status,
        String role,
        int page,
        int size,
        String sortParam
    ) {
        Sort sort = resolveSort(sortParam);
        Pageable pageable = PageRequest.of(Math.max(page, 0), size > 0 ? size : 20, sort);

        Specification<User> spec = (root, query, cb) -> {
            query.distinct(true);
            List<Predicate> predicates = new ArrayList<>();

            if (keyword != null && !keyword.trim().isEmpty()) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                    cb.like(cb.lower(root.get("email")), pattern),
                    cb.like(cb.lower(root.get("fullName")), pattern)
                ));
            }

            if (status != null) {
                predicates.add(cb.equal(root.get("status"), status));
            }

            if (role != null && !role.trim().isEmpty()) {
                Join<User, Role> roleJoin = root.join("roles", JoinType.INNER);
                predicates.add(cb.equal(roleJoin.get("name"), role.trim()));
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };

        Page<User> userPage = userRepository.findAll(spec, pageable);
        Page<AdminUserItemResponse> dtoPage = userPage.map(this::mapToItemResponse);
        return PageResponse.from(dtoPage);
    }

    @Transactional(readOnly = true)
    public AdminUserDetailResponse getUserDetail(UUID userId) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Người dùng", userId));

        AdminUserDetailResponse res = new AdminUserDetailResponse();
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
        res.setUpdatedAt(user.getUpdatedAt());
        return res;
    }

    public AdminUserStatusResponse updateUserStatus(UUID userId, UpdateUserStatusRequest request) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Người dùng", userId));

        user.setStatus(request.getStatus());
        user = userRepository.save(user);

        return new AdminUserStatusResponse(
            user.getId(),
            user.getStatus(),
            "Trạng thái người dùng đã được cập nhật thành công"
        );
    }

    private AdminUserItemResponse mapToItemResponse(User user) {
        AdminUserItemResponse res = new AdminUserItemResponse();
        res.setId(user.getId());
        res.setFullName(user.getFullName());
        res.setEmail(user.getEmail());
        res.setPhoneNumber(user.getPhoneNumber());
        res.setStatus(user.getStatus());
        res.setRoles(user.getRoles().stream().map(Role::getName).collect(Collectors.toList()));
        res.setCreatedAt(user.getCreatedAt());
        return res;
    }

    private Sort resolveSort(String sortParam) {
        if (sortParam == null || sortParam.trim().isEmpty()) {
            return Sort.by(Sort.Direction.DESC, "createdAt");
        }

        String[] parts = sortParam.split(",");
        String prop = parts[0].trim();
        if (!ALLOWED_SORT_PROPERTIES.contains(prop)) {
            prop = "createdAt";
        }

        Sort.Direction direction = (parts.length > 1 && parts[1].trim().equalsIgnoreCase("asc"))
            ? Sort.Direction.ASC
            : Sort.Direction.DESC;

        return Sort.by(direction, prop);
    }
}
