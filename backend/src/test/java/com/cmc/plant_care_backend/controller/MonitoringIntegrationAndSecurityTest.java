package com.cmc.plant_care_backend.controller;

import com.cmc.plant_care_backend.dto.carelog.CreateCareLogRequest;
import com.cmc.plant_care_backend.dto.journal.CreateGrowthJournalRequest;
import com.cmc.plant_care_backend.dto.plant.CreateUserPlantRequest;
import com.cmc.plant_care_backend.dto.plant.UserPlantDetailResponse;
import com.cmc.plant_care_backend.dto.schedule.CompleteCareRequest;
import com.cmc.plant_care_backend.dto.schedule.CreateScheduleRequest;
import com.cmc.plant_care_backend.dto.schedule.SkipCareRequest;
import com.cmc.plant_care_backend.model.*;
import com.cmc.plant_care_backend.model.enums.*;
import com.cmc.plant_care_backend.repository.*;
import com.cmc.plant_care_backend.security.JwtService;
import com.cmc.plant_care_backend.security.UserPrincipal;
import com.cmc.plant_care_backend.service.CareLogService;
import com.cmc.plant_care_backend.service.GrowthJournalService;
import com.cmc.plant_care_backend.service.PlantService;
import com.cmc.plant_care_backend.service.ScheduleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.reset;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
class MonitoringIntegrationAndSecurityTest {

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
    private GrowthJournalRepository growthJournalRepository;

    @Autowired
    private PlantService plantService;

    @Autowired
    private ScheduleService scheduleService;

    @Autowired
    private CareLogService careLogService;

    @Autowired
    private GrowthJournalService growthJournalService;

    @Autowired
    private JwtService jwtService;

    @MockitoBean
    private Clock clock;

