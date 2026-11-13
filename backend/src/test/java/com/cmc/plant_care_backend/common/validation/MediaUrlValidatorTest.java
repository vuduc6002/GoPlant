package com.cmc.plant_care_backend.common.validation;

import com.cmc.plant_care_backend.common.exception.ValidationException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class MediaUrlValidatorTest {

    private final MediaUrlValidator validator = new MediaUrlValidator("https");

    @Test
    @DisplayName("Valid public HTTPS URLs should pass validation")
    void validPublicHttpsUrls_ShouldPass() {
        assertDoesNotThrow(() -> validator.validate("https://images.unsplash.com/photo-1545241047-6083a3684587", "imageUrl"));
        assertDoesNotThrow(() -> validator.validate("https://cdn.example.com/plants/monstera.webp", "imageUrl"));
        assertDoesNotThrow(() -> validator.validate("https://storage.goplant.vn/public/leaf.png?v=1#detail", "imageUrl"));
    }

    @Test
    @DisplayName("Null or empty URLs should be silently ignored as optional")
    void nullOrEmpty_ShouldPass() {
        assertDoesNotThrow(() -> validator.validate(null, "imageUrl"));
        assertDoesNotThrow(() -> validator.validate("", "imageUrl"));
        assertDoesNotThrow(() -> validator.validate("   ", "imageUrl"));
        assertDoesNotThrow(() -> validator.validateAll(null, "imageUrls"));
        assertDoesNotThrow(() -> validator.validateAll(List.of(), "imageUrls"));
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "http://example.com/image.jpg",
        "ftp://example.com/image.jpg",
        "file:///etc/passwd",
        "file://c:/windows/system32/cmd.exe",
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA",
        "javascript:alert(1)",
        "content://media/external/images/media/1",
        "blob:https://example.com/uuid"
    })
    @DisplayName("Invalid or dangerous URL schemes should be rejected")
    void dangerousSchemes_ShouldThrow(String url) {
        ValidationException ex = assertThrows(ValidationException.class, () -> validator.validate(url, "imageUrl"));
        assertEquals("imageUrl", ex.getField());
    }

    @Test
    @DisplayName("URLs with credentials/userinfo should be rejected")
    void userinfoInUrl_ShouldThrow() {
        ValidationException ex = assertThrows(ValidationException.class,
            () -> validator.validate("https://user:password@example.com/pic.jpg", "imageUrl"));
        assertEquals("imageUrl", ex.getField());
        assertTrue(ex.getMessage().contains("thông tin đăng nhập"));
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "https://localhost/pic.jpg",
        "https://localhost:8080/pic.jpg",
        "https://server.local/pic.jpg",
        "https://app.internal/pic.jpg",
        "https://router.lan/pic.jpg",
        "https://domain.corp/pic.jpg",
        "https://gateway.home/pic.jpg"
    })
    @DisplayName("Internal and local hostnames should be rejected")
    void internalHostnames_ShouldThrow(String url) {
        ValidationException ex = assertThrows(ValidationException.class, () -> validator.validate(url, "imageUrl"));
        assertEquals("imageUrl", ex.getField());
        assertTrue(ex.getMessage().contains("nội bộ"));
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "https://127.0.0.1/pic.jpg",
        "https://127.0.0.2:8443/pic.jpg",
        "https://10.0.0.1/pic.jpg",
        "https://10.254.254.254/pic.jpg",
        "https://172.16.0.1/pic.jpg",
        "https://172.31.255.255/pic.jpg",
        "https://192.168.1.1/pic.jpg",
        "https://169.254.169.254/latest/meta-data/",
        "https://0.0.0.0/pic.jpg",
        "https://224.0.0.1/pic.jpg",
        "https://240.0.0.1/pic.jpg"
    })
    @DisplayName("IPv4 private, loopback, link-local, and multicast literals should be rejected")
    void ipv4PrivateAndLoopback_ShouldThrow(String url) {
        ValidationException ex = assertThrows(ValidationException.class, () -> validator.validate(url, "imageUrl"));
        assertEquals("imageUrl", ex.getField());
        assertTrue(ex.getMessage().contains("riêng tư") || ex.getMessage().contains("bảo lưu"));
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "https://[::1]/pic.jpg",
        "https://[::]/pic.jpg",
        "https://[fe80::1]/pic.jpg",
        "https://[fc00::1]/pic.jpg",
        "https://[fd12:3456:789a::1]/pic.jpg",
        "https://[ff02::1]/pic.jpg",
        "https://[::ffff:127.0.0.1]/pic.jpg",
        "https://[::ffff:192.168.1.1]/pic.jpg"
    })
    @DisplayName("IPv6 loopback, site-local, link-local, multicast, and IPv4-mapped should be rejected")
    void ipv6PrivateAndLoopback_ShouldThrow(String url) {
        ValidationException ex = assertThrows(ValidationException.class, () -> validator.validate(url, "imageUrl"));
        assertEquals("imageUrl", ex.getField());
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "https://2130706433/pic.jpg",
        "https://0x7f000001/pic.jpg",
        "https://017700000001/pic.jpg",
        "https://127.1/pic.jpg",
        "https://127.0.1/pic.jpg",
        "https://0x7f.1/pic.jpg",
        "https://0x7f.0x1/pic.jpg",
        "https://0177.1/pic.jpg",
        "https://0177.0.0.1/pic.jpg",
        "https://0x7f.0.0.1/pic.jpg",
        "https://127.00.00.01/pic.jpg"
    })
    @DisplayName("Obfuscated decimal, hex, octal, or short IP host formats should be rejected")
    void obfuscatedHosts_ShouldThrow(String url) {
        ValidationException ex = assertThrows(ValidationException.class, () -> validator.validate(url, "imageUrl"));
        assertEquals("imageUrl", ex.getField());
    }

    @Test
    @DisplayName("validateAll should validate every URL in collection and report the offending index/field")
    void validateAll_ShouldValidateAllElements() {
        List<String> urls = List.of(
            "https://cdn.example.com/ok1.jpg",
            "http://insecure.example.com/ok2.jpg",
            "https://cdn.example.com/ok3.jpg"
        );
        ValidationException ex = assertThrows(ValidationException.class, () -> validator.validateAll(urls, "imageUrls"));
        assertEquals("imageUrls", ex.getField());
    }
}
