package com.cmc.plant_care_backend.service.storage;

import com.cmc.plant_care_backend.common.exception.StorageUnavailableException;
import com.cmc.plant_care_backend.config.SupabaseStorageProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class SupabaseStorageGatewayTest {

    private static final String VALID_SERVICE_ROLE_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
        + Base64.getUrlEncoder().withoutPadding().encodeToString("{\"role\":\"service_role\",\"iss\":\"supabase\"}".getBytes(StandardCharsets.UTF_8))
        + ".signature123";

    private static final String ANON_ROLE_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
        + Base64.getUrlEncoder().withoutPadding().encodeToString("{\"role\":\"anon\",\"iss\":\"supabase\"}".getBytes(StandardCharsets.UTF_8))
        + ".signature123";

    private static final String AUTHENTICATED_ROLE_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
        + Base64.getUrlEncoder().withoutPadding().encodeToString("{\"role\":\"authenticated\",\"iss\":\"supabase\"}".getBytes(StandardCharsets.UTF_8))
        + ".signature123";

    private static final String SECRET_KEY = "sb_secret_prod_key_78901234";

    private SupabaseStorageProperties properties;
    private MockRestServiceServer mockServer;
    private SupabaseStorageGateway gateway;

    @BeforeEach
    void setUp() {
        properties = new SupabaseStorageProperties(
            "https://xyzcompany.supabase.co",
            VALID_SERVICE_ROLE_JWT,
            "goplant-private-media",
            5242880L,
            300
        );

        RestClient.Builder builder = RestClient.builder();
        mockServer = MockRestServiceServer.bindTo(builder).build();
        gateway = new SupabaseStorageGateway(properties, builder, false);
    }

    @Test
    @DisplayName("isConfigured returns true when URL, serviceKey, and bucket are present")
    void isConfigured_True() {
        assertTrue(gateway.isConfigured());
    }

    @Test
    @DisplayName("isConfigured returns false when properties are blank")
    void isConfigured_False() {
        SupabaseStorageProperties emptyProps = new SupabaseStorageProperties("", "", "goplant-private-media", 5242880L, 300);
        SupabaseStorageGateway emptyGateway = new SupabaseStorageGateway(emptyProps);
        assertFalse(emptyGateway.isConfigured());
    }

    @Test
    @DisplayName("Secret key (sb_secret_...) sends only apikey header and NO Authorization Bearer header")
    void secretKey_SendsOnlyApiKeyHeader() {
        SupabaseStorageProperties secretProps = new SupabaseStorageProperties(
            "https://xyzcompany.supabase.co",
            SECRET_KEY,
            "goplant-private-media",
            5242880L,
            300
        );
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer secretMock = MockRestServiceServer.bindTo(builder).build();
        SupabaseStorageGateway secretGateway = new SupabaseStorageGateway(secretProps, builder, false);

        byte[] payload = new byte[] { 9, 8, 7 };
        secretMock.expect(requestTo("https://xyzcompany.supabase.co/storage/v1/object/goplant-private-media/secret-test.jpg"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header("apikey", SECRET_KEY))
            .andExpect(headerDoesNotExist("Authorization"))
            .andExpect(header("x-upsert", "false"))
            .andExpect(header("Content-Type", "image/jpeg"))
            .andExpect(content().bytes(payload))
            .andRespond(withSuccess("{\"Key\":\"goplant-private-media/secret-test.jpg\"}", MediaType.APPLICATION_JSON));

        assertDoesNotThrow(() -> secretGateway.upload("goplant-private-media", "secret-test.jpg", payload, "image/jpeg"));
        secretMock.verify();
    }

    @Test
    @DisplayName("Secret key signed URL request omits Authorization header and normalizes trailing /storage/v1")
    void secretKey_SignedUrl_OmitsAuthorizationHeader() {
        SupabaseStorageProperties secretProps = new SupabaseStorageProperties(
            "https://xyzcompany.supabase.co/storage/v1/",
            SECRET_KEY,
            "goplant-private-media",
            5242880L,
            300
        );
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer secretMock = MockRestServiceServer.bindTo(builder).build();
        SupabaseStorageGateway secretGateway = new SupabaseStorageGateway(secretProps, builder, false);

        secretMock.expect(requestTo("https://xyzcompany.supabase.co/storage/v1/object/sign/goplant-private-media/secret-test.jpg"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header("apikey", SECRET_KEY))
            .andExpect(headerDoesNotExist("Authorization"))
            .andRespond(withSuccess("{\"signedURL\":\"/storage/v1/object/sign/goplant-private-media/secret-test.jpg?token=secrettoken\"}", MediaType.APPLICATION_JSON));

        String signedUrl = secretGateway.createSignedUrl("goplant-private-media", "secret-test.jpg", 300);
        assertEquals("https://xyzcompany.supabase.co/storage/v1/object/sign/goplant-private-media/secret-test.jpg?token=secrettoken", signedUrl);
        secretMock.verify();
    }

    @Test
    @DisplayName("Secret key delete request omits Authorization header")
    void secretKey_Delete_OmitsAuthorizationHeader() {
        SupabaseStorageProperties secretProps = new SupabaseStorageProperties(
            "https://xyzcompany.supabase.co",
            SECRET_KEY,
            "goplant-private-media",
            5242880L,
            300
        );
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer secretMock = MockRestServiceServer.bindTo(builder).build();
        SupabaseStorageGateway secretGateway = new SupabaseStorageGateway(secretProps, builder, false);

        secretMock.expect(requestTo("https://xyzcompany.supabase.co/storage/v1/object/goplant-private-media"))
            .andExpect(method(HttpMethod.DELETE))
            .andExpect(header("apikey", SECRET_KEY))
            .andExpect(headerDoesNotExist("Authorization"))
            .andRespond(withSuccess("[{\"name\":\"secret-test.jpg\"}]", MediaType.APPLICATION_JSON));

        assertDoesNotThrow(() -> secretGateway.delete("goplant-private-media", "secret-test.jpg"));
        secretMock.verify();
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "sb_publishable_anon_token_1234",
        "sb_anon_public_key_abcdef123"
    })
    @DisplayName("Publishable key (sb_publishable_... or sb_anon_...) throws IllegalStateException to prevent privilege leakage")
    void publishableKey_ThrowsIllegalStateException(String key) {
        assertThrows(IllegalStateException.class, () -> new SupabaseStorageProperties(
            "https://xyzcompany.supabase.co",
            key,
            "goplant-private-media",
            5242880L,
            300
        ));
    }

    @Test
    @DisplayName("Legacy JWT with role=anon throws IllegalStateException")
    void legacyJwt_AnonRole_Rejected() {
        assertThrows(IllegalStateException.class, () -> new SupabaseStorageProperties(
            "https://xyzcompany.supabase.co",
            ANON_ROLE_JWT,
            "goplant-private-media",
            5242880L,
            300
        ));
    }

    @Test
    @DisplayName("Legacy JWT with role=authenticated throws IllegalStateException")
    void legacyJwt_AuthenticatedRole_Rejected() {
        assertThrows(IllegalStateException.class, () -> new SupabaseStorageProperties(
            "https://xyzcompany.supabase.co",
            AUTHENTICATED_ROLE_JWT,
            "goplant-private-media",
            5242880L,
            300
        ));
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "not-a-jwt",
        "header.payload",
        "header.payload.signature.extra",
        "header.not-base64!@#.signature",
        "eyJhbGciOiJIUzI1NiJ9.eyJub19yb2xlIjoidGVzdCJ9.signature"
    })
    @DisplayName("Malformed JWT formats or missing role claim are rejected")
    void malformedJwt_Rejected(String malformedKey) {
        assertThrows(IllegalStateException.class, () -> new SupabaseStorageProperties(
            "https://xyzcompany.supabase.co",
            malformedKey,
            "goplant-private-media",
            5242880L,
            300
        ));
    }

    @Test
    @DisplayName("Incompatible configured key type throws IllegalStateException")
    void incompatibleConfig_ThrowsIllegalStateException() {
        // Configuring LEGACY_SERVICE_ROLE with an sb_secret_ key
        assertThrows(IllegalStateException.class, () -> new SupabaseStorageProperties(
            "https://xyzcompany.supabase.co",
            SECRET_KEY,
            "LEGACY_SERVICE_ROLE",
            "goplant-private-media",
            5242880L,
            300
        ));

        // Configuring SECRET with a legacy JWT service_role key
        assertThrows(IllegalStateException.class, () -> new SupabaseStorageProperties(
            "https://xyzcompany.supabase.co",
            VALID_SERVICE_ROLE_JWT,
            "SECRET",
            "goplant-private-media",
            5242880L,
            300
        ));
    }

    @Test
    @DisplayName("Invalid apiKeyTypeStr throws IllegalStateException")
    void invalidApiKeyTypeStr_ThrowsIllegalStateException() {
        assertThrows(IllegalStateException.class, () -> new SupabaseStorageProperties(
            "https://xyzcompany.supabase.co",
            SECRET_KEY,
            "INVALID_TYPE",
            "goplant-private-media",
            5242880L,
            300
        ));
    }

    @Test
    @DisplayName("Timeout configurations are clamped within safe ranges")
    void timeoutConfigurations_ClampedWithinSafeRange() {
        SupabaseStorageProperties timeoutProps = new SupabaseStorageProperties(
            "https://xyzcompany.supabase.co",
            SECRET_KEY,
            "AUTO",
            "goplant-private-media",
            5242880L,
            300,
            15_000,
            45_000
        );
        assertEquals(15_000, timeoutProps.getConnectTimeoutMs());
        assertEquals(45_000, timeoutProps.getReadTimeoutMs());

        SupabaseStorageGateway timeoutGateway = new SupabaseStorageGateway(timeoutProps);
        assertEquals(15_000, timeoutGateway.getConnectTimeoutMs());
        assertEquals(45_000, timeoutGateway.getReadTimeoutMs());

        // Extreme values clamped
        SupabaseStorageProperties clampedProps = new SupabaseStorageProperties(
            "https://xyzcompany.supabase.co",
            SECRET_KEY,
            "AUTO",
            "goplant-private-media",
            5242880L,
            300,
            -100,
            999_999
        );
        assertEquals(SupabaseStorageProperties.DEFAULT_CONNECT_TIMEOUT_MS, clampedProps.getConnectTimeoutMs());
        assertEquals(SupabaseStorageProperties.DEFAULT_READ_TIMEOUT_MS, clampedProps.getReadTimeoutMs());
    }

    @Test
    @DisplayName("Legacy service_role key sends both apikey and Authorization Bearer headers")
    void upload_LegacyKey_Success() {
        byte[] payload = new byte[] { 1, 2, 3, 4 };

        mockServer.expect(requestTo("https://xyzcompany.supabase.co/storage/v1/object/goplant-private-media/test-key.jpg"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header("apikey", VALID_SERVICE_ROLE_JWT))
            .andExpect(header("Authorization", "Bearer " + VALID_SERVICE_ROLE_JWT))
            .andExpect(header("x-upsert", "false"))
            .andExpect(header("Content-Type", "image/jpeg"))
            .andExpect(content().bytes(payload))
            .andRespond(withSuccess("{\"Key\":\"goplant-private-media/test-key.jpg\"}", MediaType.APPLICATION_JSON));

        assertDoesNotThrow(() -> gateway.upload("goplant-private-media", "test-key.jpg", payload, "image/jpeg"));
        mockServer.verify();
    }

    @Test
    @DisplayName("upload throws StorageUnavailableException on upstream 500 error without leaking credentials")
    void upload_UpstreamError_ThrowsStorageUnavailable() {
        byte[] payload = new byte[] { 1, 2, 3, 4 };

        mockServer.expect(requestTo("https://xyzcompany.supabase.co/storage/v1/object/goplant-private-media/test-key.jpg"))
            .andExpect(method(HttpMethod.POST))
            .andRespond(withServerError());

        StorageUnavailableException ex = assertThrows(StorageUnavailableException.class,
            () -> gateway.upload("goplant-private-media", "test-key.jpg", payload, "image/jpeg"));
        assertFalse(ex.getMessage().contains(VALID_SERVICE_ROLE_JWT));
    }

    @Test
    @DisplayName("upload throws StorageUnavailableException on upstream 401 or 403 error")
    void upload_AuthFailure_ThrowsStorageUnavailable() {
        byte[] payload = new byte[] { 1, 2, 3, 4 };

        mockServer.expect(requestTo("https://xyzcompany.supabase.co/storage/v1/object/goplant-private-media/test-key.jpg"))
            .andExpect(method(HttpMethod.POST))
            .andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        StorageUnavailableException ex = assertThrows(StorageUnavailableException.class,
            () -> gateway.upload("goplant-private-media", "test-key.jpg", payload, "image/jpeg"));
        assertFalse(ex.getMessage().contains(VALID_SERVICE_ROLE_JWT));
    }

    @Test
    @DisplayName("createSignedUrl returns fully-qualified HTTPS read URL")
    void createSignedUrl_Success() {
        mockServer.expect(requestTo("https://xyzcompany.supabase.co/storage/v1/object/sign/goplant-private-media/test-key.jpg"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header("apikey", VALID_SERVICE_ROLE_JWT))
            .andExpect(header("Authorization", "Bearer " + VALID_SERVICE_ROLE_JWT))
            .andExpect(content().json("{\"expiresIn\":300}"))
            .andRespond(withSuccess("{\"signedURL\":\"/storage/v1/object/sign/goplant-private-media/test-key.jpg?token=abc123token\"}", MediaType.APPLICATION_JSON));

        String signedUrl = gateway.createSignedUrl("goplant-private-media", "test-key.jpg", 300);
        assertEquals("https://xyzcompany.supabase.co/storage/v1/object/sign/goplant-private-media/test-key.jpg?token=abc123token", signedUrl);
        mockServer.verify();
    }

    @Test
    @DisplayName("createSignedUrl throws on malformed JSON response")
    void createSignedUrl_MalformedResponse_ThrowsStorageUnavailable() {
        mockServer.expect(requestTo("https://xyzcompany.supabase.co/storage/v1/object/sign/goplant-private-media/test-key.jpg"))
            .andExpect(method(HttpMethod.POST))
            .andRespond(withSuccess("{\"otherField\":\"noSignedUrl\"}", MediaType.APPLICATION_JSON));

        assertThrows(StorageUnavailableException.class,
            () -> gateway.createSignedUrl("goplant-private-media", "test-key.jpg", 300));
        mockServer.verify();
    }

    @Test
    @DisplayName("delete removes object by prefix idempotently")
    void delete_Success() {
        mockServer.expect(requestTo("https://xyzcompany.supabase.co/storage/v1/object/goplant-private-media"))
            .andExpect(method(HttpMethod.DELETE))
            .andExpect(header("apikey", VALID_SERVICE_ROLE_JWT))
            .andExpect(header("Authorization", "Bearer " + VALID_SERVICE_ROLE_JWT))
            .andExpect(content().json("{\"prefixes\":[\"test-key.jpg\"]}"))
            .andRespond(withSuccess("[{\"name\":\"test-key.jpg\"}]", MediaType.APPLICATION_JSON));

        assertDoesNotThrow(() -> gateway.delete("goplant-private-media", "test-key.jpg"));
        mockServer.verify();
    }

    @Test
    @DisplayName("delete treats 404 Not Found as idempotent success")
    void delete_NotFound_Idempotent() {
        mockServer.expect(requestTo("https://xyzcompany.supabase.co/storage/v1/object/goplant-private-media"))
            .andExpect(method(HttpMethod.DELETE))
            .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertDoesNotThrow(() -> gateway.delete("goplant-private-media", "test-key.jpg"));
        mockServer.verify();
    }

    @Test
    @DisplayName("resolveFullSignedUrl accepts valid same-origin HTTPS URL")
    void resolveFullSignedUrl_ValidSameOrigin_Accepted() {
        String fullUrl = "https://xyzcompany.supabase.co/storage/v1/object/sign/bucket/photo.jpg?token=secret123";
        String resolved = gateway.resolveFullSignedUrl("https://xyzcompany.supabase.co", fullUrl);
        assertEquals(fullUrl, resolved);
    }

    @Test
    @DisplayName("resolveFullSignedUrl resolves relative path with and without leading /storage/v1")
    void resolveFullSignedUrl_RelativePaths_Resolved() {
        String relWithStorage = "/storage/v1/object/sign/bucket/photo.jpg?token=secret123";
        assertEquals("https://xyzcompany.supabase.co/storage/v1/object/sign/bucket/photo.jpg?token=secret123",
            gateway.resolveFullSignedUrl("https://xyzcompany.supabase.co", relWithStorage));

        String relWithoutStorage = "/object/sign/bucket/photo.jpg?token=secret123";
        assertEquals("https://xyzcompany.supabase.co/storage/v1/object/sign/bucket/photo.jpg?token=secret123",
            gateway.resolveFullSignedUrl("https://xyzcompany.supabase.co", relWithoutStorage));

        String relNoSlash = "object/sign/bucket/photo.jpg?token=secret123";
        assertEquals("https://xyzcompany.supabase.co/storage/v1/object/sign/bucket/photo.jpg?token=secret123",
            gateway.resolveFullSignedUrl("https://xyzcompany.supabase.co", relNoSlash));
    }

    @Test
    @DisplayName("resolveFullSignedUrl rejects unsafe schemes, host mismatch, and userinfo")
    void resolveFullSignedUrl_SecurityViolations_Rejected() {
        // Plain HTTP
        assertThrows(StorageUnavailableException.class, () ->
            gateway.resolveFullSignedUrl("https://xyzcompany.supabase.co", "http://xyzcompany.supabase.co/storage/v1/photo.jpg"));

        // Protocol relative
        assertThrows(StorageUnavailableException.class, () ->
            gateway.resolveFullSignedUrl("https://xyzcompany.supabase.co", "//attacker.com/storage/v1/photo.jpg"));

        // Host mismatch (SSRF attempt)
        assertThrows(StorageUnavailableException.class, () ->
            gateway.resolveFullSignedUrl("https://xyzcompany.supabase.co", "https://attacker.supabase.co/storage/v1/photo.jpg"));

        // Userinfo injection (@)
        assertThrows(StorageUnavailableException.class, () ->
            gateway.resolveFullSignedUrl("https://xyzcompany.supabase.co", "https://user:pass@xyzcompany.supabase.co/storage/v1/photo.jpg"));

        // Non-storage path
        assertThrows(StorageUnavailableException.class, () ->
            gateway.resolveFullSignedUrl("https://xyzcompany.supabase.co", "https://xyzcompany.supabase.co/rest/v1/users"));
    }

    @Test
    @DisplayName("sanitizeLogMessage redacts API key and bearer tokens")
    void sanitizeLogMessage_RedactsSensitiveData() {
        String raw = "Failed request with apikey=" + VALID_SERVICE_ROLE_JWT + " and Authorization: Bearer " + VALID_SERVICE_ROLE_JWT;
        String sanitized = gateway.sanitizeLogMessage(raw);

        assertFalse(sanitized.contains(VALID_SERVICE_ROLE_JWT));
        assertTrue(sanitized.contains("[REDACTED]"));
    }
}
