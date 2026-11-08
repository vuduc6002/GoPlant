package com.cmc.plant_care_backend.security;

import org.junit.jupiter.api.Test;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class JwtServiceTest {

    // 32 bytes (256 bits) test key
    private static final String VALID_SECRET_RAW = "12345678901234567890123456789012";
    private static final String VALID_SECRET_BASE64 = Base64.getEncoder().encodeToString(VALID_SECRET_RAW.getBytes(StandardCharsets.UTF_8));

    // Another valid 32-byte key for wrong signature test
    private static final String DIFFERENT_SECRET_RAW = "abcdefghijklmnopqrstuvwxyz123456";
    private static final String DIFFERENT_SECRET_BASE64 = Base64.getEncoder().encodeToString(DIFFERENT_SECRET_RAW.getBytes(StandardCharsets.UTF_8));

    private UserPrincipal createMockPrincipal(UUID userId, String email, String role) {
        return new UserPrincipal(
            userId,
            "Nguyen Van Test",
            email,
            "0912345678",
            "password_hash",
            com.cmc.plant_care_backend.model.enums.UserStatus.ACTIVE,
            List.of(new SimpleGrantedAuthority(role))
        );
    }

    @Test
    void constructor_WhenSecretNullOrEmpty_ShouldThrowIllegalStateException() {
        assertThrows(IllegalStateException.class, () -> new JwtService(null, 86400000));
        assertThrows(IllegalStateException.class, () -> new JwtService("", 86400000));
        assertThrows(IllegalStateException.class, () -> new JwtService("   ", 86400000));
    }

    @Test
    void constructor_WhenSecretInvalidBase64_ShouldThrowIllegalArgumentException() {
        assertThrows(IllegalArgumentException.class, () -> new JwtService("not_valid_base64!@#$%", 86400000));
    }

    @Test
    void constructor_WhenSecretShorterThan256Bits_ShouldThrowIllegalArgumentException() {
        // 16 bytes = 128 bits (too short)
        String shortSecretBase64 = Base64.getEncoder().encodeToString("short_16_bytes!!".getBytes(StandardCharsets.UTF_8));
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> new JwtService(shortSecretBase64, 86400000));
        assertTrue(ex.getMessage().contains("at least 256 bits"));
    }

    @Test
    void constructor_WhenExpirationZeroOrNegative_ShouldThrowIllegalArgumentException() {
        assertThrows(IllegalArgumentException.class, () -> new JwtService(VALID_SECRET_BASE64, 0));
        assertThrows(IllegalArgumentException.class, () -> new JwtService(VALID_SECRET_BASE64, -1000));
    }

    @Test
    void generateAndValidateToken_WhenValid_ShouldSucceed() {
        JwtService jwtService = new JwtService(VALID_SECRET_BASE64, 3600000);
        UUID userId = UUID.randomUUID();
        UserPrincipal principal = createMockPrincipal(userId, "test@goplant.com", "ROLE_USER");

        String token = jwtService.generateToken(principal);
        assertNotNull(token);
        assertTrue(token.split("\\.").length == 3);

        assertTrue(jwtService.validateToken(token));
        assertEquals(userId, jwtService.extractUserId(token));
        List<String> roles = jwtService.extractRoles(token);
        assertEquals(1, roles.size());
        assertEquals("ROLE_USER", roles.get(0));
    }

    @Test
    void validateToken_WhenSignedWithDifferentSecret_ShouldReturnFalse() {
        JwtService signer = new JwtService(VALID_SECRET_BASE64, 3600000);
        JwtService verifier = new JwtService(DIFFERENT_SECRET_BASE64, 3600000);

        UUID userId = UUID.randomUUID();
        UserPrincipal principal = createMockPrincipal(userId, "test@goplant.com", "ROLE_USER");
        String token = signer.generateToken(principal);

        assertFalse(verifier.validateToken(token));
    }

    @Test
    void validateToken_WhenTokenExpired_ShouldReturnFalse() throws InterruptedException {
        // Expiration in 1 millisecond
        JwtService jwtService = new JwtService(VALID_SECRET_BASE64, 1);
        UUID userId = UUID.randomUUID();
        UserPrincipal principal = createMockPrincipal(userId, "test@goplant.com", "ROLE_USER");
        String token = jwtService.generateToken(principal);

        // Sleep to ensure expiration
        Thread.sleep(50);

        assertFalse(jwtService.validateToken(token));
    }

    @Test
    void validateToken_WhenTokenMalformed_ShouldReturnFalse() {
        JwtService jwtService = new JwtService(VALID_SECRET_BASE64, 3600000);

        assertFalse(jwtService.validateToken(null));
        assertFalse(jwtService.validateToken(""));
        assertFalse(jwtService.validateToken("not.a.valid.jwt.token"));
        assertNull(jwtService.extractUserId("invalid_token"));
        assertTrue(jwtService.extractRoles("invalid_token").isEmpty());
    }
}
