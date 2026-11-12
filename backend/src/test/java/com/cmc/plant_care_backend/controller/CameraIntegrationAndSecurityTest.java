package com.cmc.plant_care_backend.controller;

import com.cmc.plant_care_backend.model.*;
import com.cmc.plant_care_backend.model.enums.*;
import com.cmc.plant_care_backend.repository.*;
import com.cmc.plant_care_backend.security.JwtService;
import com.cmc.plant_care_backend.security.UserPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.util.UUID;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@ExtendWith(OutputCaptureExtension.class)
class CameraIntegrationAndSecurityTest {

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private GardenRepository gardenRepository;

    @Autowired
    private PlantSpeciesRepository plantSpeciesRepository;

    @Autowired
    private UserPlantRepository userPlantRepository;

    @Autowired
    private CameraRepository cameraRepository;

    @Autowired
    private JwtService jwtService;

    private MockMvc mockMvc;
    private User userA;
    private User userB;
    private User adminUser;
    private String tokenA;
    private String tokenB;
    private String adminToken;
    private Garden gardenA;
    private Garden gardenB;
    private UserPlant plantA;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context)
            .apply(springSecurity())
            .build();

        Role roleUser = roleRepository.findByName("ROLE_USER")
            .orElseGet(() -> roleRepository.save(new Role("ROLE_USER")));
        Role roleAdmin = roleRepository.findByName("ROLE_ADMIN")
            .orElseGet(() -> roleRepository.save(new Role("ROLE_ADMIN")));

        userA = createUser("User A Camera", roleUser);
        userB = createUser("User B Camera", roleUser);
        adminUser = createUser("Admin Camera", roleAdmin);

        tokenA = jwtService.generateToken(UserPrincipal.create(userA));
        tokenB = jwtService.generateToken(UserPrincipal.create(userB));
        adminToken = jwtService.generateToken(UserPrincipal.create(adminUser));

        gardenA = createGarden(userA, "Ban công của A");
        gardenB = createGarden(userB, "Sân thượng của B");

        PlantSpecies species = new PlantSpecies();
        species.setCommonName("Trầu bà test " + UUID.randomUUID().toString().substring(0, 6));
        species.setScientificName("Epipremnum aureum");
        species.setCategory("Cây nội thất");
        species = plantSpeciesRepository.save(species);

        plantA = new UserPlant();
        plantA.setOwner(userA);
        plantA.setGarden(gardenA);
        plantA.setSpecies(species);
        plantA.setDisplayName("Trầu bà góc Đông");
        plantA.setHealthStatus(HealthStatus.HEALTHY);
        plantA = userPlantRepository.save(plantA);
    }

    private User createUser(String fullName, Role role) {
        User u = new User();
        u.setFullName(fullName);
        u.setEmail("cam_" + UUID.randomUUID() + "@goplant.com");
        u.setPasswordHash("hashed_pw");
        u.setStatus(UserStatus.ACTIVE);
        u.getRoles().add(role);
        return userRepository.save(u);
    }

    private Garden createGarden(User owner, String name) {
        Garden g = new Garden();
        g.setOwner(owner);
        g.setName(name);
        g.setLocation("Tầng 3");
        g.setSpaceType(SpaceType.BAN_CONG);
        return gardenRepository.save(g);
    }

    private String extractJsonId(String json) {
        int idIdx = json.indexOf("\"id\":\"");
        assertTrue(idIdx >= 0, "Expected id field in JSON response");
        return json.substring(idIdx + 6, idIdx + 42);
    }

    @Test
    void cameraCrudLifecycle_ShouldWork_AndPreserveGardenAndPlantsOnCameraDelete() throws Exception {
        // 1. Empty list on new garden
        mockMvc.perform(get("/api/v1/gardens/" + gardenA.getId() + "/cameras")
                .header("Authorization", "Bearer " + tokenA))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data", hasSize(0)));

        // 2. Create camera 1 — spoofed ownerId, gardenId, status=ONLINE in body MUST be ignored
        String createBody1 = """
            {
              "name": "  Camera Ban Công Đông  ",
              "locationDesc": "  Góc tường phải  ",
              "connectionNote": "  Đã kiểm tra nguồn điện và cáp mạng  ",
              "ownerId": "%s",
              "gardenId": "%s",
              "status": "ONLINE"
            }
            """.formatted(userB.getId(), gardenB.getId());

        String createRes1 = mockMvc.perform(post("/api/v1/gardens/" + gardenA.getId() + "/cameras")
                .header("Authorization", "Bearer " + tokenA)
                .contentType(MediaType.APPLICATION_JSON)
                .content(createBody1))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.gardenId").value(gardenA.getId().toString()))
            .andExpect(jsonPath("$.data.name").value("Camera Ban Công Đông"))
            .andExpect(jsonPath("$.data.locationDesc").value("Góc tường phải"))
            .andExpect(jsonPath("$.data.connectionNote").value("Đã kiểm tra nguồn điện và cáp mạng"))
            .andExpect(jsonPath("$.data.status").value("OFFLINE"))
            .andExpect(jsonPath("$.data.ownerId").doesNotExist())
            .andExpect(jsonPath("$.data.createdAt").isNotEmpty())
            .andExpect(jsonPath("$.data.updatedAt").isNotEmpty())
            .andReturn().getResponse().getContentAsString();

        String cameraId1 = extractJsonId(createRes1);

        // 3. Create camera 2 with safe prose containing keyword words without credentials
        String createBody2 = """
            {
              "name": "Camera Cửa Sổ",
              "connectionNote": "Token camera chưa cần thiết"
            }
            """;
        String createRes2 = mockMvc.perform(post("/api/v1/gardens/" + gardenA.getId() + "/cameras")
                .header("Authorization", "Bearer " + tokenA)
                .contentType(MediaType.APPLICATION_JSON)
                .content(createBody2))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.data.status").value("OFFLINE"))
            .andExpect(jsonPath("$.data.connectionNote").value("Token camera chưa cần thiết"))
            .andReturn().getResponse().getContentAsString();
        String cameraId2 = extractJsonId(createRes2);

        // 4. GET list returns ordered cameras (created_at ASC, id ASC)
        mockMvc.perform(get("/api/v1/gardens/" + gardenA.getId() + "/cameras")
                .header("Authorization", "Bearer " + tokenA))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data", hasSize(2)))
            .andExpect(jsonPath("$.data[0].id").value(cameraId1))
            .andExpect(jsonPath("$.data[1].id").value(cameraId2));

        // 5. Partial PUT on camera 1: update only name + status=ONLINE; spoofed ownerId/gardenId ignored
        String partialPut = """
            {
              "name": "Camera Đông Đã Sửa",
              "status": "ONLINE",
              "ownerId": "%s",
              "gardenId": "%s"
            }
            """.formatted(userB.getId(), gardenB.getId());

        mockMvc.perform(put("/api/v1/cameras/" + cameraId1)
                .header("Authorization", "Bearer " + tokenA)
                .contentType(MediaType.APPLICATION_JSON)
                .content(partialPut))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.name").value("Camera Đông Đã Sửa"))
            .andExpect(jsonPath("$.data.status").value("ONLINE"))
            .andExpect(jsonPath("$.data.locationDesc").value("Góc tường phải"))
            .andExpect(jsonPath("$.data.connectionNote").value("Đã kiểm tra nguồn điện và cáp mạng"))
            .andExpect(jsonPath("$.data.gardenId").value(gardenA.getId().toString()));

        // 6. PUT transition to ERROR + clear optional fields to null using empty/blank strings
        String clearPut = """
            {
              "status": "ERROR",
              "locationDesc": "   ",
              "connectionNote": ""
            }
            """;

        mockMvc.perform(put("/api/v1/cameras/" + cameraId1)
                .header("Authorization", "Bearer " + tokenA)
                .contentType(MediaType.APPLICATION_JSON)
                .content(clearPut))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.name").value("Camera Đông Đã Sửa"))
            .andExpect(jsonPath("$.data.status").value("ERROR"))
            .andExpect(jsonPath("$.data.locationDesc").value(nullValue()))
            .andExpect(jsonPath("$.data.connectionNote").value(nullValue()));

        // 7. DELETE camera 1 & camera 2 -> returns SimpleMessageResponse, keeps garden + plant intact
        mockMvc.perform(delete("/api/v1/cameras/" + cameraId1)
                .header("Authorization", "Bearer " + tokenA))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.message").isNotEmpty());

        mockMvc.perform(delete("/api/v1/cameras/" + cameraId2)
                .header("Authorization", "Bearer " + tokenA))
            .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/gardens/" + gardenA.getId() + "/cameras")
                .header("Authorization", "Bearer " + tokenA))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data", hasSize(0)));

        assertTrue(gardenRepository.findById(gardenA.getId()).isPresent());
        assertTrue(userPlantRepository.findById(plantA.getId()).isPresent());
    }

    @Test
    void cameraSecurityAndOwnershipMatrix_ShouldEnforce401_403_404_IncludingAdmin() throws Exception {
        String createBody = "{\"name\":\"Camera A1\"}";
        String res = mockMvc.perform(post("/api/v1/gardens/" + gardenA.getId() + "/cameras")
                .header("Authorization", "Bearer " + tokenA)
                .contentType(MediaType.APPLICATION_JSON)
                .content(createBody))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        String cameraIdA = extractJsonId(res);

        UUID missingId = UUID.randomUUID();

        // 1. 401 Unauthenticated on all 4 endpoints
        mockMvc.perform(get("/api/v1/gardens/" + gardenA.getId() + "/cameras"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));

        mockMvc.perform(post("/api/v1/gardens/" + gardenA.getId() + "/cameras")
                .contentType(MediaType.APPLICATION_JSON)
                .content(createBody))
            .andExpect(status().isUnauthorized());

        mockMvc.perform(put("/api/v1/cameras/" + cameraIdA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"X\"}"))
            .andExpect(status().isUnauthorized());

        mockMvc.perform(delete("/api/v1/cameras/" + cameraIdA))
            .andExpect(status().isUnauthorized());

        // 2. 404 Not Found on missing garden / camera
        mockMvc.perform(get("/api/v1/gardens/" + missingId + "/cameras")
                .header("Authorization", "Bearer " + tokenA))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error.code").value("RESOURCE_NOT_FOUND"));

        mockMvc.perform(post("/api/v1/gardens/" + missingId + "/cameras")
                .header("Authorization", "Bearer " + tokenA)
                .contentType(MediaType.APPLICATION_JSON)
                .content(createBody))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error.code").value("RESOURCE_NOT_FOUND"));

        mockMvc.perform(put("/api/v1/cameras/" + missingId)
                .header("Authorization", "Bearer " + tokenA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"X\"}"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error.code").value("RESOURCE_NOT_FOUND"));

        mockMvc.perform(delete("/api/v1/cameras/" + missingId)
                .header("Authorization", "Bearer " + tokenA))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error.code").value("RESOURCE_NOT_FOUND"));

        // 3. 403 Forbidden for User B AND ROLE_ADMIN (no admin bypass) on all 4 endpoints
        for (String otherToken : new String[]{tokenB, adminToken}) {
            mockMvc.perform(get("/api/v1/gardens/" + gardenA.getId() + "/cameras")
                    .header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));

            mockMvc.perform(post("/api/v1/gardens/" + gardenA.getId() + "/cameras")
                    .header("Authorization", "Bearer " + otherToken)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(createBody))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));

            mockMvc.perform(put("/api/v1/cameras/" + cameraIdA)
                    .header("Authorization", "Bearer " + otherToken)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"name\":\"Tamper\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));

            mockMvc.perform(delete("/api/v1/cameras/" + cameraIdA)
                    .header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
        }
    }

    @Test
    void cameraValidationMatrix_ShouldRejectBadInputsAndCredentialsWithoutSecretEcho(CapturedOutput capturedOutput) throws Exception {
        String createdJson = mockMvc.perform(post("/api/v1/gardens/" + gardenA.getId() + "/cameras")
                .header("Authorization", "Bearer " + tokenA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Camera Chuẩn\"}"))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        String cameraId = extractJsonId(createdJson);

        // 1. Invalid UUID path param -> 400 VALIDATION_ERROR
        mockMvc.perform(get("/api/v1/gardens/not-a-uuid/cameras")
                .header("Authorization", "Bearer " + tokenA))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
            .andExpect(jsonPath("$.error.field").value("gardenId"));

        // 2. POST blank / too long name -> 400 VALIDATION_ERROR
        mockMvc.perform(post("/api/v1/gardens/" + gardenA.getId() + "/cameras")
                .header("Authorization", "Bearer " + tokenA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"   \"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
            .andExpect(jsonPath("$.error.field").value("name"));

        mockMvc.perform(post("/api/v1/gardens/" + gardenA.getId() + "/cameras")
                .header("Authorization", "Bearer " + tokenA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"" + "X".repeat(201) + "\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
            .andExpect(jsonPath("$.error.field").value("name"));

        // 3. PUT blank name -> 400 VALIDATION_ERROR and original name stays intact
        mockMvc.perform(put("/api/v1/cameras/" + cameraId)
                .header("Authorization", "Bearer " + tokenA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"  \"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
            .andExpect(jsonPath("$.error.field").value("name"));

        assertEquals("Camera Chuẩn", cameraRepository.findById(UUID.fromString(cameraId)).orElseThrow().getName());

        // 4. PUT invalid enum status -> 400 VALIDATION_ERROR without leaking value
        String invalidEnumRes = mockMvc.perform(put("/api/v1/cameras/" + cameraId)
                .header("Authorization", "Bearer " + tokenA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"INVALID_SECRET_VALUE\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
            .andReturn().getResponse().getContentAsString();
        assertFalse(invalidEnumRes.contains("INVALID_SECRET_VALUE"));

        // 5. POST & PUT credential note rejection without echoing secret in response or logs
        String[] badNotes = {
            "rtsp://admin:MySecretRtsp99@192.168.1.10:554/stream1",
            "http://camuser:MyHttpPass88@cam.local/feed",
            "admin:BarePassSecret11@192.168.1.10",
            "camadmin:BarePass88Secret@192.168.1.9:554",
            "email:CompactEmailSecret22@cam.local",
            "mail:CompactMailSecret33@cam.local",
            "Camera login: admin:InlineLoginSecret44@cam.local",
            "Label:(admin:ParenSecret55@cam.local)",
            "password=LeakSecretValue123",
            "apiKey: ApiKeySecretValue456"
        };

        String[] secretMarkers = {
            "MySecretRtsp99",
            "MyHttpPass88",
            "BarePassSecret11",
            "BarePass88Secret",
            "CompactEmailSecret22",
            "CompactMailSecret33",
            "InlineLoginSecret44",
            "ParenSecret55",
            "LeakSecretValue123",
            "ApiKeySecretValue456"
        };

        for (String badNote : badNotes) {
            String postReject = mockMvc.perform(post("/api/v1/gardens/" + gardenA.getId() + "/cameras")
                    .header("Authorization", "Bearer " + tokenA)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"name\":\"Cam Bad\",\"connectionNote\":\"" + badNote + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.error.field").value("connectionNote"))
                .andReturn().getResponse().getContentAsString();

            String putReject = mockMvc.perform(put("/api/v1/cameras/" + cameraId)
                    .header("Authorization", "Bearer " + tokenA)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"connectionNote\":\"" + badNote + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.error.field").value("connectionNote"))
                .andReturn().getResponse().getContentAsString();

            for (String secret : secretMarkers) {
                assertFalse(postReject.contains(secret), "POST error response must not echo secret: " + secret);
                assertFalse(putReject.contains(secret), "PUT error response must not echo secret: " + secret);
            }
        }

        String loggedOutput = capturedOutput.getAll();
        for (String secret : secretMarkers) {
            assertFalse(loggedOutput.contains(secret), "Application log must not contain raw secret: " + secret);
        }
    }

    @Test
    void deleteGarden_ShouldCascadeDeleteItsCameras() throws Exception {
        String createdJson = mockMvc.perform(post("/api/v1/gardens/" + gardenA.getId() + "/cameras")
                .header("Authorization", "Bearer " + tokenA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Camera Sắp Bị Cascade\"}"))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        UUID cameraId = UUID.fromString(extractJsonId(createdJson));

        assertTrue(cameraRepository.findById(cameraId).isPresent());

        mockMvc.perform(delete("/api/v1/gardens/" + gardenA.getId())
                .header("Authorization", "Bearer " + tokenA))
            .andExpect(status().isOk());

        assertFalse(cameraRepository.findById(cameraId).isPresent());
        assertFalse(gardenRepository.findById(gardenA.getId()).isPresent());
    }
}
