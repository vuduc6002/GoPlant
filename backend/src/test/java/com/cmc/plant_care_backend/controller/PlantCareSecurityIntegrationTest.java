package com.cmc.plant_care_backend.controller;

import com.cmc.plant_care_backend.model.Garden;
import com.cmc.plant_care_backend.model.PlantSpecies;
import com.cmc.plant_care_backend.model.Role;
import com.cmc.plant_care_backend.model.User;
import com.cmc.plant_care_backend.model.UserPlant;
import com.cmc.plant_care_backend.model.enums.HealthStatus;
import com.cmc.plant_care_backend.model.enums.UserStatus;
import com.cmc.plant_care_backend.repository.GardenRepository;
import com.cmc.plant_care_backend.repository.PlantSpeciesRepository;
import com.cmc.plant_care_backend.repository.RoleRepository;
import com.cmc.plant_care_backend.repository.UserPlantRepository;
import com.cmc.plant_care_backend.repository.UserRepository;
import com.cmc.plant_care_backend.security.JwtService;
import com.cmc.plant_care_backend.security.UserPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
class PlantCareSecurityIntegrationTest {

    private static final ZoneId VN_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private GardenRepository gardenRepository;

    @Autowired
    private UserPlantRepository userPlantRepository;

    @Autowired
    private PlantSpeciesRepository plantSpeciesRepository;

    @Autowired
    private JwtService jwtService;

    private MockMvc mockMvc;
    private String userAToken;
    private String userBToken;
    private String adminToken;
    private User userA;
    private User userB;
    private User admin;
    private Garden gardenA;
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

        userA = new User();
        userA.setFullName("User Alice");
        userA.setEmail("alice_" + UUID.randomUUID() + "@goplant.com");
        userA.setPasswordHash("hashed_pw");
        userA.setStatus(UserStatus.ACTIVE);
        userA.getRoles().add(roleUser);
        userA = userRepository.save(userA);

        userB = new User();
        userB.setFullName("User Bob");
        userB.setEmail("bob_" + UUID.randomUUID() + "@goplant.com");
        userB.setPasswordHash("hashed_pw");
        userB.setStatus(UserStatus.ACTIVE);
        userB.getRoles().add(roleUser);
        userB = userRepository.save(userB);

        admin = new User();
        admin.setFullName("Admin Root");
        admin.setEmail("admin_" + UUID.randomUUID() + "@goplant.com");
        admin.setPasswordHash("hashed_pw");
        admin.setStatus(UserStatus.ACTIVE);
        admin.getRoles().add(roleAdmin);
        admin = userRepository.save(admin);

        userAToken = jwtService.generateToken(UserPrincipal.create(userA));
        userBToken = jwtService.generateToken(UserPrincipal.create(userB));
        adminToken = jwtService.generateToken(UserPrincipal.create(admin));

        gardenA = new Garden();
        gardenA.setName("Vườn Alice");
        gardenA.setLocation("Ban Công Tầng 2");
        gardenA.setOwner(userA);
        gardenA = gardenRepository.save(gardenA);

        PlantSpecies species = new PlantSpecies();
        species.setCommonName("Cà Chua Cherry");
        species.setScientificName("Solanum lycopersicum");
        species.setCategory("Rau ăn quả");
        species = plantSpeciesRepository.save(species);

