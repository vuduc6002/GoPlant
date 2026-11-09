package com.cmc.plant_care_backend.controller;

import com.cmc.plant_care_backend.dto.schedule.CompleteCareRequest;
import com.cmc.plant_care_backend.model.*;
import com.cmc.plant_care_backend.model.enums.Frequency;
import com.cmc.plant_care_backend.model.enums.HealthStatus;
import com.cmc.plant_care_backend.model.enums.ScheduleStatus;
import com.cmc.plant_care_backend.model.enums.TaskType;
import com.cmc.plant_care_backend.model.enums.UserStatus;
import com.cmc.plant_care_backend.repository.*;
import com.cmc.plant_care_backend.security.JwtService;
import com.cmc.plant_care_backend.security.UserPrincipal;
import com.cmc.plant_care_backend.service.ScheduleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
class ScheduleConcurrencyAndUtcIntegrationTest {

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
    private PlantSpeciesRepository plantSpeciesRepository;

    @Autowired
    private UserPlantRepository userPlantRepository;

    @Autowired
    private CareScheduleRepository careScheduleRepository;

    @Autowired
    private CareLogRepository careLogRepository;

    @Autowired
    private ScheduleService scheduleService;

    @Autowired
    private JwtService jwtService;

    private MockMvc mockMvc;
    private User testUser;
    private String token;
    private Garden testGarden;
    private PlantSpecies testSpecies;
    private UserPlant testPlant;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context)
            .apply(springSecurity())
            .build();

        Role roleUser = roleRepository.findByName("ROLE_USER")
            .orElseGet(() -> roleRepository.save(new Role("ROLE_USER")));

        testUser = new User();
        testUser.setFullName("Concurrency Tester");
        testUser.setEmail("tester_" + UUID.randomUUID() + "@goplant.com");
        testUser.setPasswordHash("hashed_pw");
        testUser.setStatus(UserStatus.ACTIVE);
        testUser.getRoles().add(roleUser);
        testUser = userRepository.save(testUser);

        token = jwtService.generateToken(UserPrincipal.create(testUser));

        testGarden = new Garden();
        testGarden.setName("Vườn Thử Nghiệm");
        testGarden.setLocation("Ban Công Tầng 1");
        testGarden.setOwner(testUser);
        testGarden = gardenRepository.save(testGarden);

        testSpecies = new PlantSpecies();
        testSpecies.setCommonName("Húng Quế");
        testSpecies.setScientificName("Ocimum basilicum");
        testSpecies.setCategory("Rau gia vị");
        testSpecies = plantSpeciesRepository.save(testSpecies);

        testPlant = new UserPlant();
        testPlant.setSpecies(testSpecies);
        testPlant.setDisplayName("Húng Quế Chậu 1");
        testPlant.setGarden(testGarden);
        testPlant.setOwner(testUser);
        testPlant.setHealthStatus(HealthStatus.HEALTHY);
        testPlant.setPlantedAt(LocalDate.now(VN_ZONE));
        testPlant = userPlantRepository.save(testPlant);
    }

    @Test
    void testConcurrentComplete_ShouldExecuteOnce_AndRejectSecond() throws Exception {
        // Create an overdue schedule
        CareSchedule schedule = new CareSchedule();
        schedule.setUserPlant(testPlant);
        schedule.setOwner(testUser);
        schedule.setTaskType(TaskType.WATERING);
        schedule.setFrequency(Frequency.DAILY);
        schedule.setStartDate(LocalDate.now(VN_ZONE).minusDays(1));
        schedule.setNextScheduledAt(OffsetDateTime.now(ZoneOffset.UTC).minusHours(2));
        schedule.setStatus(ScheduleStatus.ACTIVE);
        schedule = careScheduleRepository.save(schedule);

        UUID scheduleId = schedule.getId();

        int numThreads = 2;
        ExecutorService executor = Executors.newFixedThreadPool(numThreads);
        CountDownLatch readyLatch = new CountDownLatch(numThreads);
        CountDownLatch startLatch = new CountDownLatch(1);
        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger failureCount = new AtomicInteger(0);

        for (int i = 0; i < numThreads; i++) {
            executor.submit(() -> {
                readyLatch.countDown();
                try {
                    startLatch.await();
                    scheduleService.completeSchedule(scheduleId, testUser.getId(), new CompleteCareRequest());
                    successCount.incrementAndGet();
                } catch (Exception e) {
                    failureCount.incrementAndGet();
                }
            });
        }

        readyLatch.await(5, TimeUnit.SECONDS);
        startLatch.countDown(); // start both simultaneously
        executor.shutdown();
        boolean finished = executor.awaitTermination(10, TimeUnit.SECONDS);
        assertTrue(finished, "Concurrent execution should complete within 10 seconds");

        // Exactly one request must succeed, and one must be rejected (due to lock & status guard)
        assertEquals(1, successCount.get(), "Exactly one concurrent complete request must succeed");
        assertEquals(1, failureCount.get(), "The duplicate concurrent complete request must be rejected");

        // Exactly one CareLog must be created
        List<CareLog> logs = careLogRepository.findByPerformedById(testUser.getId());
        long scheduleLogsCount = logs.stream()
            .filter(l -> l.getSchedule() != null && l.getSchedule().getId().equals(scheduleId))
            .count();
        assertEquals(1, scheduleLogsCount, "Exactly 1 CareLog must be created, no duplicates");
    }

    @Test
    void testUtcTimestamp_AndIsOverdueNaming_InAllEndpoints() throws Exception {
        LocalDate todayVn = LocalDate.now(VN_ZONE);

        // 1. POST /api/v1/schedules
        String createJson = String.format("""
            {
                "userPlantId": "%s",
                "taskType": "WATERING",
                "frequency": "DAILY",
                "startDate": "%s",
                "reminderTime": "08:00:00"
            }
            """, testPlant.getId(), todayVn);

        String createResp = mockMvc.perform(post("/api/v1/schedules")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(createJson))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.nextScheduledAt").value(endsWith("Z")))
            .andExpect(jsonPath("$.data.isOverdue").isBoolean())
            .andExpect(jsonPath("$.data.overdue").doesNotExist())
            .andReturn().getResponse().getContentAsString();

        int idIdx = createResp.indexOf("\"id\":\"");
        String scheduleId = createResp.substring(idIdx + 6, idIdx + 42);

        // 2. PUT /api/v1/schedules/{scheduleId}
        String updateJson = """
            {
                "taskLabel": "Nhãn tưới sáng",
                "frequency": "CUSTOM",
                "intervalDays": 2
            }
            """;

        mockMvc.perform(put("/api/v1/schedules/" + scheduleId)
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(updateJson))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.nextScheduledAt").value(endsWith("Z")))
            .andExpect(jsonPath("$.data.isOverdue").isBoolean())
            .andExpect(jsonPath("$.data.overdue").doesNotExist());

        // 3. GET /api/v1/schedules/today
        mockMvc.perform(get("/api/v1/schedules/today")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data").isArray());

        // 4. GET /api/v1/plants/{plantId}/schedules
        mockMvc.perform(get("/api/v1/plants/" + testPlant.getId() + "/schedules")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.content[0].nextScheduledAt").value(endsWith("Z")))
            .andExpect(jsonPath("$.data.content[0].isOverdue").isBoolean())
            .andExpect(jsonPath("$.data.content[0].overdue").doesNotExist());

        // Make schedule overdue so complete and skip can be tested
        CareSchedule dbSchedule = careScheduleRepository.findById(UUID.fromString(scheduleId)).orElseThrow();
        dbSchedule.setNextScheduledAt(OffsetDateTime.now(ZoneOffset.UTC).minusHours(1));
        careScheduleRepository.save(dbSchedule);

        // 5. POST /api/v1/schedules/{scheduleId}/complete
        mockMvc.perform(post("/api/v1/schedules/" + scheduleId + "/complete")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"note\":\"Đã hoàn thành tưới\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.nextScheduledAt").value(endsWith("Z")));

        // Attempting to complete again immediately (nextScheduledAt is now in future) -> 409 Conflict
        mockMvc.perform(post("/api/v1/schedules/" + scheduleId + "/complete")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("CONFLICT"));

        // Make overdue again to test skip
        dbSchedule = careScheduleRepository.findById(UUID.fromString(scheduleId)).orElseThrow();
        dbSchedule.setNextScheduledAt(OffsetDateTime.now(ZoneOffset.UTC).minusHours(1));
        careScheduleRepository.save(dbSchedule);

        // 6. POST /api/v1/schedules/{scheduleId}/skip
        mockMvc.perform(post("/api/v1/schedules/" + scheduleId + "/skip")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"note\":\"Bỏ qua hôm nay\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.nextScheduledAt").value(endsWith("Z")));
    }

    @Test
    void testStrictValidation_ViaApi() throws Exception {
        LocalDate todayVn = LocalDate.now(VN_ZONE);

        // Invalid reminderTime -> 400
        mockMvc.perform(post("/api/v1/schedules")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(String.format("""
                    {
                        "userPlantId": "%s",
                        "taskType": "WATERING",
                        "frequency": "DAILY",
                        "startDate": "%s",
                        "reminderTime": "sai_gio"
                    }
                    """, testPlant.getId(), todayVn)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

        // Blank reminderTime -> 400
        mockMvc.perform(post("/api/v1/schedules")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(String.format("""
                    {
                        "userPlantId": "%s",
                        "taskType": "WATERING",
                        "frequency": "DAILY",
                        "startDate": "%s",
                        "reminderTime": "   "
                    }
                    """, testPlant.getId(), todayVn)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

        // DAILY with intervalDays -> 400
        mockMvc.perform(post("/api/v1/schedules")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(String.format("""
                    {
                        "userPlantId": "%s",
                        "taskType": "WATERING",
                        "frequency": "DAILY",
                        "intervalDays": 3,
                        "startDate": "%s"
                    }
                    """, testPlant.getId(), todayVn)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

        // CUSTOM missing intervalDays -> 400
        mockMvc.perform(post("/api/v1/schedules")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(String.format("""
                    {
                        "userPlantId": "%s",
                        "taskType": "WATERING",
                        "frequency": "CUSTOM",
                        "startDate": "%s"
                    }
                    """, testPlant.getId(), todayVn)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

        // CUSTOM intervalDays <= 0 -> 400
        mockMvc.perform(post("/api/v1/schedules")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(String.format("""
                    {
                        "userPlantId": "%s",
                        "taskType": "WATERING",
                        "frequency": "CUSTOM",
                        "intervalDays": 0,
                        "startDate": "%s"
                    }
                    """, testPlant.getId(), todayVn)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }
}
