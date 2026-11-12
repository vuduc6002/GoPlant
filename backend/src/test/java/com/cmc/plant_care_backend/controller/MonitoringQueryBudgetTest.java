package com.cmc.plant_care_backend.controller;

import com.cmc.plant_care_backend.common.exception.ForbiddenException;
import com.cmc.plant_care_backend.dto.monitoring.MonitoringOverviewResponse;
import com.cmc.plant_care_backend.dto.monitoring.PlantMonitoringDetailResponse;
import com.cmc.plant_care_backend.model.*;
import com.cmc.plant_care_backend.model.enums.*;
import com.cmc.plant_care_backend.repository.*;
import com.cmc.plant_care_backend.service.MonitoringService;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties = "spring.jpa.properties.hibernate.generate_statistics=true")
class MonitoringQueryBudgetTest {

    private static final int OVERVIEW_FIXED_QUERY_BUDGET = 5;
    private static final int DETAIL_FIXED_QUERY_BUDGET = 5;
    private static final int DETAIL_FORBIDDEN_QUERY_BUDGET = 1;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Autowired
    private MonitoringService monitoringService;

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

    private Role roleUser;
    private PlantSpecies species;
    private Statistics statistics;

    @BeforeEach
    void setUp() {
        statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.setStatisticsEnabled(true);

        roleUser = roleRepository.findByName("ROLE_USER")
            .orElseGet(() -> roleRepository.save(new Role("ROLE_USER")));

        species = new PlantSpecies();
        species.setCommonName("Budget Test Species " + UUID.randomUUID().toString().substring(0, 6));
        species.setScientificName("Monstera deliciosa");
        species.setCategory("Cây cảnh lá");
        species.setLightRequirement("Tán xạ");
        species = plantSpeciesRepository.save(species);
    }

    private User createUser(String prefix) {
        User u = new User();
        u.setFullName(prefix);
        u.setEmail(prefix + "_" + UUID.randomUUID() + "@goplant.com");
        u.setPasswordHash("hashed");
        u.setStatus(UserStatus.ACTIVE);
        u.getRoles().add(roleUser);
        return userRepository.save(u);
    }

    private UserPlant seedDataset(
        User owner,
        int gardensCount,
        int plantsPerGarden,
        int schedulesPerPlant,
        int logsPerPlant,
        int journalsPerPlant
    ) {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        UserPlant firstPlant = null;

        for (int gIdx = 0; gIdx < gardensCount; gIdx++) {
            Garden g = new Garden();
            g.setOwner(owner);
            g.setName("Budget Garden " + gIdx + "-" + UUID.randomUUID().toString().substring(0, 4));
            g.setLocation("Ban công");
            g = gardenRepository.save(g);

            for (int pIdx = 0; pIdx < plantsPerGarden; pIdx++) {
                UserPlant p = new UserPlant();
                p.setOwner(owner);
                p.setGarden(g);
                p.setSpecies(species);
                p.setDisplayName("Plant " + gIdx + "-" + pIdx);
                p.setHealthStatus(pIdx % 3 == 0 ? HealthStatus.CRITICAL : (pIdx % 2 == 0 ? HealthStatus.NEEDS_ATTENTION : HealthStatus.HEALTHY));
                p.setPlantedAt(LocalDate.now(ZoneOffset.UTC).minusDays(15));
                p = userPlantRepository.save(p);
                if (firstPlant == null) {
                    firstPlant = p;
                }

                for (int sIdx = 0; sIdx < schedulesPerPlant; sIdx++) {
                    CareSchedule sched = new CareSchedule();
                    sched.setOwner(owner);
                    sched.setUserPlant(p);
                    sched.setTaskType(TaskType.WATERING);
                    sched.setFrequency(Frequency.DAILY);
                    sched.setStartDate(LocalDate.now(ZoneOffset.UTC).minusDays(2));
                    sched.setStatus(ScheduleStatus.ACTIVE);
                    sched.setNextScheduledAt(now.plusMinutes(sIdx + 10L));
                    sched = careScheduleRepository.save(sched);

                    if (sIdx == 0) {
                        for (int lIdx = 0; lIdx < logsPerPlant; lIdx++) {
                            CareLog log = new CareLog();
                            log.setPerformedBy(owner);
                            log.setUserPlant(p);
                            log.setSchedule(lIdx % 2 == 0 ? sched : null);
                            log.setTaskType("WATERING");
                            log.setStatus(lIdx % 3 == 0 ? CareLogStatus.SKIPPED : CareLogStatus.COMPLETED);
                            log.setNote("Budget log " + lIdx);
                            log.setPerformedAt(now.minusHours(lIdx + 1L));
                            careLogRepository.save(log);
                        }
                    }
                }

                for (int jIdx = 0; jIdx < journalsPerPlant; jIdx++) {
                    GrowthJournal journal = new GrowthJournal();
                    journal.setAuthor(owner);
                    journal.setUserPlant(p);
                    journal.setEntryType(EntryType.GROWTH);
                    journal.setHealthStatus(JournalHealthStatus.HEALTHY);
                    journal.setNote("Budget journal " + jIdx);
                    journal.setRecordedAt(now.minusHours(jIdx + 1L));
                    growthJournalRepository.save(journal);
                }
            }
        }
        return firstPlant;
    }

