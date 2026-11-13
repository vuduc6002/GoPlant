package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.config.SchedulingConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.scheduling.config.ScheduledTask;
import org.springframework.scheduling.config.ScheduledTaskHolder;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties = {
    "media.reconciliation.scheduling.enabled=false"
})
class MediaReconciliationSchedulingDisabledTest {

    @Autowired(required = false)
    private SchedulingConfig disabledSchedulingConfig;

    @Autowired(required = false)
    private ScheduledTaskHolder disabledScheduledTaskHolder;

    @Test
    @DisplayName("SchedulingConfig bean is NOT loaded when enabled=false")
    void schedulingConfig_IsNotPresent() {
        assertNull(disabledSchedulingConfig, "SchedulingConfig must not be registered when enabled=false");
    }

    @Test
    @DisplayName("scheduledReconcile is NOT registered when scheduling is disabled")
    void scheduledTaskHolder_DoesNotHaveReconciliationTask() {
        if (disabledScheduledTaskHolder != null) {
            Set<ScheduledTask> tasks = disabledScheduledTaskHolder.getScheduledTasks();
            boolean foundReconcileTask = tasks.stream().anyMatch(task -> {
                String taskDesc = task.getTask().toString();
                return taskDesc.contains("scheduledReconcile") || taskDesc.contains("MediaReconciliationService");
            });
            assertFalse(foundReconcileTask, "scheduledReconcile must NOT be registered when scheduling is disabled");
        }
    }
}
