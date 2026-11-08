package com.cmc.plant_care_backend;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class DatabaseSchemaIntegrationTest {

    @Autowired
    private DataSource dataSource;

    @Test
    void databaseSchema_AllTablesExist() throws Exception {
        Set<String> coreJpaTables = Set.of(
            "roles",
            "users",
            "user_roles",
            "plant_species",
            "user_favorite_species",
            "gardens",
            "user_plants",
            "care_schedules",
            "care_logs",
            "growth_journals"
        );

        Set<String> actualTables = new HashSet<>();
        try (Connection conn = dataSource.getConnection()) {
            DatabaseMetaData metaData = conn.getMetaData();
            try (ResultSet rs = metaData.getTables(null, null, "%", new String[]{"TABLE"})) {
                while (rs.next()) {
                    String tableName = rs.getString("TABLE_NAME").toLowerCase();
                    actualTables.add(tableName);
                }
            }

            for (String expected : coreJpaTables) {
                assertTrue(actualTables.contains(expected), "Missing expected table: " + expected);
            }

            // If running against real PostgreSQL (Flyway migration active), verify all 11 tables and seed data
            if ("PostgreSQL".equalsIgnoreCase(metaData.getDatabaseProductName())) {
                assertTrue(actualTables.contains("cameras"), "PostgreSQL with Flyway must have cameras table");
                try (Statement stmt = conn.createStatement()) {
                    try (ResultSet rs = stmt.executeQuery("SELECT COUNT(*) FROM roles")) {
                        assertTrue(rs.next());
                        assertEquals(2, rs.getInt(1), "PostgreSQL must have 2 seed roles");
                    }
                    try (ResultSet rs = stmt.executeQuery("SELECT COUNT(*) FROM plant_species")) {
                        assertTrue(rs.next());
                        assertTrue(rs.getInt(1) >= 5, "PostgreSQL must have at least 5 seed species");
                    }
                }
            }
        }
    }
}