        plantA = new UserPlant();
        plantA.setSpecies(species);
        plantA.setDisplayName("Cà Chua Alice");
        plantA.setOwner(userA);
        plantA.setGarden(gardenA);
        plantA.setHealthStatus(HealthStatus.HEALTHY);
        plantA.setPlantedAt(LocalDate.now(VN_ZONE));
        plantA = userPlantRepository.save(plantA);
    }

    @Test
    void userB_CannotAccess_UserAPlant_Returns403() throws Exception {
        mockMvc.perform(get("/api/v1/plants/" + plantA.getId())
                .header("Authorization", "Bearer " + userBToken))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
    }

    @Test
    void userA_CanAccess_OwnPlant_Returns200() throws Exception {
        mockMvc.perform(get("/api/v1/plants/" + plantA.getId())
                .header("Authorization", "Bearer " + userAToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.displayName").value("Cà Chua Alice"));
    }

    @Test
    void userB_CannotCreateSchedule_ForUserAPlant_Returns403() throws Exception {
        String scheduleJson = String.format("""
            {
                "userPlantId": "%s",
                "taskType": "WATERING",
                "frequency": "DAILY",
                "startDate": "%s"
            }
            """, plantA.getId(), LocalDate.now(VN_ZONE));

        mockMvc.perform(post("/api/v1/schedules")
                .header("Authorization", "Bearer " + userBToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(scheduleJson))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
    }

    @Test
    void userA_ScheduleLifecycle_Complete_And_Skip_ShouldWork() throws Exception {
        LocalDate todayVn = LocalDate.now(VN_ZONE);
        String scheduleJson = String.format("""
            {
                "userPlantId": "%s",
                "taskType": "WATERING",
                "frequency": "DAILY",
                "startDate": "%s",
                "reminderTime": "00:00:00"
            }
            """, plantA.getId(), todayVn);

        String scheduleResp = mockMvc.perform(post("/api/v1/schedules")
                .header("Authorization", "Bearer " + userAToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(scheduleJson))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.frequency").value("DAILY"))
            .andReturn().getResponse().getContentAsString();

        int idIdx = scheduleResp.indexOf("\"id\":\"");
        String scheduleId = scheduleResp.substring(idIdx + 6, idIdx + 42);

        // User B cannot complete user A's schedule
        mockMvc.perform(post("/api/v1/schedules/" + scheduleId + "/complete")
                .header("Authorization", "Bearer " + userBToken))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));

        // User A completes schedule
        mockMvc.perform(post("/api/v1/schedules/" + scheduleId + "/complete")
                .header("Authorization", "Bearer " + userAToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"note\":\"Đã tưới nước đầy đủ\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.scheduleStatus").value("ACTIVE"));

        // User A gets today's schedules
        mockMvc.perform(get("/api/v1/schedules/today")
                .header("Authorization", "Bearer " + userAToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    void userA_CreateCareLog_And_GrowthJournal_ShouldWork() throws Exception {
        // Manual care log
        String logJson = String.format("""
            {
                "userPlantId": "%s",
                "taskType": "PRUNING",
                "note": "Cắt tỉa cành thừa"
            }
            """, plantA.getId());

        mockMvc.perform(post("/api/v1/care-logs")
                .header("Authorization", "Bearer " + userAToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(logJson))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.taskType").value("PRUNING"));

        // Growth journal
        String journalJson = String.format("""
            {
                "userPlantId": "%s",
                "entryType": "GROWTH",
                "healthStatus": "HEALTHY",
                "note": "Cây phát triển rất tốt"
            }
            """, plantA.getId());

        String journalResp = mockMvc.perform(post("/api/v1/journals")
                .header("Authorization", "Bearer " + userAToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(journalJson))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.success").value(true))
            .andReturn().getResponse().getContentAsString();

        int idIdx = journalResp.indexOf("\"id\":\"");
        String journalId = journalResp.substring(idIdx + 6, idIdx + 42);

        // User B cannot delete user A's journal
        mockMvc.perform(delete("/api/v1/journals/" + journalId)
                .header("Authorization", "Bearer " + userBToken))
            .andExpect(status().isForbidden());
    }

    @Test
    void adminUsersEndpoint_Security_And_Functionality() throws Exception {
        // Regular user cannot access /api/v1/admin/users -> 403
        mockMvc.perform(get("/api/v1/admin/users")
                .header("Authorization", "Bearer " + userAToken))
            .andExpect(status().isForbidden());

        // Admin can access /api/v1/admin/users -> 200
        mockMvc.perform(get("/api/v1/admin/users")
                .header("Authorization", "Bearer " + adminToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.content").isArray());

        // Admin can update user status -> 200
        mockMvc.perform(patch("/api/v1/admin/users/" + userB.getId() + "/status")
                .header("Authorization", "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"INACTIVE\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.newStatus").value("INACTIVE"));
    }
}
