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

    record ColumnTypeInfo(String dataType, String udtName) {}

    record IndexKeyInfo(int position, String expression, boolean isDesc) {}

    record StrictIndexInfo(
        String indexName,
        String tableName,
        String accessMethod,
        boolean isUnique,
        int keyAttrCount,
        String partialPredicate,
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

                // 1. Verify flyway_schema_history exists and V1 migration succeeded
                try (Statement stmt = conn.createStatement()) {
                    try (ResultSet rs = stmt.executeQuery(
                        "SELECT version, description, success, installed_on FROM flyway_schema_history WHERE version = '1'")) {
                        assertTrue(rs.next(), "flyway_schema_history must contain record for version 1");
                        assertEquals("initial schema", rs.getString("description").toLowerCase());
                        assertTrue(rs.getBoolean("success"), "Migration V1 must have success = true");
                    }
                }

                // 2. Verify exactly the 11 business tables exist in PostgreSQL (excluding flyway_schema_history)
                Set<String> actualBusinessTables = new HashSet<>();
                try (ResultSet rs = metaData.getTables(null, "public", "%", new String[]{"TABLE"})) {
                    while (rs.next()) {
                        String tbl = rs.getString("TABLE_NAME").toLowerCase();
                        if (!tbl.equals("flyway_schema_history")) {
                            actualBusinessTables.add(tbl);
                        }
                    }
                }
                assertEquals(ALL_11_TABLES, actualBusinessTables,
                    "PostgreSQL public schema must contain exactly the 11 business tables declared in V1");

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

                assertEquals(13, checksByTable.values().stream().mapToInt(Map::size).sum(),
                    "Total count of CHECK constraints across all business tables must be exactly 13");

                // 9. Verify Definitions of All 19 Declared Indexes via PostgreSQL Catalogs
                Map<String, StrictIndexInfo> actualIndexes = new HashMap<>();
                String indexCatalogQuery = """
                    SELECT
                        ic.relname AS index_name,
                        tc.relname AS table_name,
                        am.amname AS access_method,
                        i.indisunique AS is_unique,
                        i.indnkeyatts AS key_attr_count,
                        pg_get_expr(i.indpred, i.indrelid, true) AS partial_predicate,
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
                        String partialPredicate = rs.getString("partial_predicate");
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
                            indexName, tableName, accessMethod, isUnique, keyAttrCount, partialPredicate, keys
                        ));
                    }
                }

                assertEquals(19, actualIndexes.size(),
                    "Total count of explicit non-constraint indexes across public schema business tables must be exactly 19");

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

        // 4. Key attributes count and ordinality (via pg_index.indnkeyatts)
        assertEquals(expectedKeys.size(), idx.keyAttrCount(),
            "Index " + indexName + " key attributes count mismatch: expected " + expectedKeys.size() + " but was " + idx.keyAttrCount());
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

            // Expression verification
            String actualClean = normalizeSqlExpression(actualKey.expression());
            String expectedClean = normalizeSqlExpression(expectedKey.rawExpression());

            assertEquals(expectedClean, actualClean,
                "Index " + indexName + " key expression at position " + (i + 1) + " mismatch: expected [" + expectedKey.rawExpression() + "] but was [" + actualKey.expression() + "]");

            // For GIN index expression, verify all required tokens explicitly
            if ("gin".equalsIgnoreCase(expectedMethod)) {
                String rawLower = actualKey.expression().toLowerCase();
                assertTrue(rawLower.contains("to_tsvector"), "GIN index " + indexName + " expression must call to_tsvector");
                assertTrue(rawLower.contains("'simple'"), "GIN index " + indexName + " expression must use 'simple' config");
                assertTrue(rawLower.contains("common_name"), "GIN index " + indexName + " expression must reference common_name");
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

    private String normalizeSqlExpression(String expr) {
        if (expr == null) {
            return null;
        }
        return expr.replace("::regconfig", "")
                   .replace("::character varying", "")
                   .replace("::text", "")
                   .replace("(", "")
                   .replace(")", "")
                   .replace(" ", "")
                   .replace("\"", "")
                   .toLowerCase();
    }

    private String normalizeSqlPredicate(String pred) {
        if (pred == null) {
            return null;
        }
        return pred.replace("::character varying", "")
                   .replace("::text", "")
                   .replace("(", "")
                   .replace(")", "")
                   .replace(" ", "")
                   .replace("\"", "")
                   .toLowerCase();
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
