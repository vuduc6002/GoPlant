package com.cmc.plant_care_backend.service.storage;

import com.cmc.plant_care_backend.common.exception.StorageUnavailableException;
import com.cmc.plant_care_backend.config.SupabaseStorageProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class SupabaseStorageGatewayTest {

    private SupabaseStorageProperties properties;
    private MockRestServiceServer mockServer;
    private SupabaseStorageGateway gateway;

    @BeforeEach
    void setUp() {
        properties = new SupabaseStorageProperties(
            "https://xyzcompany.supabase.co",
            "test-service-key-abcdef123456",
            "goplant-private-media",
            5242880L,
            3600
        );

        RestClient.Builder builder = RestClient.builder();
        mockServer = MockRestServiceServer.bindTo(builder).build();
        gateway = new SupabaseStorageGateway(properties, builder);
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
    @DisplayName("upload sends raw binary POST with correct headers and x-upsert: false")
    void upload_Success() {
        byte[] payload = new byte[] { 1, 2, 3, 4 };

        mockServer.expect(requestTo("https://xyzcompany.supabase.co/storage/v1/object/goplant-private-media/test-key.jpg"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header("apikey", "test-service-key-abcdef123456"))
            .andExpect(header("Authorization", "Bearer test-service-key-abcdef123456"))
            .andExpect(header("x-upsert", "false"))
            .andExpect(header("Content-Type", "image/jpeg"))
            .andExpect(content().bytes(payload))
            .andRespond(withSuccess("{\"Key\":\"goplant-private-media/test-key.jpg\"}", MediaType.APPLICATION_JSON));

        assertDoesNotThrow(() -> gateway.upload("goplant-private-media", "test-key.jpg", payload, "image/jpeg"));
        mockServer.verify();
    }

    @Test
    @DisplayName("upload throws StorageUnavailableException on upstream 500 error")
    void upload_UpstreamError_ThrowsStorageUnavailable() {
        byte[] payload = new byte[] { 1, 2, 3, 4 };

        mockServer.expect(requestTo("https://xyzcompany.supabase.co/storage/v1/object/goplant-private-media/test-key.jpg"))
            .andExpect(method(HttpMethod.POST))
            .andRespond(withServerError());

        StorageUnavailableException ex = assertThrows(StorageUnavailableException.class,
            () -> gateway.upload("goplant-private-media", "test-key.jpg", payload, "image/jpeg"));
        assertTrue(ex.getMessage().contains("sự cố") || ex.getMessage().contains("500"));
    }

    @Test
    @DisplayName("createSignedUrl returns fully-qualified HTTPS read URL")
    void createSignedUrl_Success() {
        mockServer.expect(requestTo("https://xyzcompany.supabase.co/storage/v1/object/sign/goplant-private-media/test-key.jpg"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header("apikey", "test-service-key-abcdef123456"))
            .andExpect(header("Authorization", "Bearer test-service-key-abcdef123456"))
            .andExpect(content().json("{\"expiresIn\":3600}"))
            .andRespond(withSuccess("{\"signedURL\":\"/storage/v1/object/sign/goplant-private-media/test-key.jpg?token=abc123token\"}", MediaType.APPLICATION_JSON));

        String signedUrl = gateway.createSignedUrl("goplant-private-media", "test-key.jpg", 3600);
        assertEquals("https://xyzcompany.supabase.co/storage/v1/object/sign/goplant-private-media/test-key.jpg?token=abc123token", signedUrl);
        mockServer.verify();
    }

    @Test
    @DisplayName("delete removes object by prefix idempotently")
    void delete_Success() {
        mockServer.expect(requestTo("https://xyzcompany.supabase.co/storage/v1/object/goplant-private-media"))
            .andExpect(method(HttpMethod.DELETE))
            .andExpect(header("apikey", "test-service-key-abcdef123456"))
            .andExpect(header("Authorization", "Bearer test-service-key-abcdef123456"))
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
}
