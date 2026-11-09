package com.cmc.plant_care_backend;

import com.cmc.plant_care_backend.model.*;
import com.cmc.plant_care_backend.model.enums.CareLogStatus;
import com.cmc.plant_care_backend.model.enums.SpaceType;
import com.cmc.plant_care_backend.repository.*;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.OffsetDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class DatabaseSchemaIntegrationTest {

    @Autowired
    private DataSource dataSource;

    @Autowired
    private Environment environment;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private GardenRepository gardenRepository;

    @Autowired
    private PlantSpeciesRepository plantSpeciesRepository;

    @Autowired
    private UserPlantRepository userPlantRepository;

    @Autowired
    private CareLogRepository careLogRepository;

    private static final Set<String> ALL_11_TABLES = Set.of(
        "roles",
        "users",
        "user_roles",
        "plant_species",
        "user_favorite_species",
        "gardens",
        "user_plants",
        "care_schedules",
        "care_logs",
        "growth_journals",
        "cameras"
    );

    @Test
    @DisplayName("Verify Database Schema, Flyway Migration V1, Tables, Extensions, Constraints, and Indexes")
    void databaseSchema_Verification() throws Exception {
        boolean isPostgresProfileActive = Arrays.asList(environment.getActiveProfiles()).contains("postgres");

        try (Connection conn = dataSource.getConnection()) {
            DatabaseMetaData metaData = conn.getMetaData();
            String dbProductName = metaData.getDatabaseProductName();

            if (isPostgresProfileActive) {
                // When running with postgres profile (e.g. CI or local PostgreSQL)
                assertEquals("PostgreSQL", dbProductName, "PostgreSQL profile must run against PostgreSQL database");

                // 1. Verify flyway_schema_history exists and V1 migration succeeded
                try (Statement stmt = conn.createStatement()) {
                    try (ResultSet rs = stmt.executeQuery(
                        "SELECT version, description, success, installed_on FROM flyway_schema_history WHERE version = '1'")) {
                        assertTrue(rs.next(), "flyway_schema_history must contain record for version 1");
                        assertEquals("initial schema", rs.getString("description").toLowerCase());
                        assertTrue(rs.getBoolean("success"), "Migration V1 must have success = true");
                    }
                }

                // 2. Verify all 11 tables exist in PostgreSQL
                Set<String> actualTables = new HashSet<>();
                try (ResultSet rs = metaData.getTables(null, "public", "%", new String[]{"TABLE"})) {
                    while (rs.next()) {
                        actualTables.add(rs.getString("TABLE_NAME").toLowerCase());
                    }
                }
                for (String expected : ALL_11_TABLES) {
                    assertTrue(actualTables.contains(expected), "Missing expected table in PostgreSQL: " + expected);
                }

                // 3. Verify PostgreSQL extension pgcrypto and gen_random_uuid()
                try (Statement stmt = conn.createStatement()) {
                    try (ResultSet rs = stmt.executeQuery("SELECT extname FROM pg_extension WHERE extname = 'pgcrypto'")) {
                        assertTrue(rs.next(), "pgcrypto extension must be installed in database");
                    }
                    try (ResultSet rs = stmt.executeQuery("SELECT gen_random_uuid()")) {
                        assertTrue(rs.next(), "gen_random_uuid() must execute without error");
                        assertNotNull(rs.getString(1), "gen_random_uuid() must return non-null UUID");
                    }
                }

                // 4. Verify seed roles & absence of hardcoded admin user
                try (Statement stmt = conn.createStatement()) {
                    try (ResultSet rs = stmt.executeQuery("SELECT name FROM roles ORDER BY name")) {
                        Set<String> roles = new HashSet<>();
                        while (rs.next()) {
                            roles.add(rs.getString("name"));
                        }
                        assertTrue(roles.contains("ROLE_USER"), "roles must contain ROLE_USER");
                        assertTrue(roles.contains("ROLE_ADMIN"), "roles must contain ROLE_ADMIN");
                        assertEquals(2, roles.size(), "roles must contain exactly 2 seed roles");
                    }

                    // Verify NO admin user exists by default in seed data
                    try (ResultSet rs = stmt.executeQuery(
                        "SELECT COUNT(*) FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE r.name = 'ROLE_ADMIN'")) {
                        assertTrue(rs.next());
                        assertEquals(0, rs.getInt(1), "Database must NOT have any default seed admin user");
                    }

                    // 5. Verify seed plant species
                    try (ResultSet rs = stmt.executeQuery("SELECT COUNT(*) FROM plant_species WHERE is_active = true")) {
                        assertTrue(rs.next());
                        assertTrue(rs.getInt(1) >= 5, "plant_species must contain at least 5 default active species");
                    }
                }

                // 6. Verify exact column types for image_urls (ARRAY with text element type: text[] / _text)
                try (Statement stmt = conn.createStatement()) {
                    try (ResultSet rs = stmt.executeQuery(
                        "SELECT table_name, data_type, udt_name FROM information_schema.columns " +
                        "WHERE table_schema = 'public' AND column_name = 'image_urls' AND table_name IN ('care_logs', 'growth_journals')")) {
                        Map<String, String> arrayColumns = new HashMap<>();
                        while (rs.next()) {
                            arrayColumns.put(rs.getString("table_name"), rs.getString("udt_name"));
                        }
                        assertEquals("_text", arrayColumns.get("care_logs"), "care_logs.image_urls must have udt_name = _text (text[])");
                        assertEquals("_text", arrayColumns.get("growth_journals"), "growth_journals.image_urls must have udt_name = _text (text[])");
                    }
                }

                // 7. Verify Foreign Key Constraints (including composite foreign keys)
                try (Statement stmt = conn.createStatement()) {
                    try (ResultSet rs = stmt.executeQuery(
                        "SELECT conname, conrelid::regclass::text AS tbl, confrelid::regclass::text AS fktbl, pg_get_constraintdef(c.oid) AS def " +
                        "FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace " +
                        "WHERE n.nspname = 'public' AND c.contype = 'f'")) {
                        Map<String, String> fkDefinitions = new HashMap<>();
                        while (rs.next()) {
                            fkDefinitions.put(rs.getString("conname"), rs.getString("def"));
                        }

                        // user_plants FKs
                        assertTrue(fkDefinitions.containsKey("fk_user_plants_garden_owner"), "user_plants must have fk_user_plants_garden_owner");
                        assertTrue(fkDefinitions.get("fk_user_plants_garden_owner").contains("gardens(id, owner_id)"),
                            "fk_user_plants_garden_owner must reference gardens(id, owner_id)");

                        // care_schedules FKs
                        assertTrue(fkDefinitions.containsKey("fk_care_schedules_plant_owner"), "care_schedules must have fk_care_schedules_plant_owner");
                        assertTrue(fkDefinitions.get("fk_care_schedules_plant_owner").contains("user_plants(id, owner_id)"),
                            "fk_care_schedules_plant_owner must reference user_plants(id, owner_id)");

                        // care_logs FKs
                        assertTrue(fkDefinitions.containsKey("fk_care_logs_plant_performed_by"), "care_logs must have fk_care_logs_plant_performed_by");
                        assertTrue(fkDefinitions.get("fk_care_logs_plant_performed_by").contains("user_plants(id, owner_id)"),
                            "fk_care_logs_plant_performed_by must reference user_plants(id, owner_id)");

                        // growth_journals FKs
                        assertTrue(fkDefinitions.containsKey("fk_growth_journals_plant_author"), "growth_journals must have fk_growth_journals_plant_author");
                        assertTrue(fkDefinitions.get("fk_growth_journals_plant_author").contains("user_plants(id, owner_id)"),
                            "fk_growth_journals_plant_author must reference user_plants(id, owner_id)");

                        // cameras FKs
                        assertTrue(fkDefinitions.containsKey("fk_cameras_garden_owner"), "cameras must have fk_cameras_garden_owner");
                        assertTrue(fkDefinitions.get("fk_cameras_garden_owner").contains("gardens(id, owner_id)"),
                            "fk_cameras_garden_owner must reference gardens(id, owner_id)");
                    }
                }

                // 8. Verify CHECK Constraints
                try (Statement stmt = conn.createStatement()) {
                    try (ResultSet rs = stmt.executeQuery(
                        "SELECT conrelid::regclass::text AS tbl, pg_get_constraintdef(c.oid) AS def " +
                        "FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace " +
                        "WHERE n.nspname = 'public' AND c.contype = 'c'")) {
                        List<String> checkDefs = new ArrayList<>();
                        while (rs.next()) {
                            checkDefs.add(rs.getString("def"));
                        }

                        // Users CHECKs
                        assertTrue(checkDefs.stream().anyMatch(d -> d.contains("ACTIVE") && d.contains("INACTIVE") && d.contains("BANNED")),
                            "Missing users.status CHECK constraint");
                        assertTrue(checkDefs.stream().anyMatch(d -> d.contains("MOBILE") && d.contains("PC")),
                            "Missing users.preferred_device CHECK constraint");

                        // Gardens space_type CHECK
                        assertTrue(checkDefs.stream().anyMatch(d -> d.contains("BAN_CONG") && d.contains("SAN_THUONG")),
                            "Missing gardens.space_type CHECK constraint");

                        // UserPlant health_status CHECK
                        assertTrue(checkDefs.stream().anyMatch(d -> d.contains("HEALTHY") && d.contains("NEEDS_ATTENTION") && d.contains("CRITICAL")),
                            "Missing user_plants.health_status CHECK constraint");

                        // CareSchedule CHECKs
                        assertTrue(checkDefs.stream().anyMatch(d -> d.contains("WATERING") && d.contains("FERTILIZING")),
                            "Missing care_schedules.task_type CHECK constraint");
                        assertTrue(checkDefs.stream().anyMatch(d -> d.contains("interval_days")),
                            "Missing care_schedules.interval_days CHECK constraint");

                        // CareLog status CHECK
                        assertTrue(checkDefs.stream().anyMatch(d -> d.contains("COMPLETED") && d.contains("SKIPPED")),
                            "Missing care_logs.status CHECK constraint");

                        // GrowthJournal entry_type & health_status CHECKs
                        assertTrue(checkDefs.stream().anyMatch(d -> d.contains("GROWTH") && d.contains("WATERING")),
                            "Missing growth_journals.entry_type CHECK constraint");

                        // Cameras status CHECK
                        assertTrue(checkDefs.stream().anyMatch(d -> d.contains("ONLINE") && d.contains("OFFLINE")),
                            "Missing cameras.status CHECK constraint");
                    }
                }

                // 9. Verify Essential Indexes including GIN index
                try (Statement stmt = conn.createStatement()) {
                    try (ResultSet rs = stmt.executeQuery(
                        "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'")) {
                        Map<String, String> indexes = new HashMap<>();
                        while (rs.next()) {
                            indexes.put(rs.getString("indexname"), rs.getString("indexdef"));
                        }

                        Set<String> requiredIndexes = Set.of(
                            "idx_users_email_unique",
                            "idx_users_phone_unique",
                            "idx_species_category",
                            "idx_species_active",
                            "idx_plant_species_search_gin",
                            "idx_gardens_owner_id",
                            "idx_user_plants_owner_id",
                            "idx_user_plants_garden_id",
                            "idx_user_plants_species_id",
                            "idx_care_schedules_plant_id",
                            "idx_care_schedules_owner_id",
                            "idx_care_schedules_active",
                            "idx_care_logs_plant_id",
                            "idx_care_logs_schedule_id",
                            "idx_care_logs_performed_by",
                            "idx_care_logs_performed_at",
                            "idx_growth_journals_plant_id",
                            "idx_growth_journals_recorded_at",
                            "idx_cameras_garden_id"
                        );

                        for (String reqIdx : requiredIndexes) {
                            assertTrue(indexes.containsKey(reqIdx), "Missing required index in PostgreSQL: " + reqIdx);
                        }

                        // Specifically verify GIN index type
                        assertTrue(indexes.get("idx_plant_species_search_gin").toLowerCase().contains("using gin"),
                            "idx_plant_species_search_gin must be a GIN index");
                    }
                }
            } else {
                // When running with default local H2 profile
                Set<String> actualTables = new HashSet<>();
                try (ResultSet rs = metaData.getTables(null, null, "%", new String[]{"TABLE"})) {
                    while (rs.next()) {
                        actualTables.add(rs.getString("TABLE_NAME").toLowerCase());
                    }
                }
                Set<String> coreJpaTables = Set.of(
                    "roles", "users", "user_roles", "plant_species", "user_favorite_species",
                    "gardens", "user_plants", "care_schedules", "care_logs", "growth_journals"
                );
                for (String expected : coreJpaTables) {
                    assertTrue(actualTables.contains(expected), "Missing expected table in H2: " + expected);
                }
            }
        }
    }

    @Test
    @DisplayName("Verify Hibernate Mapping of String[] Array Column (Write & Read)")
    @Transactional
    void verifyArrayMapping_WriteAndRead() {
        // Create an isolated test user
        User testUser = new User();
        testUser.setFullName("Array Mapping Test User");
        testUser.setEmail("array-test-" + UUID.randomUUID() + "@goplant.vn");
        testUser.setPasswordHash("$2a$10$dummyHashForArrayTestOnly");
        testUser = userRepository.save(testUser);

        // Create an isolated test garden
        Garden testGarden = new Garden();
        testGarden.setOwner(testUser);
        testGarden.setName("Array Test Garden");
        testGarden.setLocation("Test Area");
        testGarden.setSpaceType(SpaceType.BAN_CONG);
        testGarden = gardenRepository.save(testGarden);

        // Create or get a plant species
        PlantSpecies species = new PlantSpecies();
        species.setCommonName("Array Test Plant");
        species.setScientificName("Plantus testus " + UUID.randomUUID());
        species.setCategory("Test Category");
        species.setIsActive(true);
        species = plantSpeciesRepository.save(species);

        // Create an isolated test user plant
        UserPlant userPlant = new UserPlant();
        userPlant.setOwner(testUser);
        userPlant.setGarden(testGarden);
        userPlant.setSpecies(species);
        userPlant.setDisplayName("My Array Plant");
        userPlant = userPlantRepository.save(userPlant);

        // Create CareLog with non-empty String[] imageUrls
        CareLog careLog = new CareLog();
        careLog.setUserPlant(userPlant);
        careLog.setPerformedBy(testUser);
        careLog.setTaskType("WATERING");
        careLog.setStatus(CareLogStatus.COMPLETED);
        careLog.setNote("Testing real String[] array write/read mapping");
        careLog.setPerformedAt(OffsetDateTime.now());
        String[] originalUrls = new String[] {
            "https://storage.goplant.vn/care/photo-1.jpg",
            "https://storage.goplant.vn/care/photo-2.jpg"
        };
        careLog.setImageUrls(originalUrls);

        CareLog savedLog = careLogRepository.save(careLog);
        assertNotNull(savedLog.getId(), "CareLog must have generated UUID");

        // Read CareLog back from persistence context
        Optional<CareLog> retrievedOpt = careLogRepository.findById(savedLog.getId());
        assertTrue(retrievedOpt.isPresent(), "Saved CareLog must be retrieved");
        CareLog retrieved = retrievedOpt.get();

        assertNotNull(retrieved.getImageUrls(), "Retrieved imageUrls array must not be null");
        assertEquals(2, retrieved.getImageUrls().length, "Retrieved imageUrls array must have 2 elements");
        assertArrayEquals(originalUrls, retrieved.getImageUrls(), "Retrieved String[] must match original array elements exactly");
    }
}
