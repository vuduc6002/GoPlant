package com.cmc.plant_care_backend.controller;

import com.cmc.plant_care_backend.model.Role;
import com.cmc.plant_care_backend.model.User;
import com.cmc.plant_care_backend.model.enums.UserStatus;
import com.cmc.plant_care_backend.repository.RoleRepository;
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

import java.util.UUID;

import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
class GardenSecurityIntegrationTest {

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private JwtService jwtService;

    private MockMvc mockMvc;
    private String userToken;
    private String adminToken;
    private User testUser;
    private User testAdmin;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context)
            .apply(springSecurity())
            .build();

        Role roleUser = roleRepository.findByName("ROLE_USER")
            .orElseGet(() -> roleRepository.save(new Role("ROLE_USER")));
        Role roleAdmin = roleRepository.findByName("ROLE_ADMIN")
            .orElseGet(() -> roleRepository.save(new Role("ROLE_ADMIN")));

        testUser = new User();
        testUser.setFullName("Regular User");
        testUser.setEmail("reg_" + UUID.randomUUID() + "@goplant.com");
        testUser.setPasswordHash("hashed_pw");
        testUser.setStatus(UserStatus.ACTIVE);
        testUser.getRoles().add(roleUser);
        testUser = userRepository.save(testUser);

        testAdmin = new User();
        testAdmin.setFullName("Admin User");
        testAdmin.setEmail("adm_" + UUID.randomUUID() + "@goplant.com");
        testAdmin.setPasswordHash("hashed_pw");
        testAdmin.setStatus(UserStatus.ACTIVE);
        testAdmin.getRoles().add(roleAdmin);
        testAdmin = userRepository.save(testAdmin);

        userToken = jwtService.generateToken(UserPrincipal.create(testUser));
        adminToken = jwtService.generateToken(UserPrincipal.create(testAdmin));
    }

    @Test
    void accessGardens_WithoutToken_ShouldReturn401Unauthorized() throws Exception {
        mockMvc.perform(get("/api/v1/gardens"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
    }

    @Test
    void accessAdminSpecies_WithRegularUserToken_ShouldReturn403Forbidden() throws Exception {
        mockMvc.perform(get("/api/v1/admin/species")
                .header("Authorization", "Bearer " + userToken))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
    }

    @Test
    void accessAdminSpecies_WithAdminToken_ShouldSucceed() throws Exception {
        mockMvc.perform(get("/api/v1/admin/species")
                .header("Authorization", "Bearer " + adminToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    void gardenLifecycle_AndOwnershipProtection_ShouldWork() throws Exception {
        // 1. Create garden as testUser
        String createGardenJson = "{\"name\":\"Vườn Hồng\",\"location\":\"Sân Thượng\",\"spaceType\":\"SAN_THUONG\"}";

        String responseStr = mockMvc.perform(post("/api/v1/gardens")
                .header("Authorization", "Bearer " + userToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(createGardenJson))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.name").value("Vườn Hồng"))
            .andReturn().getResponse().getContentAsString();

        // Extract garden ID from response
        int idIdx = responseStr.indexOf("\"id\":\"");
        String gardenIdStr = responseStr.substring(idIdx + 6, idIdx + 42);

        // 2. Get gardens as testUser - should contain 1 garden
        mockMvc.perform(get("/api/v1/gardens")
                .header("Authorization", "Bearer " + userToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].name").value("Vườn Hồng"));

        // 3. User B (admin acting as another user) attempting to access User A's garden should return 403 Forbidden
        mockMvc.perform(get("/api/v1/gardens/" + gardenIdStr)
                .header("Authorization", "Bearer " + adminToken))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));

        // 4. Owner accessing own garden should succeed
        mockMvc.perform(get("/api/v1/gardens/" + gardenIdStr)
                .header("Authorization", "Bearer " + userToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.id").value(gardenIdStr));
    }
}