    private MockMvc mockMvc;
    private Role roleUser;
    private PlantSpecies richSpecies;
    private PlantSpecies partialSpecies;
    private User userA;
    private User userB;
    private String userAToken;
    private String userBToken;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context)
            .apply(springSecurity())
            .build();

        setClock(Instant.now().plusSeconds(300));

        roleUser = roleRepository.findByName("ROLE_USER")
            .orElseGet(() -> roleRepository.save(new Role("ROLE_USER")));

        userA = createUser("Alice Monitoring");
        userB = createUser("Bob Monitoring");
        userAToken = jwtService.generateToken(UserPrincipal.create(userA));
        userBToken = jwtService.generateToken(UserPrincipal.create(userB));

        richSpecies = new PlantSpecies();
        richSpecies.setCommonName("Cà Chua Bi " + UUID.randomUUID().toString().substring(0, 6));
        richSpecies.setScientificName("Solanum lycopersicum var. cerasiforme");
        richSpecies.setCategory("Rau ăn quả");
        richSpecies.setLightRequirement("Ánh sáng đầy đủ 6-8 giờ/ngày");
        richSpecies.setWaterRequirement("Tưới giữ ẩm đều, tránh úng rễ");
        richSpecies.setWateringFrequency("1-2 ngày/lần");
        richSpecies.setTemperatureRange("20-30°C");
        richSpecies.setHumidityRange("60-75%");
        richSpecies.setSoilPh("6.0 - 6.8");
        richSpecies.setUsageAndCaution("Làm quả tươi; tránh để lá ướt vào ban đêm.");
        richSpecies = plantSpeciesRepository.save(richSpecies);

        partialSpecies = new PlantSpecies();
        partialSpecies.setCommonName("Lan Ý " + UUID.randomUUID().toString().substring(0, 6));
        partialSpecies.setScientificName("Spathiphyllum wallisii");
        partialSpecies.setCategory("Cây nội thất");
        partialSpecies.setLightRequirement("Ánh sáng gián tiếp dịu nhẹ");
        partialSpecies.setWaterRequirement("   ");
        partialSpecies.setWateringFrequency(null);
        partialSpecies.setTemperatureRange("18-27°C");
        partialSpecies.setHumidityRange(null);
        partialSpecies.setSoilPh("");
        partialSpecies.setUsageAndCaution("Có thể gây kích ứng nếu vật nuôi nhai phải lá.");
        partialSpecies = plantSpeciesRepository.save(partialSpecies);
    }

    private void setClock(Instant instant) {
        reset(clock);
        lenient().doReturn(instant).when(clock).instant();
        lenient().doReturn(ZoneOffset.UTC).when(clock).getZone();
        lenient().doAnswer(inv -> Clock.fixed(instant, inv.getArgument(0)))
            .when(clock)
            .withZone(any());
    }

    private User createUser(String fullName) {
        User u = new User();
        u.setFullName(fullName);
        u.setEmail("mon_" + UUID.randomUUID() + "@goplant.com");
        u.setPasswordHash("hashed_pw");
        u.setStatus(UserStatus.ACTIVE);
        u.getRoles().add(roleUser);
        return userRepository.save(u);
    }

    private Garden createGarden(User owner, String name, String location) {
        Garden g = new Garden();
        g.setOwner(owner);
        g.setName(name);
        g.setLocation(location);
        return gardenRepository.save(g);
    }

    private UserPlant createPlant(
        User owner,
        Garden garden,
        PlantSpecies species,
        String displayName,
        HealthStatus status,
        LocalDate plantedAt
    ) {
        UserPlant p = new UserPlant();
        p.setOwner(owner);
        p.setGarden(garden);
        p.setSpecies(species);
        p.setDisplayName(displayName);
        p.setHealthStatus(status);
        p.setPlantedAt(plantedAt);
        return userPlantRepository.save(p);
    }

    private CareSchedule createScheduleEntity(
        User owner,
        UserPlant plant,
        TaskType taskType,
        ScheduleStatus status,
        OffsetDateTime nextScheduledAt
    ) {
        CareSchedule s = new CareSchedule();
        s.setOwner(owner);
        s.setUserPlant(plant);
        s.setTaskType(taskType);
        s.setFrequency(Frequency.DAILY);
        s.setStartDate(LocalDate.of(2026, 6, 1));
        s.setStatus(status);
        s.setNextScheduledAt(nextScheduledAt);
        return careScheduleRepository.save(s);
    }

    private CareLog createCareLogEntity(
        User performedBy,
        UserPlant plant,
        CareSchedule schedule,
        String taskType,
        CareLogStatus status,
        String note,
        OffsetDateTime performedAt
    ) {
        CareLog log = new CareLog();
        log.setPerformedBy(performedBy);
        log.setUserPlant(plant);
        log.setSchedule(schedule);
        log.setTaskType(taskType);
        log.setStatus(status);
        log.setNote(note);
        log.setPerformedAt(performedAt);
        return careLogRepository.save(log);
    }

    private GrowthJournal createJournalEntity(
        User author,
        UserPlant plant,
        EntryType entryType,
        JournalHealthStatus healthStatus,
        String note,
        OffsetDateTime recordedAt
    ) {
        GrowthJournal j = new GrowthJournal();
        j.setAuthor(author);
        j.setUserPlant(plant);
        j.setEntryType(entryType);
        j.setHealthStatus(healthStatus);
        j.setNote(note);
        j.setRecordedAt(recordedAt);
        return growthJournalRepository.save(j);
    }

    private void assertNoForbiddenCareLogMetricsKeys(String body) {
        assertFalse(body.contains("manualCompletedLogs"), "Response must not expose manualCompletedLogs");
        assertFalse(body.contains("manualSkippedLogs"), "Response must not expose manualSkippedLogs");
        assertFalse(body.contains("CARE_LOG_MANUAL"), "Response must not expose CARE_LOG_MANUAL");
        assertFalse(body.contains("CARE_LOG_SCHEDULED"), "Response must not expose CARE_LOG_SCHEDULED");
        assertFalse(body.toLowerCase().contains("adherence"), "Response must not expose adherence metric");
    }

    @Test
    void overview_Unauthenticated_Returns401() throws Exception {
        mockMvc.perform(get("/api/v1/monitoring/overview"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void overview_EmptyUser_ReturnsZerosEmptyCollectionsAndSensorFalse() throws Exception {
        User emptyUser = createUser("Empty User");
        String emptyToken = jwtService.generateToken(UserPrincipal.create(emptyUser));

        String body = mockMvc.perform(get("/api/v1/monitoring/overview")
                .header("Authorization", "Bearer " + emptyToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.gardensCount").value(0))
            .andExpect(jsonPath("$.data.plantsCount").value(0))
            .andExpect(jsonPath("$.data.healthDistribution.healthyCount").value(0))
            .andExpect(jsonPath("$.data.healthDistribution.needsAttentionCount").value(0))
            .andExpect(jsonPath("$.data.healthDistribution.criticalCount").value(0))
            .andExpect(jsonPath("$.data.healthDistribution.unknownCount").value(0))
            .andExpect(jsonPath("$.data.schedulesSummary.activeCount").value(0))
            .andExpect(jsonPath("$.data.schedulesSummary.dueTodayCount").value(0))
            .andExpect(jsonPath("$.data.schedulesSummary.overdueCount").value(0))
            .andExpect(jsonPath("$.data.careLogsSummary7d.unlinkedCompletedLogs").value(0))
            .andExpect(jsonPath("$.data.careLogsSummary7d.unlinkedSkippedLogs").value(0))
            .andExpect(jsonPath("$.data.careLogsSummary7d.linkedScheduledCompletedLogs").value(0))
            .andExpect(jsonPath("$.data.careLogsSummary7d.linkedScheduledSkippedLogs").value(0))
            .andExpect(jsonPath("$.data.careLogsSummary30d.unlinkedCompletedLogs").value(0))
            .andExpect(jsonPath("$.data.careLogsSummary30d.unlinkedSkippedLogs").value(0))
            .andExpect(jsonPath("$.data.careLogsSummary30d.linkedScheduledCompletedLogs").value(0))
            .andExpect(jsonPath("$.data.careLogsSummary30d.linkedScheduledSkippedLogs").value(0))
            .andExpect(jsonPath("$.data.attentionPlants").isArray())
            .andExpect(jsonPath("$.data.attentionPlants", hasSize(0)))
            .andExpect(jsonPath("$.data.gardensSummary").isArray())
            .andExpect(jsonPath("$.data.gardensSummary", hasSize(0)))
            .andExpect(jsonPath("$.data.sensorConnected").value(false))
            .andExpect(jsonPath("$.data.generatedAt").value(endsWith("Z")))
            .andReturn().getResponse().getContentAsString();

        assertNoForbiddenCareLogMetricsKeys(body);
    }

    @Test
    void overview_AuthenticatedWithData_AndUserIsolation_AndAttentionLimitCap() throws Exception {
        Instant fixedNow = Instant.parse("2026-06-15T05:00:00Z"); // 2026-06-15T12:00:00+07:00
        setClock(fixedNow);
        OffsetDateTime nowUtc = OffsetDateTime.ofInstant(fixedNow, ZoneOffset.UTC);

        // User A gardens: Garden 1 (with plants), Garden 2 (empty 0 plants)
        Garden gA1 = createGarden(userA, "Vườn Ban Công A", "Tầng 2");
        Garden gA2 = createGarden(userA, "Vườn Sân Thượng A", "Tầng 4");

        // 1 healthy, 1 unknown, 2 critical, 10 needs_attention (total = 14 plants, 12 attention -> capped at 10)
        UserPlant pHealthy = createPlant(userA, gA1, richSpecies, "Cà Chua Khỏe", HealthStatus.HEALTHY, LocalDate.of(2026, 6, 1));
        createPlant(userA, gA1, richSpecies, "Cây Chưa Xác Định", HealthStatus.UNKNOWN, null);
        createPlant(userA, gA1, richSpecies, "Cây Nguy Kịch 1", HealthStatus.CRITICAL, LocalDate.of(2026, 5, 1));
        createPlant(userA, gA1, partialSpecies, "Cây Nguy Kịch 2", HealthStatus.CRITICAL, LocalDate.of(2026, 5, 2));
        for (int i = 1; i <= 10; i++) {
            createPlant(userA, gA1, richSpecies, "Cây Cần Chú Ý " + i, HealthStatus.NEEDS_ATTENTION, LocalDate.of(2026, 5, 10));
        }

        // User B data must NEVER leak into User A overview
        Garden gB = createGarden(userB, "Vườn Bí Mật User B", "Sân sau");
        UserPlant pB = createPlant(userB, gB, richSpecies, "Cây Bí Mật User B", HealthStatus.CRITICAL, LocalDate.of(2026, 6, 1));
        createScheduleEntity(userB, pB, TaskType.WATERING, ScheduleStatus.ACTIVE, nowUtc.minusHours(3));
        createCareLogEntity(userB, pB, null, "WATERING", CareLogStatus.COMPLETED, "Log user B", nowUtc.minusHours(1));

        // User A active schedule & logs
        CareSchedule activeDueToday = createScheduleEntity(userA, pHealthy, TaskType.WATERING, ScheduleStatus.ACTIVE, nowUtc.plusMinutes(30));
        createScheduleEntity(userA, pHealthy, TaskType.PRUNING, ScheduleStatus.ACTIVE, nowUtc.minusHours(2));
        createCareLogEntity(userA, pHealthy, activeDueToday, "WATERING", CareLogStatus.COMPLETED, "User A log", nowUtc.minusDays(2));

        String responseBody = mockMvc.perform(get("/api/v1/monitoring/overview")
                .header("Authorization", "Bearer " + userAToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.gardensCount").value(2))
            .andExpect(jsonPath("$.data.plantsCount").value(14))
            .andExpect(jsonPath("$.data.healthDistribution.healthyCount").value(1))
            .andExpect(jsonPath("$.data.healthDistribution.needsAttentionCount").value(10))
            .andExpect(jsonPath("$.data.healthDistribution.criticalCount").value(2))
            .andExpect(jsonPath("$.data.healthDistribution.unknownCount").value(1))
            .andExpect(jsonPath("$.data.schedulesSummary.activeCount").value(2))
            .andExpect(jsonPath("$.data.schedulesSummary.dueTodayCount").value(1))
            .andExpect(jsonPath("$.data.schedulesSummary.overdueCount").value(1))
            .andExpect(jsonPath("$.data.careLogsSummary7d.linkedScheduledCompletedLogs").value(1))
            .andExpect(jsonPath("$.data.careLogsSummary30d.linkedScheduledCompletedLogs").value(1))
            .andExpect(jsonPath("$.data.gardensSummary", hasSize(2)))
            .andExpect(jsonPath("$.data.gardensSummary[0].gardenId").value(gA1.getId().toString()))
            .andExpect(jsonPath("$.data.gardensSummary[0].plantCount").value(14))
            .andExpect(jsonPath("$.data.gardensSummary[0].attentionCount").value(12))
            .andExpect(jsonPath("$.data.gardensSummary[1].gardenId").value(gA2.getId().toString()))
            .andExpect(jsonPath("$.data.gardensSummary[1].plantCount").value(0))
            .andExpect(jsonPath("$.data.gardensSummary[1].attentionCount").value(0))
            .andExpect(jsonPath("$.data.attentionPlants", hasSize(10)))
            .andExpect(jsonPath("$.data.attentionPlants[0].healthStatus").value("CRITICAL"))
            .andExpect(jsonPath("$.data.attentionPlants[1].healthStatus").value("CRITICAL"))
            .andExpect(jsonPath("$.data.attentionPlants[2].healthStatus").value("NEEDS_ATTENTION"))
            .andExpect(jsonPath("$.data.sensorConnected").value(false))
            .andExpect(jsonPath("$.data.generatedAt").value(endsWith("Z")))
            .andReturn().getResponse().getContentAsString();

        assertFalse(responseBody.contains("Vườn Bí Mật User B"));
        assertFalse(responseBody.contains("Cây Bí Mật User B"));
        assertNoForbiddenCareLogMetricsKeys(responseBody);

        // User B overview sees only User B data
        mockMvc.perform(get("/api/v1/monitoring/overview")
                .header("Authorization", "Bearer " + userBToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.gardensCount").value(1))
            .andExpect(jsonPath("$.data.plantsCount").value(1))
            .andExpect(jsonPath("$.data.healthDistribution.criticalCount").value(1))
            .andExpect(jsonPath("$.data.gardensSummary[0].name").value("Vườn Bí Mật User B"))
            .andExpect(jsonPath("$.data.attentionPlants", hasSize(1)))
            .andExpect(jsonPath("$.data.attentionPlants[0].plantId").value(pB.getId().toString()));
    }

    @Test
    void plantDetail_OwnershipAndValidationMatrix_200_403_404_400_401() throws Exception {
        Garden gardenA = createGarden(userA, "Vườn A", "Sân");
        UserPlant plantA = createPlant(userA, gardenA, richSpecies, "Cà Chua A", HealthStatus.HEALTHY, LocalDate.now(VN_ZONE));

        // 401 Unauthenticated
        mockMvc.perform(get("/api/v1/monitoring/plants/" + plantA.getId()))
            .andExpect(status().isUnauthorized());

        // 400 Invalid UUID
        mockMvc.perform(get("/api/v1/monitoring/plants/not-a-uuid")
                .header("Authorization", "Bearer " + userAToken))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
            .andExpect(jsonPath("$.error.field").value("plantId"));

        // 404 Non-existent UUID
        mockMvc.perform(get("/api/v1/monitoring/plants/" + UUID.randomUUID())
                .header("Authorization", "Bearer " + userAToken))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("RESOURCE_NOT_FOUND"));

        // 403 User B accessing User A's plant
        mockMvc.perform(get("/api/v1/monitoring/plants/" + plantA.getId())
                .header("Authorization", "Bearer " + userBToken))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));

        // 200 Owner accessing own plant
        mockMvc.perform(get("/api/v1/monitoring/plants/" + plantA.getId())
                .header("Authorization", "Bearer " + userAToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.plantId").value(plantA.getId().toString()))
            .andExpect(jsonPath("$.data.displayName").value("Cà Chua A"))
            .andExpect(jsonPath("$.data.garden.id").value(gardenA.getId().toString()))
            .andExpect(jsonPath("$.data.species.id").value(richSpecies.getId().toString()))
            .andExpect(jsonPath("$.data.sensorConnected").value(false))
            .andExpect(jsonPath("$.data.generatedAt").value(endsWith("Z")));
    }

    @Test
    void careLog_FourBucketSemantics_AndScheduleDeletionDetach() throws Exception {
        Garden gardenA = createGarden(userA, "Vườn Lịch A", "Sân thượng");
        UserPlant plantA = createPlant(userA, gardenA, richSpecies, "Cà Chua CareLog", HealthStatus.HEALTHY, LocalDate.now(VN_ZONE));

        // 1. Unlinked COMPLETED via CareLogService
        CreateCareLogRequest manualLogReq = new CreateCareLogRequest();
        manualLogReq.setUserPlantId(plantA.getId());
        manualLogReq.setTaskType("PRUNING");
        manualLogReq.setNote("Tỉa lá già thủ công");
        careLogService.createCareLog(userA.getId(), manualLogReq);

        // 2. Unlinked SKIPPED row (schedule = null, status = SKIPPED)
        createCareLogEntity(userA, plantA, null, "MISTING", CareLogStatus.SKIPPED, "Trời mưa không phun", OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(5));

        // 3 & 4. Create DAILY schedule, trigger complete + skip via ScheduleService
        CreateScheduleRequest schedReq = new CreateScheduleRequest();
        schedReq.setUserPlantId(plantA.getId());
        schedReq.setTaskType(TaskType.WATERING);
        schedReq.setFrequency(Frequency.DAILY);
        schedReq.setStartDate(LocalDate.now(VN_ZONE));
        schedReq.setReminderTime("00:00:00");
        UUID scheduleId = scheduleService.createSchedule(userA.getId(), schedReq).getId();

        // Make schedule due for complete
        CareSchedule sched = careScheduleRepository.findById(scheduleId).orElseThrow();
        sched.setNextScheduledAt(OffsetDateTime.now(ZoneOffset.UTC).minusHours(2));
        careScheduleRepository.save(sched);

        CompleteCareRequest completeReq = new CompleteCareRequest();
        completeReq.setNote("Đã tưới theo lịch");
        scheduleService.completeSchedule(scheduleId, userA.getId(), completeReq);

        // Make due again for skip
        sched = careScheduleRepository.findById(scheduleId).orElseThrow();
        sched.setNextScheduledAt(OffsetDateTime.now(ZoneOffset.UTC).minusHours(1));
        careScheduleRepository.save(sched);

        SkipCareRequest skipReq = new SkipCareRequest();
        skipReq.setNote("Bỏ qua theo lịch");
        scheduleService.skipSchedule(scheduleId, userA.getId(), skipReq);

        // Ensure fixed clock is strictly >= all performedAt instants recorded above
        setClock(Instant.now().plusSeconds(10));

        // Verify BEFORE schedule deletion
        String beforeOverview = mockMvc.perform(get("/api/v1/monitoring/overview")
                .header("Authorization", "Bearer " + userAToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.careLogsSummary7d.unlinkedCompletedLogs").value(1))
            .andExpect(jsonPath("$.data.careLogsSummary7d.unlinkedSkippedLogs").value(1))
            .andExpect(jsonPath("$.data.careLogsSummary7d.linkedScheduledCompletedLogs").value(1))
            .andExpect(jsonPath("$.data.careLogsSummary7d.linkedScheduledSkippedLogs").value(1))
            .andExpect(jsonPath("$.data.careLogsSummary30d.unlinkedCompletedLogs").value(1))
            .andExpect(jsonPath("$.data.careLogsSummary30d.unlinkedSkippedLogs").value(1))
            .andExpect(jsonPath("$.data.careLogsSummary30d.linkedScheduledCompletedLogs").value(1))
            .andExpect(jsonPath("$.data.careLogsSummary30d.linkedScheduledSkippedLogs").value(1))
            .andReturn().getResponse().getContentAsString();
        assertNoForbiddenCareLogMetricsKeys(beforeOverview);

        String beforeDetail = mockMvc.perform(get("/api/v1/monitoring/plants/" + plantA.getId())
                .header("Authorization", "Bearer " + userAToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.careLogsSummary30d.unlinkedCompletedLogs").value(1))
            .andExpect(jsonPath("$.data.careLogsSummary30d.unlinkedSkippedLogs").value(1))
            .andExpect(jsonPath("$.data.careLogsSummary30d.linkedScheduledCompletedLogs").value(1))
            .andExpect(jsonPath("$.data.careLogsSummary30d.linkedScheduledSkippedLogs").value(1))
            .andExpect(jsonPath("$.data.recentActivityTimeline", hasSize(4)))
            .andExpect(jsonPath("$.data.recentActivityTimeline[*].sourceType",
                containsInAnyOrder("CARE_LOG_LINKED", "CARE_LOG_LINKED", "CARE_LOG_UNLINKED", "CARE_LOG_UNLINKED")))
            .andReturn().getResponse().getContentAsString();
        assertNoForbiddenCareLogMetricsKeys(beforeDetail);

        // Delete schedule -> CareLogRepository.detachSchedule sets schedule_id = NULL
        scheduleService.deleteSchedule(scheduleId, userA.getId());
        setClock(Instant.now().plusSeconds(15));

        // Verify AFTER schedule deletion: previously linked logs reclassify cleanly as unlinked
        mockMvc.perform(get("/api/v1/monitoring/overview")
                .header("Authorization", "Bearer " + userAToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.careLogsSummary7d.unlinkedCompletedLogs").value(2))
            .andExpect(jsonPath("$.data.careLogsSummary7d.unlinkedSkippedLogs").value(2))
            .andExpect(jsonPath("$.data.careLogsSummary7d.linkedScheduledCompletedLogs").value(0))
            .andExpect(jsonPath("$.data.careLogsSummary7d.linkedScheduledSkippedLogs").value(0))
            .andExpect(jsonPath("$.data.careLogsSummary30d.unlinkedCompletedLogs").value(2))
            .andExpect(jsonPath("$.data.careLogsSummary30d.unlinkedSkippedLogs").value(2))
            .andExpect(jsonPath("$.data.careLogsSummary30d.linkedScheduledCompletedLogs").value(0))
            .andExpect(jsonPath("$.data.careLogsSummary30d.linkedScheduledSkippedLogs").value(0));

        mockMvc.perform(get("/api/v1/monitoring/plants/" + plantA.getId())
                .header("Authorization", "Bearer " + userAToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.careLogsSummary30d.unlinkedCompletedLogs").value(2))
            .andExpect(jsonPath("$.data.careLogsSummary30d.unlinkedSkippedLogs").value(2))
            .andExpect(jsonPath("$.data.careLogsSummary30d.linkedScheduledCompletedLogs").value(0))
            .andExpect(jsonPath("$.data.careLogsSummary30d.linkedScheduledSkippedLogs").value(0))
            .andExpect(jsonPath("$.data.recentActivityTimeline", hasSize(4)))
            .andExpect(jsonPath("$.data.recentActivityTimeline[*].sourceType",
                everyItem(equalTo("CARE_LOG_UNLINKED"))));
    }

    @Test
    void healthProvenance_DefaultHealthy_AndJournalHealthNeverOverwritesUserPlantHealth() throws Exception {
        Garden gardenA = createGarden(userA, "Vườn Health Provenance", "Trong nhà");

        CreateUserPlantRequest createPlantReq = new CreateUserPlantRequest();
        createPlantReq.setSpeciesId(richSpecies.getId());
        createPlantReq.setDisplayName("Cây Mới Tạo Mặc Định");
        UserPlantDetailResponse createdPlant = plantService.createPlant(gardenA.getId(), userA.getId(), createPlantReq);
        assertEquals(HealthStatus.HEALTHY, createdPlant.getHealthStatus());

        CreateGrowthJournalRequest journalReq = new CreateGrowthJournalRequest();
        journalReq.setUserPlantId(createdPlant.getId());
        journalReq.setEntryType(EntryType.PEST);
        journalReq.setHealthStatus(JournalHealthStatus.CRITICAL);
        journalReq.setNote("Phát hiện rệp lá, ghi vào nhật ký.");
        growthJournalService.createJournal(userA.getId(), journalReq);

        setClock(Instant.now().plusSeconds(10));

        // UserPlant.healthStatus in DB must NOT be overwritten by GrowthJournal
        UserPlant dbPlant = userPlantRepository.findById(createdPlant.getId()).orElseThrow();
        assertEquals(HealthStatus.HEALTHY, dbPlant.getHealthStatus());

        // Overview continues to reflect UserPlant.healthStatus (HEALTHY=1, CRITICAL=0, attentionPlants empty)
        mockMvc.perform(get("/api/v1/monitoring/overview")
                .header("Authorization", "Bearer " + userAToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.plantsCount").value(1))
            .andExpect(jsonPath("$.data.healthDistribution.healthyCount").value(1))
            .andExpect(jsonPath("$.data.healthDistribution.criticalCount").value(0))
            .andExpect(jsonPath("$.data.attentionPlants", hasSize(0)));

        // Plant Detail separates profile healthStatus from journal healthStatus
        mockMvc.perform(get("/api/v1/monitoring/plants/" + createdPlant.getId())
                .header("Authorization", "Bearer " + userAToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.currentHealthStatus").value("HEALTHY"))
            .andExpect(jsonPath("$.data.recentJournalObservations", hasSize(1)))
            .andExpect(jsonPath("$.data.recentJournalObservations[0].healthStatus").value("CRITICAL"))
            .andExpect(jsonPath("$.data.recentActivityTimeline", hasSize(1)))
            .andExpect(jsonPath("$.data.recentActivityTimeline[0].sourceType").value("GROWTH_JOURNAL"))
            .andExpect(jsonPath("$.data.recentActivityTimeline[0].healthStatus").value("CRITICAL"));
    }

    @Test
    void timezoneBoundaries_AsiaHoChiMinh_ClockInjection_HalfOpenIntervals() throws Exception {
        // Fixed clock: 2026-06-15 17:00:00 +07:00 == 2026-06-15T10:00:00Z
        OffsetDateTime nowVn = OffsetDateTime.of(2026, 6, 15, 17, 0, 0, 0, ZoneOffset.ofHours(7));
        OffsetDateTime startOfTodayVn = OffsetDateTime.of(2026, 6, 15, 0, 0, 0, 0, ZoneOffset.ofHours(7));
        OffsetDateTime startOfTomorrowVn = OffsetDateTime.of(2026, 6, 16, 0, 0, 0, 0, ZoneOffset.ofHours(7));
        setClock(nowVn.toInstant());

        Garden gardenA = createGarden(userA, "Vườn VN Timezone", "Ban công");
        UserPlant plantA = createPlant(userA, gardenA, richSpecies, "Cây Múi Giờ VN", HealthStatus.HEALTHY, LocalDate.of(2026, 6, 1));

        // 2 overdue active schedules: startOfTodayVn and now - 1s
        createScheduleEntity(userA, plantA, TaskType.WATERING, ScheduleStatus.ACTIVE, startOfTodayVn);
        createScheduleEntity(userA, plantA, TaskType.PRUNING, ScheduleStatus.ACTIVE, nowVn.minusSeconds(1));

        // 2 dueToday active schedules: == now and 23:59:59.999999+07:00
        createScheduleEntity(userA, plantA, TaskType.MISTING, ScheduleStatus.ACTIVE, nowVn);
        createScheduleEntity(userA, plantA, TaskType.FERTILIZING, ScheduleStatus.ACTIVE, startOfTomorrowVn.minusNanos(1000));

        // 1 future active schedule: == startOfTomorrowVn -> neither overdue nor dueToday (proving [now, startOfTomorrowVn))
        createScheduleEntity(userA, plantA, TaskType.PEST_CHECK, ScheduleStatus.ACTIVE, startOfTomorrowVn);

        // Non-ACTIVE schedules must be excluded completely from all 3 counts
        createScheduleEntity(userA, plantA, TaskType.WATERING, ScheduleStatus.PAUSED, nowVn.minusDays(1));
        createScheduleEntity(userA, plantA, TaskType.WATERING, ScheduleStatus.COMPLETED, nowVn.minusHours(2));
        createScheduleEntity(userA, plantA, TaskType.WATERING, ScheduleStatus.CANCELLED, nowVn);

        // CareLogs rolling window boundary checks:
        // At exact now -> included in 7d & 30d (unlinked COMPLETED)
        createCareLogEntity(userA, plantA, null, "WATERING", CareLogStatus.COMPLETED, "at now", nowVn);
        // At exact now - 7d -> included in 7d & 30d (unlinked SKIPPED)
        createCareLogEntity(userA, plantA, null, "WATERING", CareLogStatus.SKIPPED, "exact 7d", nowVn.minusDays(7));
        // At now - 7d - 1s -> NOT 7d, YES 30d (unlinked COMPLETED)
        createCareLogEntity(userA, plantA, null, "PRUNING", CareLogStatus.COMPLETED, "just outside 7d", nowVn.minusDays(7).minusSeconds(1));
        // At exact now - 30d -> NOT 7d, YES 30d (unlinked SKIPPED)
        createCareLogEntity(userA, plantA, null, "MISTING", CareLogStatus.SKIPPED, "exact 30d", nowVn.minusDays(30));
        // At now - 30d - 1s -> excluded from BOTH
        createCareLogEntity(userA, plantA, null, "WATERING", CareLogStatus.COMPLETED, "outside 30d", nowVn.minusDays(30).minusSeconds(1));
        // In future > now -> excluded from BOTH
        createCareLogEntity(userA, plantA, null, "WATERING", CareLogStatus.COMPLETED, "future log", nowVn.plusSeconds(1));

        // Assert Overview matches exact boundaries
        mockMvc.perform(get("/api/v1/monitoring/overview")
                .header("Authorization", "Bearer " + userAToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.schedulesSummary.activeCount").value(5))
            .andExpect(jsonPath("$.data.schedulesSummary.dueTodayCount").value(2))
            .andExpect(jsonPath("$.data.schedulesSummary.overdueCount").value(2))
            .andExpect(jsonPath("$.data.careLogsSummary7d.unlinkedCompletedLogs").value(1))
            .andExpect(jsonPath("$.data.careLogsSummary7d.unlinkedSkippedLogs").value(1))
            .andExpect(jsonPath("$.data.careLogsSummary30d.unlinkedCompletedLogs").value(2))
            .andExpect(jsonPath("$.data.careLogsSummary30d.unlinkedSkippedLogs").value(2))
            .andExpect(jsonPath("$.data.generatedAt").value("2026-06-15T10:00:00Z"));

        // Assert Plant Detail matches exact boundaries
        mockMvc.perform(get("/api/v1/monitoring/plants/" + plantA.getId())
                .header("Authorization", "Bearer " + userAToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.schedulesSummary.activeCount").value(5))
            .andExpect(jsonPath("$.data.schedulesSummary.dueTodayCount").value(2))
            .andExpect(jsonPath("$.data.schedulesSummary.overdueCount").value(2))
            .andExpect(jsonPath("$.data.careLogsSummary30d.unlinkedCompletedLogs").value(2))
            .andExpect(jsonPath("$.data.careLogsSummary30d.unlinkedSkippedLogs").value(2))
            .andExpect(jsonPath("$.data.generatedAt").value("2026-06-15T10:00:00Z"));

        // Roll clock to 23:59:59+07:00 (still VN June 15): 23:59:59.999999+07:00 remains dueToday; 2026-06-16T00:00+07 remains future
        setClock(OffsetDateTime.of(2026, 6, 15, 23, 59, 59, 0, ZoneOffset.ofHours(7)).toInstant());
        mockMvc.perform(get("/api/v1/monitoring/overview")
                .header("Authorization", "Bearer " + userAToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.schedulesSummary.activeCount").value(5))
            .andExpect(jsonPath("$.data.schedulesSummary.dueTodayCount").value(1))
            .andExpect(jsonPath("$.data.schedulesSummary.overdueCount").value(3))
            .andExpect(jsonPath("$.data.generatedAt").value("2026-06-15T16:59:59Z"));

        // Roll clock 1 second across VN midnight to 2026-06-16T00:00:00+07:00 (UTC is still 2026-06-15T17:00:00Z)
        setClock(startOfTomorrowVn.toInstant());
        mockMvc.perform(get("/api/v1/monitoring/overview")
                .header("Authorization", "Bearer " + userAToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.schedulesSummary.activeCount").value(5))
            .andExpect(jsonPath("$.data.schedulesSummary.dueTodayCount").value(1))
            .andExpect(jsonPath("$.data.schedulesSummary.overdueCount").value(4))
            .andExpect(jsonPath("$.data.generatedAt").value("2026-06-15T17:00:00Z"));
    }

    @Test
    void plantDetail_AgeCalculationAcrossVnMidnight_NullAndFuturePlantedAt_EmptyState_TimelineOrderAndCaps_SpeciesGuideNulls() throws Exception {
        // 2026-06-15 00:30:00+07:00 == 2026-06-14T17:30:00Z (UTC day is 14, VN day is 15!)
        Instant vnEarlyMorning = Instant.parse("2026-06-14T17:30:00Z");
        setClock(vnEarlyMorning);

        Garden garden = createGarden(userA, "Vườn Detail Edge", "Ban công");

        // 1. Age across VN boundary: plantedAt = 2026-06-05 -> on VN June 15 ageDays = 10 (would be 9 if UTC were used!)
        UserPlant agePlant = createPlant(userA, garden, partialSpecies, "Cây Đếm Tuổi VN", HealthStatus.HEALTHY, LocalDate.of(2026, 6, 5));
        mockMvc.perform(get("/api/v1/monitoring/plants/" + agePlant.getId())
                .header("Authorization", "Bearer " + userAToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.plantedAt").value("2026-06-05"))
            .andExpect(jsonPath("$.data.ageDays").value(10))
            .andExpect(jsonPath("$.data.schedulesSummary.activeCount").value(0))
            .andExpect(jsonPath("$.data.schedulesSummary.dueTodayCount").value(0))
            .andExpect(jsonPath("$.data.schedulesSummary.overdueCount").value(0))
            .andExpect(jsonPath("$.data.careLogsSummary30d.unlinkedCompletedLogs").value(0))
            .andExpect(jsonPath("$.data.recentActivityTimeline").isArray())
            .andExpect(jsonPath("$.data.recentActivityTimeline", hasSize(0)))
            .andExpect(jsonPath("$.data.recentJournalObservations").isArray())
            .andExpect(jsonPath("$.data.recentJournalObservations", hasSize(0)))
            .andExpect(jsonPath("$.data.speciesCareGuide.lightRequirement").value("Ánh sáng gián tiếp dịu nhẹ"))
            .andExpect(jsonPath("$.data.speciesCareGuide.waterRequirement").value(nullValue()))
            .andExpect(jsonPath("$.data.speciesCareGuide.wateringFrequency").value(nullValue()))
            .andExpect(jsonPath("$.data.speciesCareGuide.temperatureRange").value("18-27°C"))
            .andExpect(jsonPath("$.data.speciesCareGuide.humidityRange").value(nullValue()))
            .andExpect(jsonPath("$.data.speciesCareGuide.soilPh").value(nullValue()))
            .andExpect(jsonPath("$.data.speciesCareGuide.usageAndCaution").value("Có thể gây kích ứng nếu vật nuôi nhai phải lá."))
            .andExpect(jsonPath("$.data.sensorConnected").value(false));

        // 2. Null plantedAt -> ageDays = null
        UserPlant nullPlantedPlant = createPlant(userA, garden, partialSpecies, "Cây Không Ngày Trồng", HealthStatus.UNKNOWN, null);
        mockMvc.perform(get("/api/v1/monitoring/plants/" + nullPlantedPlant.getId())
                .header("Authorization", "Bearer " + userAToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.plantedAt").value(nullValue()))
            .andExpect(jsonPath("$.data.ageDays").value(nullValue()));

        // 3. Future plantedAt -> ageDays clamped to 0
        UserPlant futurePlantedPlant = createPlant(userA, garden, partialSpecies, "Cây Ngày Trồng Tương Lai", HealthStatus.HEALTHY, LocalDate.of(2026, 6, 20));
        mockMvc.perform(get("/api/v1/monitoring/plants/" + futurePlantedPlant.getId())
                .header("Authorization", "Bearer " + userAToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.ageDays").value(0));

        // 4. Timeline merge ordering, equal-timestamp deterministic tie-breaker, note truncation (160), caps (15 timeline / 10 journals)
        Instant tBase = Instant.parse("2026-06-14T16:00:00Z");
        setClock(tBase.plusSeconds(3600));
        OffsetDateTime tieTs = OffsetDateTime.ofInstant(tBase, ZoneOffset.UTC);

        UserPlant timelinePlant = createPlant(userA, garden, richSpecies, "Cây Timeline", HealthStatus.NEEDS_ATTENTION, LocalDate.of(2026, 5, 1));
        CareSchedule linkedSched = createScheduleEntity(userA, timelinePlant, TaskType.WATERING, ScheduleStatus.ACTIVE, tieTs.plusDays(1));

        String longNote = "A".repeat(180);
        // Three items at exact same newest timestamp tieTs:
        createJournalEntity(userA, timelinePlant, EntryType.GROWTH, JournalHealthStatus.HEALTHY, longNote, tieTs);
        createCareLogEntity(userA, timelinePlant, linkedSched, "WATERING", CareLogStatus.COMPLETED, "Linked tie", tieTs);
        createCareLogEntity(userA, timelinePlant, null, "PRUNING", CareLogStatus.COMPLETED, "Unlinked tie", tieTs);

        // Plus 10 earlier logs and 11 earlier journals -> total 12 logs + 12 journals = 24 events
        List<OffsetDateTime> createdTimes = new ArrayList<>();
        for (int i = 1; i <= 10; i++) {
            OffsetDateTime ts = tieTs.minusMinutes(i * 2L);
            createdTimes.add(ts);
            createCareLogEntity(userA, timelinePlant, null, "MISTING", CareLogStatus.COMPLETED, "Log #" + i, ts);
        }
        for (int i = 1; i <= 11; i++) {
            OffsetDateTime ts = tieTs.minusMinutes(i * 2L + 1);
            createJournalEntity(userA, timelinePlant, EntryType.OTHER, JournalHealthStatus.NEEDS_ATTENTION, "Journal #" + i, ts);
        }

        mockMvc.perform(get("/api/v1/monitoring/plants/" + timelinePlant.getId())
                .header("Authorization", "Bearer " + userAToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.recentActivityTimeline", hasSize(15)))
            // Exact equal timestamp tie-breaking order: CARE_LOG_UNLINKED (ordinal 0), CARE_LOG_LINKED (ordinal 1), GROWTH_JOURNAL (ordinal 2)
            .andExpect(jsonPath("$.data.recentActivityTimeline[0].sourceType").value("CARE_LOG_UNLINKED"))
            .andExpect(jsonPath("$.data.recentActivityTimeline[0].occurredAt").value(endsWith("Z")))
            .andExpect(jsonPath("$.data.recentActivityTimeline[1].sourceType").value("CARE_LOG_LINKED"))
            .andExpect(jsonPath("$.data.recentActivityTimeline[2].sourceType").value("GROWTH_JOURNAL"))
            .andExpect(jsonPath("$.data.recentActivityTimeline[2].notePreview", hasLength(160)))
            .andExpect(jsonPath("$.data.recentActivityTimeline[2].notePreview", endsWith("...")))
            // Item 3 is newest earlier log at minusMinutes(2), Item 4 is earlier journal at minusMinutes(3)
            .andExpect(jsonPath("$.data.recentActivityTimeline[3].sourceType").value("CARE_LOG_UNLINKED"))
            .andExpect(jsonPath("$.data.recentActivityTimeline[4].sourceType").value("GROWTH_JOURNAL"))
            // Journals capped at 10, descending by recordedAt UTC
            .andExpect(jsonPath("$.data.recentJournalObservations", hasSize(10)))
            .andExpect(jsonPath("$.data.recentJournalObservations[0].recordedAt").value(endsWith("Z")))
            .andExpect(jsonPath("$.data.recentJournalObservations[0].notePreview", hasLength(160)))
            .andExpect(jsonPath("$.data.recentJournalObservations[1].notePreview").value("Journal #1"));
    }
}