    @Test
    void overviewAndDetail_StayWithinFixedQueryBudget_RegardlessOfDatasetSize() {
        User smallUser = createUser("small_budget");
        UserPlant smallPlant = seedDataset(smallUser, 1, 1, 1, 2, 2);

        User largeUser = createUser("large_budget");
        UserPlant largePlant = seedDataset(largeUser, 5, 5, 2, 20, 15); // 5 gardens, 25 plants, 50 schedules, 500 logs, 375 journals

        // 1. Measure Overview on small dataset
        statistics.clear();
        MonitoringOverviewResponse smallOverview = monitoringService.getOverview(smallUser.getId());
        long smallOverviewStatements = statistics.getPrepareStatementCount();

        assertEquals(1, smallOverview.getGardensCount());
        assertEquals(1, smallOverview.getPlantsCount());

        // 2. Measure Overview on large dataset (25x more plants, 50x more schedules, 250x more logs)
        statistics.clear();
        MonitoringOverviewResponse largeOverview = monitoringService.getOverview(largeUser.getId());
        long largeOverviewStatements = statistics.getPrepareStatementCount();

        assertEquals(5, largeOverview.getGardensCount());
        assertEquals(25, largeOverview.getPlantsCount());

        assertTrue(smallOverviewStatements <= OVERVIEW_FIXED_QUERY_BUDGET,
            "Small overview SQL statements exceeded budget: " + smallOverviewStatements);
        assertTrue(largeOverviewStatements <= OVERVIEW_FIXED_QUERY_BUDGET,
            "Large overview SQL statements exceeded budget: " + largeOverviewStatements);
        assertEquals(smallOverviewStatements, largeOverviewStatements,
            "Overview query count must stay O(1) invariant across dataset sizes (no N+1)");

        // 3. Measure Plant Detail on small plant
        statistics.clear();
        PlantMonitoringDetailResponse smallDetail = monitoringService.getPlantDetail(smallPlant.getId(), smallUser.getId());
        long smallDetailStatements = statistics.getPrepareStatementCount();
        assertNotNull(smallDetail.getPlantId());

        // 4. Measure Plant Detail on large plant
        statistics.clear();
        PlantMonitoringDetailResponse largeDetail = monitoringService.getPlantDetail(largePlant.getId(), largeUser.getId());
        long largeDetailStatements = statistics.getPrepareStatementCount();
        assertEquals(15, largeDetail.getRecentActivityTimeline().size());
        assertEquals(10, largeDetail.getRecentJournalObservations().size());

        assertTrue(smallDetailStatements <= DETAIL_FIXED_QUERY_BUDGET,
            "Small plant detail SQL statements exceeded budget: " + smallDetailStatements);
        assertTrue(largeDetailStatements <= DETAIL_FIXED_QUERY_BUDGET,
            "Large plant detail SQL statements exceeded budget: " + largeDetailStatements);
        assertEquals(smallDetailStatements, largeDetailStatements,
            "Plant detail query count must stay O(1) invariant across dataset sizes (no N+1)");

        // 5. Measure Forbidden ownership fail-fast query budget
        UUID targetPlantId = largePlant.getId();
        UUID intruderId = smallUser.getId();
        statistics.clear();
        assertThrows(ForbiddenException.class, () -> monitoringService.getPlantDetail(targetPlantId, intruderId));
        long forbiddenStatements = statistics.getPrepareStatementCount();
        assertTrue(forbiddenStatements <= DETAIL_FORBIDDEN_QUERY_BUDGET,
            "Forbidden check must short-circuit after 1 query, executed: " + forbiddenStatements);
    }
}
