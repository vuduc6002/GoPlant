package com.cmc.plant_care_backend;

import com.cmc.plant_care_backend.model.*;
import com.cmc.plant_care_backend.model.enums.CareLogStatus;
import com.cmc.plant_care_backend.model.enums.EntryType;
import com.cmc.plant_care_backend.model.enums.JournalHealthStatus;
import com.cmc.plant_care_backend.model.enums.SpaceType;
import com.cmc.plant_care_backend.repository.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
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

    @PersistenceContext
    private EntityManager entityManager;

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

    @Autowired
    private GrowthJournalRepository growthJournalRepository;

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

    record ForeignKeyMapping(String sourceTable, String sourceColumns, String targetTable, String targetColumns) {}

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

                // 7. Verify All Foreign Key Constraints (exact source table, source columns, target table, target columns)
                List<ForeignKeyMapping> actualFks = new ArrayList<>();
                try (Statement stmt = conn.createStatement()) {
                    try (ResultSet rs = stmt.executeQuery(
                        "SELECT src_tbl.relname AS source_table, tgt_tbl.relname AS target_table, c.conname AS constraint_name, " +
                        "array_to_string(ARRAY( " +
                        "    SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) " +
                        "    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum " +
                        "    ORDER BY k.ord " +
                        "), ',') AS source_columns, " +
                        "array_to_string(ARRAY( " +
                        "    SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord) " +
                        "    JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum " +
                        "    ORDER BY k.ord " +
                        "), ',') AS target_columns " +
                        "FROM pg_constraint c " +
                        "JOIN pg_class src_tbl ON src_tbl.oid = c.conrelid " +
                        "JOIN pg_class tgt_tbl ON tgt_tbl.oid = c.confrelid " +
                        "JOIN pg_namespace n ON n.oid = src_tbl.relnamespace " +
                        "WHERE n.nspname = 'public' AND c.contype = 'f' " +
                        "ORDER BY src_tbl.relname, c.conname")) {
                        while (rs.next()) {
                            actualFks.add(new ForeignKeyMapping(
                                rs.getString("source_table"),
                                rs.getString("source_columns"),
                                rs.getString("target_table"),
                                rs.getString("target_columns")
                            ));
                        }
                    }
                }

                List<ForeignKeyMapping> expectedFks = List.of(
                    // user_roles (2 FKs)
                    new ForeignKeyMapping("user_roles", "user_id", "users", "id"),
                    new ForeignKeyMapping("user_roles", "role_id", "roles", "id"),

                    // user_favorite_species (2 FKs)
                    new ForeignKeyMapping("user_favorite_species", "user_id", "users", "id"),
                    new ForeignKeyMapping("user_favorite_species", "species_id", "plant_species", "id"),

                    // gardens (1 FK)
                    new ForeignKeyMapping("gardens", "owner_id", "users", "id"),

                    // user_plants (3 FKs)
                    new ForeignKeyMapping("user_plants", "owner_id", "users", "id"),
                    new ForeignKeyMapping("user_plants", "garden_id,owner_id", "gardens", "id,owner_id"),
                    new ForeignKeyMapping("user_plants", "species_id", "plant_species", "id"),

                    // care_schedules (2 FKs)
                    new ForeignKeyMapping("care_schedules", "owner_id", "users", "id"),
                    new ForeignKeyMapping("care_schedules", "user_plant_id,owner_id", "user_plants", "id,owner_id"),

                    // care_logs (3 FKs)
                    new ForeignKeyMapping("care_logs", "performed_by", "users", "id"),
                    new ForeignKeyMapping("care_logs", "schedule_id", "care_schedules", "id"),
                    new ForeignKeyMapping("care_logs", "user_plant_id,performed_by", "user_plants", "id,owner_id"),

                    // growth_journals (2 FKs)
                    new ForeignKeyMapping("growth_journals", "author_id", "users", "id"),
                    new ForeignKeyMapping("growth_journals", "user_plant_id,author_id", "user_plants", "id,owner_id"),

                    // cameras (2 FKs)
                    new ForeignKeyMapping("cameras", "owner_id", "users", "id"),
                    new ForeignKeyMapping("cameras", "garden_id,owner_id", "gardens", "id,owner_id")
                );

                for (ForeignKeyMapping expected : expectedFks) {
                    boolean found = actualFks.contains(expected);
                    assertTrue(found, "Missing Foreign Key mapping in PostgreSQL: " +
                        expected.sourceTable() + "(" + expected.sourceColumns() + ") -> " +
                        expected.targetTable() + "(" + expected.targetColumns() + ")");
                }
                assertEquals(expectedFks.size(), actualFks.size(),
                    "Total foreign keys count in public schema must match expected 17 FKs");

                // 8. Verify Table-Specific CHECK Constraints
                Map<String, Map<String, String>> checksByTable = new HashMap<>();
                try (Statement stmt = conn.createStatement()) {
                    try (ResultSet rs = stmt.executeQuery(
                        "SELECT src_tbl.relname AS table_name, c.conname AS constraint_name, pg_get_constraintdef(c.oid) AS definition " +
                        "FROM pg_constraint c " +
                        "JOIN pg_class src_tbl ON src_tbl.oid = c.conrelid " +
                        "JOIN pg_namespace n ON n.oid = src_tbl.relnamespace " +
                        "WHERE n.nspname = 'public' AND c.contype = 'c' " +
                        "ORDER BY src_tbl.relname, c.conname")) {
                        while (rs.next()) {
                            checksByTable.computeIfAbsent(rs.getString("table_name"), k -> new HashMap<>())
                                         .put(rs.getString("constraint_name"), rs.getString("definition"));
                        }
                    }
                }

                // 8.1. users table CHECKs
                Map<String, String> userChecks = checksByTable.getOrDefault("users", Collections.emptyMap());
                assertTrue(userChecks.values().stream().anyMatch(d -> d.contains("email IS NOT NULL") || (d.contains("email") && d.contains("phone_number"))),
                    "users table must have contact presence check constraint (email IS NOT NULL OR phone_number IS NOT NULL)");
                assertTrue(userChecks.values().stream().anyMatch(d -> d.contains("MOBILE") && d.contains("PC")),
                    "users table must have preferred_device check constraint ('MOBILE', 'PC')");
                assertTrue(userChecks.values().stream().anyMatch(d -> d.contains("ACTIVE") && d.contains("INACTIVE") && d.contains("BANNED")),
                    "users table must have status check constraint ('ACTIVE', 'INACTIVE', 'BANNED')");

                // 8.2. gardens table CHECKs
                Map<String, String> gardenChecks = checksByTable.getOrDefault("gardens", Collections.emptyMap());
                assertTrue(gardenChecks.values().stream().anyMatch(d ->
                    d.contains("BAN_CONG") && d.contains("SAN_THUONG") && d.contains("TRONG_NHA") && d.contains("SAN_VUON") && d.contains("KHAC")),
                    "gardens table must have space_type check constraint");

                // 8.3. user_plants table CHECKs
                Map<String, String> plantChecks = checksByTable.getOrDefault("user_plants", Collections.emptyMap());
                assertTrue(plantChecks.values().stream().anyMatch(d ->
                    d.contains("HEALTHY") && d.contains("NEEDS_ATTENTION") && d.contains("CRITICAL") && d.contains("UNKNOWN")),
                    "user_plants table must have health_status check constraint");

                // 8.4. care_schedules table CHECKs
                Map<String, String> scheduleChecks = checksByTable.getOrDefault("care_schedules", Collections.emptyMap());
                assertTrue(scheduleChecks.values().stream().anyMatch(d ->
                    d.contains("WATERING") && d.contains("FERTILIZING") && d.contains("PRUNING") && d.contains("PEST_CHECK") && d.contains("MISTING") && d.contains("JOURNAL")),
                    "care_schedules table must have task_type check constraint");
                assertTrue(scheduleChecks.values().stream().anyMatch(d ->
                    d.contains("ONCE") && d.contains("DAILY") && d.contains("EVERY_OTHER_DAY") && d.contains("WEEKLY") && d.contains("CUSTOM")),
                    "care_schedules table must have frequency check constraint");
                assertTrue(scheduleChecks.values().stream().anyMatch(d ->
                    d.contains("ACTIVE") && d.contains("PAUSED") && d.contains("COMPLETED") && d.contains("CANCELLED")),
                    "care_schedules table must have status check constraint");
                assertTrue(scheduleChecks.values().stream().anyMatch(d ->
                    d.contains("CUSTOM") && d.contains("interval_days")),
                    "care_schedules table must have chk_care_schedules_interval check constraint");

                // 8.5. care_logs table CHECKs
                Map<String, String> careLogChecks = checksByTable.getOrDefault("care_logs", Collections.emptyMap());
                assertTrue(careLogChecks.values().stream().anyMatch(d -> d.contains("COMPLETED") && d.contains("SKIPPED")),
                    "care_logs table must have status check constraint ('COMPLETED', 'SKIPPED')");

                // 8.6. growth_journals table CHECKs
                Map<String, String> journalChecks = checksByTable.getOrDefault("growth_journals", Collections.emptyMap());
                assertTrue(journalChecks.values().stream().anyMatch(d ->
                    d.contains("GROWTH") && d.contains("WATERING") && d.contains("FERTILIZING") && d.contains("PEST") && d.contains("OTHER")),
                    "growth_journals table must have entry_type check constraint");
                assertTrue(journalChecks.values().stream().anyMatch(d ->
                    d.contains("HEALTHY") && d.contains("NEEDS_ATTENTION") && d.contains("CRITICAL")),
                    "growth_journals table must have health_status check constraint");

                // 8.7. cameras table CHECKs
                Map<String, String> cameraChecks = checksByTable.getOrDefault("cameras", Collections.emptyMap());
                assertTrue(cameraChecks.values().stream().anyMatch(d -> d.contains("ONLINE") && d.contains("OFFLINE") && d.contains("ERROR")),
                    "cameras table must have status check constraint ('ONLINE', 'OFFLINE', 'ERROR')");

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
    @DisplayName("Verify Hibernate Mapping of String[] Array Column for CareLog and GrowthJournal (Write, Flush, Clear & Read)")
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

        // 1. Verify CareLog String[] array mapping
        CareLog careLog = new CareLog();
        careLog.setUserPlant(userPlant);
        careLog.setPerformedBy(testUser);
        careLog.setTaskType("WATERING");
        careLog.setStatus(CareLogStatus.COMPLETED);
        careLog.setNote("Testing real CareLog String[] array write/read mapping");
        careLog.setPerformedAt(OffsetDateTime.now());
        String[] careLogUrls = new String[] {
            "https://storage.goplant.vn/care/photo-1.jpg",
            "https://storage.goplant.vn/care/photo-2.jpg"
        };
        careLog.setImageUrls(careLogUrls);

        CareLog savedCareLog = careLogRepository.save(careLog);
        UUID careLogId = savedCareLog.getId();
        assertNotNull(careLogId, "CareLog must have generated UUID");

        // Flush to database and clear Persistence Context (forcing real DB SELECT and bypassing 1st-level cache)
        entityManager.flush();
        entityManager.clear();

        // Read CareLog back from database
        CareLog retrievedCareLog = careLogRepository.findById(careLogId)
            .orElseThrow(() -> new AssertionError("Saved CareLog not found after flush/clear"));

        assertNotNull(retrievedCareLog.getImageUrls(), "Retrieved CareLog imageUrls array must not be null");
        assertEquals(2, retrievedCareLog.getImageUrls().length, "Retrieved CareLog imageUrls array must have 2 elements");
        assertArrayEquals(careLogUrls, retrievedCareLog.getImageUrls(), "Retrieved CareLog String[] must match original array elements exactly");

        // 2. Verify GrowthJournal String[] array mapping
        GrowthJournal journal = new GrowthJournal();
        journal.setUserPlant(userPlant);
        journal.setAuthor(testUser);
        journal.setEntryType(EntryType.GROWTH);
        journal.setHealthStatus(JournalHealthStatus.HEALTHY);
        journal.setNote("Testing real GrowthJournal String[] array write/read mapping");
        journal.setRecordedAt(OffsetDateTime.now());
        String[] journalUrls = new String[] {
            "https://storage.goplant.vn/journal/leaf-growth-1.jpg",
            "https://storage.goplant.vn/journal/leaf-growth-2.jpg",
            "https://storage.goplant.vn/journal/leaf-growth-3.jpg"
        };
        journal.setImageUrls(journalUrls);

        GrowthJournal savedJournal = growthJournalRepository.save(journal);
        UUID journalId = savedJournal.getId();
        assertNotNull(journalId, "GrowthJournal must have generated UUID");

        // Flush to database and clear Persistence Context (forcing real DB SELECT and bypassing 1st-level cache)
        entityManager.flush();
        entityManager.clear();

        // Read GrowthJournal back from database
        GrowthJournal retrievedJournal = growthJournalRepository.findById(journalId)
            .orElseThrow(() -> new AssertionError("Saved GrowthJournal not found after flush/clear"));

        assertNotNull(retrievedJournal.getImageUrls(), "Retrieved GrowthJournal imageUrls array must not be null");
        assertEquals(3, retrievedJournal.getImageUrls().length, "Retrieved GrowthJournal imageUrls array must have 3 elements");
        assertArrayEquals(journalUrls, retrievedJournal.getImageUrls(), "Retrieved GrowthJournal String[] must match original array elements exactly");
    }
}
