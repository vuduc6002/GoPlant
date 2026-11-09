package com.cmc.plant_care_backend;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class DatabaseSchemaIntegrationTest {

    @Autowired
    private DataSource dataSource;

    @Autowired
    private Environment environment;

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
    @DisplayName("Verify Database Schema, Flyway Migration V1, Tables, Constraints, and Seed Data")
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

                // 3. Verify seed roles
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

                    // 4. Verify seed plant species
                    try (ResultSet rs = stmt.executeQuery("SELECT COUNT(*) FROM plant_species WHERE is_active = true")) {
                        assertTrue(rs.next());
                        assertTrue(rs.getInt(1) >= 5, "plant_species must contain at least 5 default active species");
                    }

                    // 5. Verify PostgreSQL column types for image_urls (TEXT[])
                    try (ResultSet rs = metaData.getColumns(null, "public", "care_logs", "image_urls")) {
                        assertTrue(rs.next(), "care_logs.image_urls column must exist");
                        String typeName = rs.getString("TYPE_NAME");
                        assertTrue(typeName.contains("text") || typeName.contains("_text") || typeName.equalsIgnoreCase("ARRAY"),
                            "care_logs.image_urls must be text array, was: " + typeName);
                    }
                    try (ResultSet rs = metaData.getColumns(null, "public", "growth_journals", "image_urls")) {
                        assertTrue(rs.next(), "growth_journals.image_urls column must exist");
                        String typeName = rs.getString("TYPE_NAME");
                        assertTrue(typeName.contains("text") || typeName.contains("_text") || typeName.equalsIgnoreCase("ARRAY"),
                            "growth_journals.image_urls must be text array, was: " + typeName);
                    }

                    // 6. Verify Foreign Key Constraints on critical relationships
                    try (ResultSet rs = metaData.getImportedKeys(null, "public", "user_plants")) {
                        Set<String> fkTables = new HashSet<>();
                        while (rs.next()) {
                            fkTables.add(rs.getString("PKTABLE_NAME").toLowerCase());
                        }
                        assertTrue(fkTables.contains("users"), "user_plants must reference users (owner_id)");
                        assertTrue(fkTables.contains("gardens"), "user_plants must reference gardens (garden_id)");
                        assertTrue(fkTables.contains("plant_species"), "user_plants must reference plant_species (species_id)");
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
}
