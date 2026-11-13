package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.config.SchedulingConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.NoSuchBeanDefinitionException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.scheduling.config.ScheduledTask;
import org.springframework.scheduling.config.ScheduledTaskHolder;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties = {
    "media.reconciliation.scheduling.enabled=true",
    "media.reconciliation.initial-delay-ms=60000",
    "media.reconciliation.fixed-delay-ms=900000"
})
class MediaReconciliationSchedulingTest {

    @Autowired
    private ApplicationContext applicationContext;

    @Autowired(required = false)
    private SchedulingConfig schedulingConfig;

    @Autowired(required = false)
    private ScheduledTaskHolder scheduledTaskHolder;

    @Test
    @DisplayName("SchedulingConfig bean is active in ApplicationContext when enabled=true")
    void schedulingConfig_IsPresent() {
        assertNotNull(schedulingConfig, "SchedulingConfig must be registered when enabled=true");
    }

    @Test
    @DisplayName("ScheduledTaskHolder registers real scheduled task for scheduledReconcile")
    void scheduledTaskHolder_HasReconciliationTask() {
        assertNotNull(scheduledTaskHolder, "ScheduledTaskHolder must be available");
        Set<ScheduledTask> tasks = scheduledTaskHolder.getScheduledTasks();
        assertFalse(tasks.isEmpty(), "At least one scheduled task must be registered");

        boolean foundReconcileTask = tasks.stream().anyMatch(task -> {
            String taskDesc = task.getTask().toString();
            return taskDesc.contains("scheduledReconcile") || taskDesc.contains("MediaReconciliationService");
        });

        assertTrue(foundReconcileTask, "ScheduledTaskHolder must register MediaReconciliationService.scheduledReconcile");
    }
}
