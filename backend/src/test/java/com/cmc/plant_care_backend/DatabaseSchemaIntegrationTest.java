package com.cmc.plant_care_backend;

import com.cmc.plant_care_backend.model.*;
import com.cmc.plant_care_backend.model.enums.CareLogStatus;
import com.cmc.plant_care_backend.model.enums.EntryType;
import com.cmc.plant_care_backend.model.enums.JournalHealthStatus;
import com.cmc.plant_care_backend.model.enums.SpaceType;
import com.cmc.plant_care_backend.repository.*;
import jakarta.persistence.Column;
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
import java.sql.PreparedStatement;
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

    private static final Set<String> ALL_12_TABLES = Set.of(
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
        "cameras",
        "media_objects"
    );

    record ForeignKeyMapping(String sourceTable, String sourceColumns, String targetTable, String targetColumns) {}

    record ColumnTypeInfo(String dataType, String udtName) {}

    record IndexKeyInfo(int position, String expression, boolean isDesc) {}

    record StrictIndexInfo(
        String indexName,
        String tableName,
        String accessMethod,
        boolean isUnique,
        int keyAttrCount,
        int totalAttrCount,
        String partialPredicate,
        String fullDef,
        List<IndexKeyInfo> keyExpressions
    ) {}

    record ExpectedKey(String rawExpression, boolean isDesc) {}

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

                // 1. Verify flyway_schema_history exists and V1 + V2 migrations succeeded
                try (Statement stmt = conn.createStatement()) {
                    try (ResultSet rs = stmt.executeQuery(
                        "SELECT version, description, success, installed_on FROM flyway_schema_history WHERE version IN ('1', '2') ORDER BY version")) {
                        assertTrue(rs.next(), "flyway_schema_history must contain record for version 1");
                        assertEquals("initial schema", rs.getString("description").toLowerCase());
                        assertTrue(rs.getBoolean("success"), "Migration V1 must have success = true");

                        assertTrue(rs.next(), "flyway_schema_history must contain record for version 2");
                        assertEquals("media objects", rs.getString("description").toLowerCase());
                        assertTrue(rs.getBoolean("success"), "Migration V2 must have success = true");
                    }
                }

                // 2. Verify exactly the 12 business tables exist in PostgreSQL (excluding flyway_schema_history)
                Set<String> actualBusinessTables = new HashSet<>();
                try (ResultSet rs = metaData.getTables(null, "public", "%", new String[]{"TABLE"})) {
                    while (rs.next()) {
                        String tbl = rs.getString("TABLE_NAME").toLowerCase();
                        if (!tbl.equals("flyway_schema_history")) {
                            actualBusinessTables.add(tbl);
                        }
                    }
                }
                assertEquals(ALL_12_TABLES, actualBusinessTables,
                    "PostgreSQL public schema must contain exactly the 12 business tables declared in V1 and V2");

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
                Map<String, ColumnTypeInfo> arrayColumns = new HashMap<>();
                try (Statement stmt = conn.createStatement()) {
                    try (ResultSet rs = stmt.executeQuery(
                        "SELECT table_name, data_type, udt_name FROM information_schema.columns " +
                        "WHERE table_schema = 'public' AND column_name = 'image_urls' AND table_name IN ('care_logs', 'growth_journals')")) {
                        while (rs.next()) {
                            arrayColumns.put(
                                rs.getString("table_name").toLowerCase(),
                                new ColumnTypeInfo(rs.getString("data_type"), rs.getString("udt_name"))
                            );
                        }
                    }
                }
                assertEquals(2, arrayColumns.size(), "Must find exactly 2 image_urls array columns (care_logs and growth_journals)");

                ColumnTypeInfo careLogCol = arrayColumns.get("care_logs");
                assertNotNull(careLogCol, "care_logs.image_urls must exist");
                assertEquals("ARRAY", careLogCol.dataType(), "care_logs.image_urls data_type must be ARRAY");
                assertEquals("_text", careLogCol.udtName(), "care_logs.image_urls udt_name must be _text (text[])");

                ColumnTypeInfo journalCol = arrayColumns.get("growth_journals");
                assertNotNull(journalCol, "growth_journals.image_urls must exist");
                assertEquals("ARRAY", journalCol.dataType(), "growth_journals.image_urls data_type must be ARRAY");
                assertEquals("_text", journalCol.udtName(), "growth_journals.image_urls udt_name must be _text (text[])");

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
                    new ForeignKeyMapping("cameras", "garden_id,owner_id", "gardens", "id,owner_id"),

                    // media_objects (1 FK)
                    new ForeignKeyMapping("media_objects", "owner_id", "users", "id")
                );

                for (ForeignKeyMapping expected : expectedFks) {
                    boolean found = actualFks.contains(expected);
                    assertTrue(found, "Missing Foreign Key mapping in PostgreSQL: " +
                        expected.sourceTable() + "(" + expected.sourceColumns() + ") -> " +
                        expected.targetTable() + "(" + expected.targetColumns() + ")");
                }
                assertEquals(expectedFks.size(), actualFks.size(),
                    "Total foreign keys count in public schema must match expected 18 FKs");

                // 8. Verify Table-Specific CHECK Constraints (all 13 constraints verified by exact table and name)
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
                            checksByTable.computeIfAbsent(rs.getString("table_name").toLowerCase(), k -> new HashMap<>())
                                         .put(rs.getString("constraint_name").toLowerCase(), rs.getString("definition"));
                        }
                    }
                }

                // 8.1. users (3 CHECKs)
                assertCheckConstraint(checksByTable, "users", "users_preferred_device_check", "preferred_device", "MOBILE", "PC");
                assertCheckConstraint(checksByTable, "users", "users_status_check", "status", "ACTIVE", "INACTIVE", "BANNED");
                assertCheckConstraint(checksByTable, "users", "chk_users_contact_present", "email", "phone_number");

                // 8.2. gardens (1 CHECK)
                assertCheckConstraint(checksByTable, "gardens", "gardens_space_type_check", "space_type", "BAN_CONG", "SAN_THUONG", "TRONG_NHA", "SAN_VUON", "KHAC");

                // 8.3. user_plants (1 CHECK)
                assertCheckConstraint(checksByTable, "user_plants", "user_plants_health_status_check", "health_status", "HEALTHY", "NEEDS_ATTENTION", "CRITICAL", "UNKNOWN");

                // 8.4. care_schedules (4 CHECKs)
                assertCheckConstraint(checksByTable, "care_schedules", "care_schedules_task_type_check", "task_type", "WATERING", "FERTILIZING", "PRUNING", "PEST_CHECK", "MISTING", "JOURNAL");
                assertCheckConstraint(checksByTable, "care_schedules", "care_schedules_frequency_check", "frequency", "ONCE", "DAILY", "EVERY_OTHER_DAY", "WEEKLY", "CUSTOM");
                assertCheckConstraint(checksByTable, "care_schedules", "care_schedules_status_check", "status", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED");
                assertCheckConstraint(checksByTable, "care_schedules", "chk_care_schedules_interval", "frequency", "CUSTOM", "interval_days");

                // 8.5. care_logs (1 CHECK)
                assertCheckConstraint(checksByTable, "care_logs", "care_logs_status_check", "status", "COMPLETED", "SKIPPED");

                // 8.6. growth_journals (2 CHECKs)
                assertCheckConstraint(checksByTable, "growth_journals", "growth_journals_entry_type_check", "entry_type", "GROWTH", "WATERING", "FERTILIZING", "PEST", "OTHER");
                assertCheckConstraint(checksByTable, "growth_journals", "growth_journals_health_status_check", "health_status", "HEALTHY", "NEEDS_ATTENTION", "CRITICAL");

                // 8.7. cameras (1 CHECK)
                assertCheckConstraint(checksByTable, "cameras", "cameras_status_check", "status", "ONLINE", "OFFLINE", "ERROR");

                // 8.8. media_objects (2 CHECKs)
                assertCheckConstraint(checksByTable, "media_objects", "media_objects_size_bytes_check", "size_bytes", "1", "5242880");
                assertCheckConstraint(checksByTable, "media_objects", "media_objects_status_check", "status", "PENDING", "READY", "ATTACHED", "DELETING", "DELETED");

                assertEquals(15, checksByTable.values().stream().mapToInt(Map::size).sum(),
                    "Total count of CHECK constraints across all business tables must be exactly 15");

                // 9. Verify Definitions of All 19 Declared Indexes via PostgreSQL Catalogs
                Map<String, StrictIndexInfo> actualIndexes = new HashMap<>();
                String indexCatalogQuery = """
                    SELECT
                        ic.relname AS index_name,
                        tc.relname AS table_name,
                        am.amname AS access_method,
                        i.indisunique AS is_unique,
                        i.indnkeyatts AS key_attr_count,
                        i.indnatts AS total_attr_count,
                        pg_get_expr(i.indpred, i.indrelid, true) AS partial_predicate,
                        pg_get_indexdef(ic.oid, 0, true) AS full_def,
                        ic.oid AS index_oid
                    FROM pg_index i
                    JOIN pg_class ic ON ic.oid = i.indexrelid
                    JOIN pg_class tc ON tc.oid = i.indrelid
                    JOIN pg_namespace n ON n.oid = ic.relnamespace
                    JOIN pg_am am ON am.oid = ic.relam
                    LEFT JOIN pg_constraint con ON con.conindid = i.indexrelid
                    WHERE n.nspname = 'public'
                      AND tc.relname != 'flyway_schema_history'
                      AND NOT i.indisprimary
                      AND con.oid IS NULL
                    ORDER BY tc.relname, ic.relname
                    """;

                try (Statement stmt = conn.createStatement();
                     PreparedStatement keyStmt = conn.prepareStatement(
                         "SELECT pg_get_indexdef(?, ?, true) AS expr, " +
                         "COALESCE(pg_index_column_has_property(?, ?, 'desc'), false) AS is_desc");
                     ResultSet rs = stmt.executeQuery(indexCatalogQuery)) {
                    while (rs.next()) {
                        String indexName = rs.getString("index_name").toLowerCase();
                        String tableName = rs.getString("table_name").toLowerCase();
                        String accessMethod = rs.getString("access_method").toLowerCase();
                        boolean isUnique = rs.getBoolean("is_unique");
                        int keyAttrCount = rs.getInt("key_attr_count");
                        int totalAttrCount = rs.getInt("total_attr_count");
                        String partialPredicate = rs.getString("partial_predicate");
                        String fullDef = rs.getString("full_def");
                        long indexOid = rs.getLong("index_oid");

                        List<IndexKeyInfo> keys = new ArrayList<>();
                        for (int pos = 1; pos <= keyAttrCount; pos++) {
                            keyStmt.setLong(1, indexOid);
                            keyStmt.setInt(2, pos);
                            keyStmt.setLong(3, indexOid);
                            keyStmt.setInt(4, pos);
                            try (ResultSet keyRs = keyStmt.executeQuery()) {
                                if (keyRs.next()) {
                                    keys.add(new IndexKeyInfo(
                                        pos,
                                        keyRs.getString("expr"),
                                        keyRs.getBoolean("is_desc")
                                    ));
                                }
                            }
                        }

                        actualIndexes.put(indexName, new StrictIndexInfo(
                            indexName, tableName, accessMethod, isUnique, keyAttrCount, totalAttrCount, partialPredicate, fullDef, keys
                        ));
                    }
                }

                assertEquals(21, actualIndexes.size(),
                    "Total count of explicit non-constraint indexes across public schema business tables must be exactly 21");

                // 9.1. Users (2 UNIQUE partial indexes)
                assertIndexDefinition(actualIndexes, "idx_users_email_unique", "users", true, "btree",
                    List.of(new ExpectedKey("email", false)), "email IS NOT NULL");
                assertIndexDefinition(actualIndexes, "idx_users_phone_unique", "users", true, "btree",
                    List.of(new ExpectedKey("phone_number", false)), "phone_number IS NOT NULL");

                // 9.2. Plant Species (2 btree + 1 GIN index)
                assertIndexDefinition(actualIndexes, "idx_species_category", "plant_species", false, "btree",
                    List.of(new ExpectedKey("category", false)), null);
                assertIndexDefinition(actualIndexes, "idx_species_active", "plant_species", false, "btree",
                    List.of(new ExpectedKey("is_active", false)), null);
                assertIndexDefinition(actualIndexes, "idx_plant_species_search_gin", "plant_species", false, "gin",
                    List.of(new ExpectedKey("to_tsvector('simple', common_name || ' ' || scientific_name)", false)), null);

                // 9.3. Gardens (1 index)
                assertIndexDefinition(actualIndexes, "idx_gardens_owner_id", "gardens", false, "btree",
                    List.of(new ExpectedKey("owner_id", false)), null);

                // 9.4. User Plants (3 indexes)
                assertIndexDefinition(actualIndexes, "idx_user_plants_owner_id", "user_plants", false, "btree",
                    List.of(new ExpectedKey("owner_id", false)), null);
                assertIndexDefinition(actualIndexes, "idx_user_plants_garden_id", "user_plants", false, "btree",
                    List.of(new ExpectedKey("garden_id", false)), null);
                assertIndexDefinition(actualIndexes, "idx_user_plants_species_id", "user_plants", false, "btree",
                    List.of(new ExpectedKey("species_id", false)), null);

                // 9.5. Care Schedules (3 indexes, 1 partial)
                assertIndexDefinition(actualIndexes, "idx_care_schedules_plant_id", "care_schedules", false, "btree",
                    List.of(new ExpectedKey("user_plant_id", false)), null);
                assertIndexDefinition(actualIndexes, "idx_care_schedules_owner_id", "care_schedules", false, "btree",
                    List.of(new ExpectedKey("owner_id", false)), null);
                assertIndexDefinition(actualIndexes, "idx_care_schedules_active", "care_schedules", false, "btree",
                    List.of(new ExpectedKey("next_scheduled_at", false)), "status = 'ACTIVE'");

                // 9.6. Care Logs (4 indexes, 1 partial, 1 DESC)
                assertIndexDefinition(actualIndexes, "idx_care_logs_plant_id", "care_logs", false, "btree",
                    List.of(new ExpectedKey("user_plant_id", false)), null);
                assertIndexDefinition(actualIndexes, "idx_care_logs_schedule_id", "care_logs", false, "btree",
                    List.of(new ExpectedKey("schedule_id", false)), "schedule_id IS NOT NULL");
                assertIndexDefinition(actualIndexes, "idx_care_logs_performed_by", "care_logs", false, "btree",
                    List.of(new ExpectedKey("performed_by", false)), null);
                assertIndexDefinition(actualIndexes, "idx_care_logs_performed_at", "care_logs", false, "btree",
                    List.of(new ExpectedKey("performed_at DESC", true)), null);

                // 9.7. Growth Journals (2 indexes, 1 DESC)
                assertIndexDefinition(actualIndexes, "idx_growth_journals_plant_id", "growth_journals", false, "btree",
                    List.of(new ExpectedKey("user_plant_id", false)), null);
                assertIndexDefinition(actualIndexes, "idx_growth_journals_recorded_at", "growth_journals", false, "btree",
                    List.of(new ExpectedKey("recorded_at DESC", true)), null);

                // 9.8. Cameras (1 index)
                assertIndexDefinition(actualIndexes, "idx_cameras_garden_id", "cameras", false, "btree",
                    List.of(new ExpectedKey("garden_id", false)), null);

                // 9.9. Media Objects (2 indexes, 1 compound with DESC)
                assertIndexDefinition(actualIndexes, "idx_media_objects_owner_created", "media_objects", false, "btree",
                    List.of(new ExpectedKey("owner_id", false), new ExpectedKey("created_at DESC", true)), null);
                assertIndexDefinition(actualIndexes, "idx_media_objects_status", "media_objects", false, "btree",
                    List.of(new ExpectedKey("status", false)), null);

                // 10. Verify Camera table column lengths match V1 & Camera entity @Column definitions
                try (Statement stmt = conn.createStatement();
                     ResultSet rs = stmt.executeQuery(
                         "SELECT column_name, character_maximum_length, is_nullable " +
                         "FROM information_schema.columns " +
                         "WHERE table_schema = 'public' AND table_name = 'cameras' AND column_name IN ('name', 'status')")) {
                    Map<String, Integer> camLengths = new HashMap<>();
                    while (rs.next()) {
                        camLengths.put(rs.getString("column_name").toLowerCase(), rs.getInt("character_maximum_length"));
                        assertEquals("NO", rs.getString("is_nullable"));
                    }
                    assertEquals(200, camLengths.get("name"), "cameras.name must be VARCHAR(200)");
                    assertEquals(20, camLengths.get("status"), "cameras.status must be VARCHAR(20)");
                }

                // 11. Verify media_objects table column lengths match V2 & Media entity @Column definitions
                try (Statement stmt = conn.createStatement();
                     ResultSet rs = stmt.executeQuery(
                         "SELECT column_name, character_maximum_length, is_nullable " +
                         "FROM information_schema.columns " +
                         "WHERE table_schema = 'public' AND table_name = 'media_objects' AND column_name IN ('bucket', 'object_key', 'mime_type', 'sha256', 'status')")) {
                    Map<String, Integer> mediaLengths = new HashMap<>();
                    while (rs.next()) {
                        mediaLengths.put(rs.getString("column_name").toLowerCase(), rs.getInt("character_maximum_length"));
                        assertEquals("NO", rs.getString("is_nullable"));
                    }
                    assertEquals(100, mediaLengths.get("bucket"), "media_objects.bucket must be VARCHAR(100)");
                    assertEquals(500, mediaLengths.get("object_key"), "media_objects.object_key must be VARCHAR(500)");
                    assertEquals(100, mediaLengths.get("mime_type"), "media_objects.mime_type must be VARCHAR(100)");
                    assertEquals(64, mediaLengths.get("sha256"), "media_objects.sha256 must be CHAR(64)");
                    assertEquals(20, mediaLengths.get("status"), "media_objects.status must be VARCHAR(20)");
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
                    "gardens", "user_plants", "care_schedules", "care_logs", "growth_journals", "cameras", "media_objects"
                );
                for (String expected : coreJpaTables) {
                    assertTrue(actualTables.contains(expected), "Missing expected table in H2: " + expected);
                }
            }

            // Always verify Camera JPA @Column lengths stay synchronized with V1__initial_schema.sql
            Column cameraStatusCol = Camera.class.getDeclaredField("status").getAnnotation(Column.class);
            assertNotNull(cameraStatusCol);
            assertEquals("status", cameraStatusCol.name());
            assertFalse(cameraStatusCol.nullable());
            assertEquals(20, cameraStatusCol.length(), "Camera.status @Column length must match V1 VARCHAR(20)");

            Column cameraNameCol = Camera.class.getDeclaredField("name").getAnnotation(Column.class);
            assertNotNull(cameraNameCol);
            assertEquals("name", cameraNameCol.name());
            assertFalse(cameraNameCol.nullable());
            assertEquals(200, cameraNameCol.length(), "Camera.name @Column length must match V1 VARCHAR(200)");

            // Always verify Media JPA @Column lengths stay synchronized with V2__media_objects.sql
            Column mediaStatusCol = Media.class.getDeclaredField("status").getAnnotation(Column.class);
            assertNotNull(mediaStatusCol);
            assertEquals("status", mediaStatusCol.name());
            assertFalse(mediaStatusCol.nullable());
            assertEquals(20, mediaStatusCol.length(), "Media.status @Column length must match V2 VARCHAR(20)");

            Column mediaBucketCol = Media.class.getDeclaredField("bucket").getAnnotation(Column.class);
            assertNotNull(mediaBucketCol);
            assertEquals("bucket", mediaBucketCol.name());
            assertFalse(mediaBucketCol.nullable());
            assertEquals(100, mediaBucketCol.length(), "Media.bucket @Column length must match V2 VARCHAR(100)");

            Column mediaObjectKeyCol = Media.class.getDeclaredField("objectKey").getAnnotation(Column.class);
            assertNotNull(mediaObjectKeyCol);
            assertEquals("object_key", mediaObjectKeyCol.name());
            assertFalse(mediaObjectKeyCol.nullable());
            assertEquals(500, mediaObjectKeyCol.length(), "Media.objectKey @Column length must match V2 VARCHAR(500)");

            Column mediaMimeCol = Media.class.getDeclaredField("mimeType").getAnnotation(Column.class);
            assertNotNull(mediaMimeCol);
            assertEquals("mime_type", mediaMimeCol.name());
            assertFalse(mediaMimeCol.nullable());
            assertEquals(100, mediaMimeCol.length(), "Media.mimeType @Column length must match V2 VARCHAR(100)");

            Column mediaShaCol = Media.class.getDeclaredField("sha256").getAnnotation(Column.class);
            assertNotNull(mediaShaCol);
            assertEquals("sha256", mediaShaCol.name());
            assertFalse(mediaShaCol.nullable());
            assertEquals(64, mediaShaCol.length(), "Media.sha256 @Column length must match V2 CHAR(64)");

            Column mediaSizeBytesCol = Media.class.getDeclaredField("sizeBytes").getAnnotation(Column.class);
            assertNotNull(mediaSizeBytesCol);
            assertEquals("size_bytes", mediaSizeBytesCol.name());
            assertFalse(mediaSizeBytesCol.nullable());
        }
    }

    private void assertCheckConstraint(
        Map<String, Map<String, String>> checksByTable,
        String tableName,
        String constraintName,
        String... requiredTokens
    ) {
        Map<String, String> tableChecks = checksByTable.get(tableName.toLowerCase());
        assertNotNull(tableChecks, "Table '" + tableName + "' has no CHECK constraints registered in catalog");

        String def = tableChecks.get(constraintName.toLowerCase());
        assertNotNull(def, "Missing expected CHECK constraint '" + constraintName + "' on table '" + tableName + "'");

        String normalizedDef = def.replace("\"", "").replace("'", "").toUpperCase();
        for (String token : requiredTokens) {
            String normalizedToken = token.replace("\"", "").replace("'", "").toUpperCase();
            assertTrue(normalizedDef.contains(normalizedToken),
                "CHECK constraint '" + constraintName + "' on table '" + tableName +
                "' definition [" + def + "] must contain expected fragment [" + token + "]");
        }
    }

    private void assertIndexDefinition(
        Map<String, StrictIndexInfo> actualIndexes,
        String indexName,
        String expectedTable,
        boolean expectedUnique,
        String expectedMethod,
        List<ExpectedKey> expectedKeys,
        String expectedWherePredicate
    ) {
        StrictIndexInfo idx = actualIndexes.get(indexName.toLowerCase());
        assertNotNull(idx, "Missing required index in PostgreSQL catalog: " + indexName);

        // 1. Table name exact match
        assertEquals(expectedTable.toLowerCase(), idx.tableName().toLowerCase(),
            "Index " + indexName + " table mismatch: expected [" + expectedTable + "] but was [" + idx.tableName() + "]");

        // 2. Exact UNIQUE assertion (must match both true and false via pg_index.indisunique)
        assertEquals(expectedUnique, idx.isUnique(),
            "Index " + indexName + " uniqueness mismatch: expected " + expectedUnique + " but was " + idx.isUnique());

        // 3. Exact Access Method (btree, gin via pg_am.amname)
        assertEquals(expectedMethod.toLowerCase(), idx.accessMethod().toLowerCase(),
            "Index " + indexName + " access method mismatch: expected [" + expectedMethod + "] but was [" + idx.accessMethod() + "]");

        // 4. Key attributes and total attributes count (verifying no INCLUDE columns)
        assertEquals(expectedKeys.size(), idx.keyAttrCount(),
            "Index " + indexName + " key attributes count mismatch (indnkeyatts): expected " + expectedKeys.size() + " but was " + idx.keyAttrCount());
        assertEquals(expectedKeys.size(), idx.totalAttrCount(),
            "Index " + indexName + " total attributes count mismatch (indnatts): expected " + expectedKeys.size() + " but was " + idx.totalAttrCount());
        assertEquals(idx.keyAttrCount(), idx.totalAttrCount(),
            "Index " + indexName + " must not have included attributes (indnatts == indnkeyatts required)");
        assertEquals(expectedKeys.size(), idx.keyExpressions().size(),
            "Index " + indexName + " retrieved key expressions count mismatch");

        // 5. Verify Each Key Expression and sort order (ASC vs DESC via pg_index_column_has_property)
        for (int i = 0; i < expectedKeys.size(); i++) {
            ExpectedKey expectedKey = expectedKeys.get(i);
            IndexKeyInfo actualKey = idx.keyExpressions().get(i);

            assertEquals(i + 1, actualKey.position(),
                "Index " + indexName + " key position ordinal mismatch");

            // Explicit ASC/DESC check
            assertEquals(expectedKey.isDesc(), actualKey.isDesc(),
                "Index " + indexName + " column at position " + (i + 1) + " sort order mismatch: expected DESC=" + expectedKey.isDesc() + ", actual=" + actualKey.isDesc());

            if (expectedKey.isDesc()) {
                assertTrue(idx.fullDef().toLowerCase().contains(expectedKey.rawExpression().toLowerCase()),
                    "Index " + indexName + " full definition must declare sort direction [" + expectedKey.rawExpression() + "]: " + idx.fullDef());
            }

            // Expression verification (column/expression without trailing direction clause)
            String expectedExprRaw = expectedKey.rawExpression();
            if (expectedExprRaw.toUpperCase().endsWith(" DESC")) {
                expectedExprRaw = expectedExprRaw.substring(0, expectedExprRaw.length() - 5).trim();
            } else if (expectedExprRaw.toUpperCase().endsWith(" ASC")) {
                expectedExprRaw = expectedExprRaw.substring(0, expectedExprRaw.length() - 4).trim();
            }

            String actualClean = normalizeSqlExpression(actualKey.expression());
            String expectedClean = normalizeSqlExpression(expectedExprRaw);

            assertEquals(expectedClean, actualClean,
                "Index " + indexName + " key expression at position " + (i + 1) + " mismatch: expected [" + expectedKey.rawExpression() + "] but was [" + actualKey.expression() + "]");

            // For GIN index expression, verify all required tokens explicitly
            if ("gin".equalsIgnoreCase(expectedMethod)) {
                String rawLower = actualKey.expression().toLowerCase();
                assertTrue(rawLower.contains("to_tsvector"), "GIN index " + indexName + " expression must call to_tsvector");
                assertTrue(rawLower.contains("'simple'"), "GIN index " + indexName + " expression must use 'simple' config");
                assertTrue(rawLower.contains("common_name"), "GIN index " + indexName + " expression must reference common_name");
                assertTrue(rawLower.contains("' '"), "GIN index " + indexName + " expression must include literal space separator");
                assertTrue(rawLower.contains("scientific_name"), "GIN index " + indexName + " expression must reference scientific_name");
                assertTrue(actualKey.expression().contains("||"), "GIN index " + indexName + " expression must use concatenation operator ||");
            }
        }

        // 6. Partial index WHERE predicate (via pg_get_expr(indpred, indrelid, true))
        if (expectedWherePredicate == null) {
            assertNull(idx.partialPredicate(),
                "Index " + indexName + " must NOT have a partial WHERE clause (indpred must be NULL), but found: " + idx.partialPredicate());
        } else {
            assertNotNull(idx.partialPredicate(),
                "Index " + indexName + " must have a partial WHERE clause, but indpred was NULL");

            String actualPredClean = normalizeSqlPredicate(idx.partialPredicate());
            String expectedPredClean = normalizeSqlPredicate(expectedWherePredicate);

            assertEquals(expectedPredClean, actualPredClean,
                "Index " + indexName + " partial WHERE predicate mismatch: expected [" + expectedWherePredicate + "] but was [" + idx.partialPredicate() + "]");
        }
    }

    static final class Token {
        enum Type {
            STRING_LITERAL,
            QUOTED_IDENTIFIER,
            IDENTIFIER,
            OPERATOR,
            COMMA,
            LPAREN,
            RPAREN,
            OTHER
        }

        final Type type;
        final String text;

        Token(Type type, String text) {
            this.type = type;
            this.text = text;
        }

        @Override
        public String toString() {
            return text;
        }
    }

    private static final Set<String> KEYWORD_OPERATORS = Set.of(
        "and", "or", "not", "is", "in", "like", "ilike", "where", "on", "as", "by", "from", "select", "case", "when", "then", "else"
    );

    static boolean isKeywordOperator(String text) {
        return KEYWORD_OPERATORS.contains(text.toLowerCase());
    }

    static List<Token> tokenize(String sql) {
        if (sql == null) {
            return Collections.emptyList();
        }
        List<Token> tokens = new ArrayList<>();
        int i = 0;
        int n = sql.length();
        while (i < n) {
            char c = sql.charAt(i);

            // 1. Whitespace outside literals
            if (Character.isWhitespace(c)) {
                i++;
                continue;
            }

            // 2. String literal: '...' (supports '' escape)
            if (c == '\'') {
                int start = i;
                i++;
                while (i < n) {
                    if (sql.charAt(i) == '\'') {
                        if (i + 1 < n && sql.charAt(i + 1) == '\'') {
                            i += 2; // skip escaped ''
                        } else {
                            i++; // consume closing quote
                            break;
                        }
                    } else {
                        i++;
                    }
                }
                tokens.add(new Token(Token.Type.STRING_LITERAL, sql.substring(start, i)));
                continue;
            }

            // 3. Quoted identifier: "..." (supports "" escape)
            if (c == '"') {
                int start = i;
                i++;
                while (i < n) {
                    if (sql.charAt(i) == '"') {
                        if (i + 1 < n && sql.charAt(i + 1) == '"') {
                            i += 2; // skip escaped ""
                        } else {
                            i++; // consume closing quote
                            break;
                        }
                    } else {
                        i++;
                    }
                }
                tokens.add(new Token(Token.Type.QUOTED_IDENTIFIER, sql.substring(start, i)));
                continue;
            }

            // 4. PostgreSQL Typecast ::type outside literals/identifiers
            if (c == ':' && i + 1 < n && sql.charAt(i + 1) == ':') {
                int j = i + 2;
                while (j < n && Character.isWhitespace(sql.charAt(j))) {
                    j++;
                }
                String rest = sql.substring(j).toLowerCase();
                if (rest.startsWith("character varying") || rest.startsWith("character  varying")) {
                    int len = rest.startsWith("character  varying") ? "character  varying".length() : "character varying".length();
                    int end = j + len;
                    if (end >= n || (!Character.isLetterOrDigit(sql.charAt(end)) && sql.charAt(end) != '_')) {
                        i = end;
                        continue; // drop system cast
                    }
                } else if (rest.startsWith("varchar")) {
                    int end = j + "varchar".length();
                    if (end >= n || (!Character.isLetterOrDigit(sql.charAt(end)) && sql.charAt(end) != '_')) {
                        i = end;
                        continue; // drop system cast
                    }
                } else if (rest.startsWith("regconfig")) {
                    int end = j + "regconfig".length();
                    if (end >= n || (!Character.isLetterOrDigit(sql.charAt(end)) && sql.charAt(end) != '_')) {
                        i = end;
                        continue; // drop system cast
                    }
                } else if (rest.startsWith("text")) {
                    int end = j + "text".length();
                    if (end >= n || (!Character.isLetterOrDigit(sql.charAt(end)) && sql.charAt(end) != '_')) {
                        i = end;
                        continue; // drop system cast
                    }
                }
                tokens.add(new Token(Token.Type.OPERATOR, "::"));
                i += 2;
                continue;
            }

            // 5. Parentheses and Comma
            if (c == '(') {
                tokens.add(new Token(Token.Type.LPAREN, "("));
                i++;
                continue;
            }
            if (c == ')') {
                tokens.add(new Token(Token.Type.RPAREN, ")"));
                i++;
                continue;
            }
            if (c == ',') {
                tokens.add(new Token(Token.Type.COMMA, ","));
                i++;
                continue;
            }

            // 6. Operators: ||, !=, <>, <=, >=, =, <, >
            if (c == '|' && i + 1 < n && sql.charAt(i + 1) == '|') {
                tokens.add(new Token(Token.Type.OPERATOR, "||"));
                i += 2;
                continue;
            }
            if ((c == '!' || c == '<') && i + 1 < n && sql.charAt(i + 1) == '=') {
                tokens.add(new Token(Token.Type.OPERATOR, sql.substring(i, i + 2)));
                i += 2;
                continue;
            }
            if (c == '<' && i + 1 < n && sql.charAt(i + 1) == '>') {
                tokens.add(new Token(Token.Type.OPERATOR, "<>"));
                i += 2;
                continue;
            }
            if (c == '>' && i + 1 < n && sql.charAt(i + 1) == '=') {
                tokens.add(new Token(Token.Type.OPERATOR, ">="));
                i += 2;
                continue;
            }
            if (c == '=' || c == '<' || c == '>') {
                tokens.add(new Token(Token.Type.OPERATOR, String.valueOf(c)));
                i++;
                continue;
            }

            // 7. Unquoted Identifier / Keyword / Number
            if (Character.isLetterOrDigit(c) || c == '_') {
                int start = i;
                while (i < n && (Character.isLetterOrDigit(sql.charAt(i)) || sql.charAt(i) == '_')) {
                    i++;
                }
                String word = sql.substring(start, i);
                tokens.add(new Token(Token.Type.IDENTIFIER, word.toLowerCase()));
                continue;
            }

            // 8. Other single symbol
            tokens.add(new Token(Token.Type.OTHER, String.valueOf(c)));
            i++;
        }
        return tokens;
    }

    static List<Token> stripOuterParentheses(List<Token> tokens) {
        while (tokens.size() >= 2 && tokens.get(0).type == Token.Type.LPAREN && tokens.get(tokens.size() - 1).type == Token.Type.RPAREN) {
            int depth = 0;
            boolean wrapsAll = true;
            for (int i = 0; i < tokens.size() - 1; i++) {
                Token t = tokens.get(i);
                if (t.type == Token.Type.LPAREN) depth++;
                else if (t.type == Token.Type.RPAREN) depth--;
                if (depth == 0) {
                    wrapsAll = false;
                    break;
                }
            }
            if (wrapsAll) {
                tokens = new ArrayList<>(tokens.subList(1, tokens.size() - 1));
            } else {
                break;
            }
        }
        return tokens;
    }

    static List<Token> unwrapSingleIdentifierParentheses(List<Token> tokens) {
        boolean modified;
        do {
            modified = false;
            List<Token> result = new ArrayList<>();
            int i = 0;
            while (i < tokens.size()) {
                if (tokens.get(i).type == Token.Type.LPAREN
                    && i + 2 < tokens.size()
                    && (tokens.get(i + 1).type == Token.Type.IDENTIFIER || tokens.get(i + 1).type == Token.Type.QUOTED_IDENTIFIER)
                    && tokens.get(i + 2).type == Token.Type.RPAREN) {

                    boolean isFunctionCall = false;
                    if (!result.isEmpty()) {
                        Token prev = result.get(result.size() - 1);
                        if (prev.type == Token.Type.IDENTIFIER) {
                            if (!isKeywordOperator(prev.text)) {
                                isFunctionCall = true;
                            }
                        } else if (prev.type == Token.Type.QUOTED_IDENTIFIER) {
                            isFunctionCall = true;
                        }
                    }

                    if (!isFunctionCall) {
                        result.add(tokens.get(i + 1));
                        i += 3;
                        modified = true;
                        continue;
                    }
                }
                result.add(tokens.get(i));
                i++;
            }
            tokens = result;
        } while (modified);
        return tokens;
    }

    static int findMatchingParen(List<Token> tokens, int openIdx) {
        int depth = 0;
        for (int i = openIdx; i < tokens.size(); i++) {
            if (tokens.get(i).type == Token.Type.LPAREN) depth++;
            else if (tokens.get(i).type == Token.Type.RPAREN) {
                depth--;
                if (depth == 0) return i;
            }
        }
        return tokens.size() - 1;
    }

    static class TermInfo {
        final int startIdx;
        final int endIdx;
        final boolean isOperator;
        final String opText;

        TermInfo(int startIdx, int endIdx, boolean isOperator, String opText) {
            this.startIdx = startIdx;
            this.endIdx = endIdx;
            this.isOperator = isOperator;
            this.opText = opText;
        }

        boolean isOperator(String op) {
            return isOperator && op.equals(opText);
        }
    }

    static List<TermInfo> parseTermsAndOps(List<Token> tokens) {
        List<TermInfo> list = new ArrayList<>();
        int i = 0;
        while (i < tokens.size()) {
            Token t = tokens.get(i);
            if (t.type == Token.Type.COMMA) {
                list.add(new TermInfo(i, i + 1, false, ","));
                i++;
            } else if (t.type == Token.Type.OPERATOR && t.text.equals("||")) {
                list.add(new TermInfo(i, i + 1, true, "||"));
                i++;
            } else if (t.type == Token.Type.LPAREN) {
                int close = findMatchingParen(tokens, i);
                list.add(new TermInfo(i, close + 1, false, null));
                i = close + 1;
            } else if (t.type == Token.Type.IDENTIFIER && i + 1 < tokens.size() && tokens.get(i + 1).type == Token.Type.LPAREN) {
                int close = findMatchingParen(tokens, i + 1);
                list.add(new TermInfo(i, close + 1, false, null));
                i = close + 1;
            } else {
                list.add(new TermInfo(i, i + 1, false, null));
                i++;
            }
        }
        return list;
    }

    static List<Token> groupConcatChains(List<Token> tokens) {
        if (tokens == null || tokens.isEmpty()) return tokens;

        // 1. Recursively process all parenthesized sub-expressions
        List<Token> processed = new ArrayList<>();
        int i = 0;
        while (i < tokens.size()) {
            Token t = tokens.get(i);
            if (t.type == Token.Type.LPAREN) {
                int close = findMatchingParen(tokens, i);
                List<Token> inside = tokens.subList(i + 1, close);
                List<Token> groupedInside = groupConcatChains(inside);
                processed.add(t);
                processed.addAll(groupedInside);
                processed.add(tokens.get(close));
                i = close + 1;
            } else {
                processed.add(t);
                i++;
            }
        }

        // 2. Process at the current level
        boolean changed;
        do {
            changed = false;
            List<TermInfo> termsAndOps = parseTermsAndOps(processed);
            for (int k = 0; k + 3 < termsAndOps.size(); k++) {
                TermInfo t1 = termsAndOps.get(k);
                TermInfo op1 = termsAndOps.get(k + 1);
                TermInfo t2 = termsAndOps.get(k + 2);
                TermInfo op2 = termsAndOps.get(k + 3);

                if (!t1.isOperator && op1.isOperator("||") && !t2.isOperator && op2.isOperator("||")) {
                    List<Token> next = new ArrayList<>();
                    next.addAll(processed.subList(0, t1.startIdx));
                    next.add(new Token(Token.Type.LPAREN, "("));
                    next.addAll(processed.subList(t1.startIdx, t2.endIdx));
                    next.add(new Token(Token.Type.RPAREN, ")"));
                    next.addAll(processed.subList(t2.endIdx, processed.size()));
                    processed = next;
                    changed = true;
                    break;
                }
            }
        } while (changed);

        return processed;
    }

    static String formatTokens(List<Token> tokens) {
        if (tokens == null || tokens.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < tokens.size(); i++) {
            Token t = tokens.get(i);
            Token prev = (i > 0) ? tokens.get(i - 1) : null;

            if (t.type == Token.Type.COMMA) {
                sb.append(", ");
            } else if (t.type == Token.Type.OPERATOR) {
                if (sb.length() > 0 && sb.charAt(sb.length() - 1) != ' ' && sb.charAt(sb.length() - 1) != '(') {
                    sb.append(' ');
                }
                sb.append(t.text);
                sb.append(' ');
            } else if (t.type == Token.Type.LPAREN) {
                if (prev != null && prev.type == Token.Type.IDENTIFIER && !isKeywordOperator(prev.text)) {
                    // Function call: no space before '(' (e.g. to_tsvector()
                } else if (sb.length() > 0 && sb.charAt(sb.length() - 1) != ' ' && sb.charAt(sb.length() - 1) != '(') {
                    sb.append(' ');
                }
                sb.append('(');
            } else if (t.type == Token.Type.RPAREN) {
                while (sb.length() > 0 && sb.charAt(sb.length() - 1) == ' ') {
                    sb.deleteCharAt(sb.length() - 1);
                }
                sb.append(')');
            } else {
                // IDENTIFIER, QUOTED_IDENTIFIER, STRING_LITERAL, OTHER
                if (sb.length() > 0 && sb.charAt(sb.length() - 1) != ' ' && sb.charAt(sb.length() - 1) != '(') {
                    sb.append(' ');
                }
                sb.append(t.text);
            }
        }
        return sb.toString().trim();
    }

    static String normalizeSqlExpression(String sql) {
        if (sql == null) {
            return null;
        }
        List<Token> tokens = tokenize(sql);
        tokens = stripOuterParentheses(tokens);
        tokens = unwrapSingleIdentifierParentheses(tokens);
        tokens = stripOuterParentheses(tokens);
        tokens = groupConcatChains(tokens);
        return formatTokens(tokens);
    }

    static String normalizeSqlPredicate(String sql) {
        return normalizeSqlExpression(sql);
    }

    static String stripRedundantOuterParentheses(String s) {
        if (s == null) {
            return null;
        }
        List<Token> tokens = tokenize(s);
        tokens = stripOuterParentheses(tokens);
        return formatTokens(tokens);
    }

    static String canonicalizeSqlTokens(String s) {
        if (s == null) {
            return null;
        }
        List<Token> tokens = tokenize(s);
        return formatTokens(tokens);
    }

    @Test
    @DisplayName("Regression: Safe SQL Normalizer preserves expression grouping structure and distinguishes operator precedence")
    void safeSqlNormalizer_PreservesGroupingStructure() {
        // 1. Boolean grouping precedence must NOT be conflated
        String expr1 = "a AND (b OR c)";
        String expr2 = "(a AND b) OR c";
        assertNotEquals(normalizeSqlExpression(expr1), normalizeSqlExpression(expr2),
            "Normalizer must preserve boolean grouping: 'a AND (b OR c)' must not equal '(a AND b) OR c'");

        // 2. Concatenation grouping order must NOT be conflated
        String leftGrouped = "to_tsvector('simple', (common_name || ' ') || scientific_name)";
        String rightGrouped = "to_tsvector('simple', common_name || (' ' || scientific_name))";
        assertNotEquals(normalizeSqlExpression(leftGrouped), normalizeSqlExpression(rightGrouped),
            "Normalizer must distinguish left-associative from right-associative string concatenation");

        // 3. PostgreSQL system casts are safely normalized without losing expression structure
        String rawPg = "to_tsvector('simple'::regconfig, (common_name::text || ' '::text) || scientific_name::text)";
        assertEquals(normalizeSqlExpression(leftGrouped), normalizeSqlExpression(rawPg),
            "PostgreSQL decompiled GIN expression must match left-grouped canonical expression");

        // 4. Unparenthesized concatenation canonically normalizes to left-grouped form
        String unparenthesized = "to_tsvector('simple', common_name || ' ' || scientific_name)";
        assertEquals(normalizeSqlExpression(leftGrouped), normalizeSqlExpression(unparenthesized),
            "Unparenthesized concatenation must canonically normalize to left-grouped form");

        // 5. Partial predicates outer parens and casting normalized safely
        String rawPred = "((status)::text = 'ACTIVE'::text)";
        assertEquals("status = 'ACTIVE'", normalizeSqlPredicate(rawPred));

        // 6. String literals containing typecast patterns or parentheses must NOT be altered
        assertNotEquals(
            normalizeSqlExpression("note = 'literal::text'"),
            normalizeSqlExpression("note = 'literal'")
        );
        assertEquals("note = 'literal::text'", normalizeSqlExpression("note = 'literal::text'"));

        assertNotEquals(
            normalizeSqlExpression("name = '(status)'"),
            normalizeSqlExpression("name = 'status'")
        );
        assertEquals("name = '(status)'", normalizeSqlExpression("name = '(status)'"));

        // 7. Quoted identifiers must preserve case-sensitivity
        assertNotEquals(
            normalizeSqlExpression("\"MixedCase\""),
            normalizeSqlExpression("\"mixedcase\"")
        );
        assertEquals("\"MixedCase\"", normalizeSqlExpression("\"MixedCase\""));
        assertEquals("\"mixedcase\"", normalizeSqlExpression("\"mixedcase\""));

        // 8. Escaped single quotes within literals must be preserved
        assertEquals("note = 'it''s a plant'", normalizeSqlExpression("note = 'it''s a plant'"));
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
