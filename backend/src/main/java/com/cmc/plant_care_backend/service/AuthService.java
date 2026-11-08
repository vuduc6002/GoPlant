package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.common.exception.ConflictException;
import com.cmc.plant_care_backend.common.exception.ForbiddenException;
import com.cmc.plant_care_backend.common.exception.UnauthorizedException;
import com.cmc.plant_care_backend.common.exception.ValidationException;
import com.cmc.plant_care_backend.dto.auth.*;
import com.cmc.plant_care_backend.model.Role;
import com.cmc.plant_care_backend.model.User;
import com.cmc.plant_care_backend.model.enums.UserStatus;
import com.cmc.plant_care_backend.repository.RoleRepository;
import com.cmc.plant_care_backend.repository.UserRepository;
import com.cmc.plant_care_backend.security.JwtService;
import com.cmc.plant_care_backend.security.UserPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class AuthService {

    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[A-Za-z0-9+_.-]+@(.+)$");
    private static final Pattern PHONE_PATTERN = Pattern.compile("^(\\+?[0-9]{9,15})$");

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(
        UserRepository userRepository,
        RoleRepository roleRepository,
        PasswordEncoder passwordEncoder,
        JwtService jwtService
    ) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @Transactional
    public RegisterResponse register(RegisterRequest req) {
        String account = req.getAccount().trim();
        boolean isEmail = EMAIL_PATTERN.matcher(account).matches();
        boolean isPhone = PHONE_PATTERN.matcher(account).matches();

        if (!isEmail && !isPhone) {
            throw new ValidationException("Tài khoản phải là định dạng email hoặc số điện thoại hợp lệ", "account");
        }

        if (isEmail && userRepository.existsByEmail(account)) {
            throw new ConflictException("Email này đã được sử dụng bởi một tài khoản khác.", "account");
        }
        if (isPhone && userRepository.existsByPhoneNumber(account)) {
            throw new ConflictException("Số điện thoại này đã được sử dụng bởi một tài khoản khác.", "account");
        }

        User user = new User();
        user.setFullName(req.getFullName().trim());
        if (isEmail) {
            user.setEmail(account);
        } else {
            user.setPhoneNumber(account);
        }

        if (req.getRecoveryEmail() != null && !req.getRecoveryEmail().trim().isEmpty()) {
            user.setRecoveryEmail(req.getRecoveryEmail().trim());
        }

        user.setPasswordHash(passwordEncoder.encode(req.getPassword()));
        if (req.getPreferredDevice() != null) {
            user.setPreferredDevice(req.getPreferredDevice());
        }
        user.setStatus(UserStatus.ACTIVE);

        // Assign ROLE_USER
        Role userRole = roleRepository.findByName("ROLE_USER")
            .orElseGet(() -> roleRepository.save(new Role("ROLE_USER")));
        user.getRoles().add(userRole);

        User savedUser = userRepository.save(user);

        return new RegisterResponse(
            savedUser.getId(),
            savedUser.getFullName(),
            "Đăng ký tài khoản thành công."
        );
    }

    @Transactional(readOnly = true)
    public LoginResponse login(LoginRequest req) {
        String account = req.getAccount().trim();

        User user = userRepository.findByEmailOrPhoneNumberWithRoles(account)
            .orElseThrow(() -> new UnauthorizedException("Tài khoản hoặc mật khẩu không chính xác."));

        if (user.getStatus() == UserStatus.BANNED) {
            throw new ForbiddenException("Tài khoản của bạn đã bị khóa.");
        }
        if (user.getStatus() == UserStatus.INACTIVE) {
            throw new ForbiddenException("Tài khoản chưa được kích hoạt.");
        }

        if (!passwordEncoder.matches(req.getPassword(), user.getPasswordHash())) {
            throw new UnauthorizedException("Tài khoản hoặc mật khẩu không chính xác.");
        }

        UserPrincipal principal = UserPrincipal.create(user);
        String token = jwtService.generateToken(principal);

        List<String> roleNames = user.getRoles().stream()
            .map(Role::getName)
            .collect(Collectors.toList());

        UserSummaryDto userSummary = new UserSummaryDto(
            user.getId(),
            user.getFullName(),
            user.getEmail(),
            roleNames
        );

        return new LoginResponse(
            token,
            "Bearer",
            jwtService.getExpirationInSeconds(),
            userSummary
        );
    }
}
