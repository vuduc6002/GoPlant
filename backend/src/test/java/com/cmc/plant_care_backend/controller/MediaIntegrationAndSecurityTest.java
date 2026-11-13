package com.cmc.plant_care_backend.controller;

import com.cmc.plant_care_backend.common.exception.StorageUnavailableException;
import com.cmc.plant_care_backend.model.Media;
import com.cmc.plant_care_backend.model.Role;
import com.cmc.plant_care_backend.model.User;
import com.cmc.plant_care_backend.model.enums.MediaStatus;
import com.cmc.plant_care_backend.repository.MediaRepository;
import com.cmc.plant_care_backend.repository.RoleRepository;
import com.cmc.plant_care_backend.repository.UserRepository;
import com.cmc.plant_care_backend.security.JwtService;
import com.cmc.plant_care_backend.security.UserPrincipal;
import com.cmc.plant_care_backend.service.storage.SupabaseStorageGateway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.UUID;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@ExtendWith(OutputCaptureExtension.class)
class MediaIntegrationAndSecurityTest {

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private MediaRepository mediaRepository;

    @Autowired
    private JwtService jwtService;

    @MockitoBean
    private SupabaseStorageGateway storageGateway;

    private MockMvc mockMvc;
    private User userA;
    private User userB;
    private String tokenA;
    private String tokenB;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context)
            .apply(springSecurity())
            .build();

        Role roleUser = roleRepository.findByName("ROLE_USER")
            .orElseGet(() -> roleRepository.save(new Role("ROLE_USER")));

        userA = createUser("User A Media", roleUser);
        userB = createUser("User B Media", roleUser);

        tokenA = jwtService.generateToken(UserPrincipal.create(userA));
        tokenB = jwtService.generateToken(UserPrincipal.create(userB));

        when(storageGateway.isConfigured()).thenReturn(true);
    }

    private User createUser(String name, Role role) {
        User u = new User();
        u.setFullName(name);
        u.setEmail("media-" + UUID.randomUUID().toString().substring(0, 8) + "@goplant.vn");
        u.setPasswordHash("$2a$10$dummyHashMediaTest");
        u.getRoles().add(role);
        return userRepository.save(u);
    }

    private byte[] createTestImage(String format, int width, int height) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.GREEN);
        g.fillRect(0, 0, width, height);
        g.dispose();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(image, format, baos);
        return baos.toByteArray();
    }

    @Test
    @DisplayName("Unauthenticated requests should return 401 Unauthorized")
    void unauthenticatedRequests_ShouldReturn401() throws Exception {
        UUID randomId = UUID.randomUUID();

        mockMvc.perform(multipart("/api/v1/media")
                .file(new MockMultipartFile("file", "test.jpg", "image/jpeg", new byte[] { 1, 2, 3 })))
            .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/v1/media/{id}/read-url", randomId))
            .andExpect(status().isUnauthorized());

        mockMvc.perform(delete("/api/v1/media/{id}", randomId))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("User A uploads valid JPEG: returns 201 Created and saves READY record in DB")
    void uploadMedia_UserA_Success() throws Exception {
        byte[] jpegBytes = createTestImage("JPEG", 100, 100);
        MockMultipartFile file = new MockMultipartFile("file", "photo.jpg", "image/jpeg", jpegBytes);

        doNothing().when(storageGateway).upload(anyString(), anyString(), any(), anyString());

        mockMvc.perform(multipart("/api/v1/media")
                .file(file)
                .header("Authorization", "Bearer " + tokenA))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.data.id").isNotEmpty())
            .andExpect(jsonPath("$.data.mimeType").value("image/jpeg"))
            .andExpect(jsonPath("$.data.width").value(100))
            .andExpect(jsonPath("$.data.height").value(100))
            .andExpect(jsonPath("$.data.status").value("READY"))
            .andExpect(jsonPath("$.data.ownerId").doesNotExist()); // ownerId should not be exposed

        verify(storageGateway).upload(eq("goplant-private-media"), contains(userA.getId().toString()), any(), eq("image/jpeg"));
    }

    @Test
    @DisplayName("Cross-user read-url: User B cannot access User A's media read URL (403 Forbidden)")
    void readUrl_CrossUser_Forbidden() throws Exception {
        Media mediaA = new Media();
        mediaA.setOwner(userA);
        mediaA.setBucket("goplant-private-media");
        mediaA.setObjectKey("users/" + userA.getId() + "/image.jpg");
        mediaA.setMimeType("image/jpeg");
        mediaA.setSizeBytes(1024);
        mediaA.setSha256("abc123sha256");
        mediaA.setStatus(MediaStatus.READY);
        mediaA = mediaRepository.save(mediaA);

        mockMvc.perform(get("/api/v1/media/{id}/read-url", mediaA.getId())
                .header("Authorization", "Bearer " + tokenB))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.message").value(containsString("không có quyền")));

        verify(storageGateway, never()).createSignedUrl(any(), any(), anyInt());
    }

    @Test
    @DisplayName("Cross-user delete: User B cannot delete User A's media (403 Forbidden)")
    void delete_CrossUser_Forbidden() throws Exception {
        Media mediaA = new Media();
        mediaA.setOwner(userA);
        mediaA.setBucket("goplant-private-media");
        mediaA.setObjectKey("users/" + userA.getId() + "/image.jpg");
        mediaA.setMimeType("image/jpeg");
        mediaA.setSizeBytes(1024);
        mediaA.setSha256("abc123sha256");
        mediaA.setStatus(MediaStatus.READY);
        mediaA = mediaRepository.save(mediaA);

        mockMvc.perform(delete("/api/v1/media/{id}", mediaA.getId())
                .header("Authorization", "Bearer " + tokenB))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.message").value(containsString("không có quyền")));

        verify(storageGateway, never()).delete(any(), any());
    }

    @Test
    @DisplayName("Owner gets read URL successfully (200 OK)")
    void readUrl_Owner_Success() throws Exception {
        Media mediaA = new Media();
        mediaA.setOwner(userA);
        mediaA.setBucket("goplant-private-media");
        mediaA.setObjectKey("users/" + userA.getId() + "/image.jpg");
        mediaA.setMimeType("image/jpeg");
        mediaA.setSizeBytes(1024);
        mediaA.setSha256("abc123sha256");
        mediaA.setStatus(MediaStatus.READY);
        mediaA = mediaRepository.save(mediaA);

        when(storageGateway.createSignedUrl(eq("goplant-private-media"), eq(mediaA.getObjectKey()), anyInt()))
            .thenReturn("https://storage.goplant.vn/signed-url-for-user-a");

        mockMvc.perform(get("/api/v1/media/{id}/read-url", mediaA.getId())
                .header("Authorization", "Bearer " + tokenA))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.mediaId").value(mediaA.getId().toString()))
            .andExpect(jsonPath("$.data.readUrl").value("https://storage.goplant.vn/signed-url-for-user-a"))
            .andExpect(jsonPath("$.data.expiresAt").isNotEmpty());
    }

    @Test
    @DisplayName("Owner deletes READY media successfully (200 OK) and transitions to DELETED")
    void delete_Owner_Success() throws Exception {
        Media mediaA = new Media();
        mediaA.setOwner(userA);
        mediaA.setBucket("goplant-private-media");
        mediaA.setObjectKey("users/" + userA.getId() + "/image.jpg");
        mediaA.setMimeType("image/jpeg");
        mediaA.setSizeBytes(1024);
        mediaA.setSha256("abc123sha256");
        mediaA.setStatus(MediaStatus.READY);
        mediaA = mediaRepository.save(mediaA);

        doNothing().when(storageGateway).delete(eq("goplant-private-media"), eq(mediaA.getObjectKey()));

        mockMvc.perform(delete("/api/v1/media/{id}", mediaA.getId())
                .header("Authorization", "Bearer " + tokenA))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));

        Media updated = mediaRepository.findById(mediaA.getId()).orElseThrow();
        assertEquals(MediaStatus.DELETED, updated.getStatus());
        verify(storageGateway).delete("goplant-private-media", mediaA.getObjectKey());
    }

    @Test
    @DisplayName("Deleting ATTACHED media returns 409 Conflict with MEDIA_ATTACHED")
    void delete_AttachedMedia_Returns409() throws Exception {
        Media mediaA = new Media();
        mediaA.setOwner(userA);
        mediaA.setBucket("goplant-private-media");
        mediaA.setObjectKey("users/" + userA.getId() + "/attached.jpg");
        mediaA.setMimeType("image/jpeg");
        mediaA.setSizeBytes(1024);
        mediaA.setSha256("abc123sha256");
        mediaA.setStatus(MediaStatus.ATTACHED);
        mediaA = mediaRepository.save(mediaA);

        mockMvc.perform(delete("/api/v1/media/{id}", mediaA.getId())
                .header("Authorization", "Bearer " + tokenA))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error.code").value("MEDIA_ATTACHED"))
            .andExpect(jsonPath("$.error.field").value("mediaId"));

        verify(storageGateway, never()).delete(any(), any());
    }

    @Test
    @DisplayName("Uploading file > 5MB returns 413 Payload Too Large (FILE_TOO_LARGE)")
    void upload_Exceeds5MB_Returns413() throws Exception {
        byte[] oversized = new byte[5 * 1024 * 1024 + 10];
        MockMultipartFile file = new MockMultipartFile("file", "large.jpg", "image/jpeg", oversized);

        mockMvc.perform(multipart("/api/v1/media")
                .file(file)
                .header("Authorization", "Bearer " + tokenA))
            .andExpect(status().isPayloadTooLarge())
            .andExpect(jsonPath("$.error.code").value("FILE_TOO_LARGE"));
    }

    @Test
    @DisplayName("Uploading unsupported file (e.g. SVG) returns 400 Bad Request")
    void upload_UnsupportedFormat_Returns400() throws Exception {
        byte[] svgBytes = "<svg xmlns='http://www.w3.org/2000/svg'></svg>".getBytes();
        MockMultipartFile file = new MockMultipartFile("file", "test.svg", "image/svg+xml", svgBytes);

        mockMvc.perform(multipart("/api/v1/media")
                .file(file)
                .header("Authorization", "Bearer " + tokenA))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    @DisplayName("Supabase storage outage during upload returns 503 Service Unavailable (STORAGE_UNAVAILABLE)")
    void upload_StorageOutage_Returns503() throws Exception {
        byte[] jpegBytes = createTestImage("JPEG", 50, 50);
        MockMultipartFile file = new MockMultipartFile("file", "photo.jpg", "image/jpeg", jpegBytes);

        doThrow(new StorageUnavailableException("Storage network error"))
            .when(storageGateway).upload(anyString(), anyString(), any(), anyString());

        mockMvc.perform(multipart("/api/v1/media")
                .file(file)
                .header("Authorization", "Bearer " + tokenA))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.error.code").value("STORAGE_UNAVAILABLE"));
    }

    @Test
    @DisplayName("CapturedOutput verification: secrets and tokens are never leaked to logs")
    void outputCapture_NoSecretsLeaked(CapturedOutput output) throws Exception {
        byte[] jpegBytes = createTestImage("JPEG", 50, 50);
        MockMultipartFile file = new MockMultipartFile("file", "photo.jpg", "image/jpeg", jpegBytes);

        doNothing().when(storageGateway).upload(anyString(), anyString(), any(), anyString());

        mockMvc.perform(multipart("/api/v1/media")
                .file(file)
                .header("Authorization", "Bearer " + tokenA))
            .andExpect(status().isCreated());

        String logs = output.getAll();
        assertFalse(logs.contains("dummyHashMediaTest"), "Password hash must not appear in logs");
        assertFalse(logs.contains("test-key"), "Storage service key must not appear in logs");
    }
}
