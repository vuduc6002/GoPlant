package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.common.exception.ForbiddenException;
import com.cmc.plant_care_backend.common.exception.ResourceNotFoundException;
import com.cmc.plant_care_backend.dto.carelog.CareLogResponse;
import com.cmc.plant_care_backend.dto.carelog.CreateCareLogRequest;
import com.cmc.plant_care_backend.model.CareLog;
import com.cmc.plant_care_backend.model.User;
import com.cmc.plant_care_backend.model.UserPlant;
import com.cmc.plant_care_backend.model.enums.CareLogStatus;
import com.cmc.plant_care_backend.repository.CareLogRepository;
import com.cmc.plant_care_backend.repository.UserPlantRepository;
import com.cmc.plant_care_backend.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CareLogServiceTest {

    @Mock
    private CareLogRepository careLogRepository;
    @Mock
    private UserPlantRepository userPlantRepository;
    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private CareLogService careLogService;

    private UUID userId;
    private User user;
    private UUID plantId;
    private UserPlant plant;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
        user = new User();
        user.setId(userId);

        plantId = UUID.randomUUID();
        plant = new UserPlant();
        plant.setId(plantId);
        plant.setOwner(user);
    }

    @Test
    void createCareLog_Success() {
        CreateCareLogRequest req = new CreateCareLogRequest();
        req.setUserPlantId(plantId);
        req.setTaskType("FERTILIZING");
        req.setNote("Bón phân trùn quế");
        req.setImageUrls(List.of("https://example.com/bon-phan.jpg"));
        req.setPerformedAt(OffsetDateTime.now());

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userPlantRepository.findById(plantId)).thenReturn(Optional.of(plant));
        when(careLogRepository.save(any(CareLog.class))).thenAnswer(i -> {
            CareLog l = i.getArgument(0);
            l.setId(UUID.randomUUID());
            return l;
        });

        CareLogResponse res = careLogService.createCareLog(userId, req);

        assertNotNull(res);
        assertEquals("FERTILIZING", res.getTaskType());
        assertEquals(CareLogStatus.COMPLETED, res.getStatus());
        assertEquals("Bón phân trùn quế", res.getNote());
        assertEquals(1, res.getImageUrls().size());
    }

    @Test
    void createCareLog_PlantNotFound_ThrowsResourceNotFound() {
        CreateCareLogRequest req = new CreateCareLogRequest();
        req.setUserPlantId(plantId);
        req.setTaskType("WATERING");

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userPlantRepository.findById(plantId)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () ->
            careLogService.createCareLog(userId, req));
    }

    @Test
    void createCareLog_NotPlantOwner_ThrowsForbidden() {
        User other = new User();
        other.setId(UUID.randomUUID());
        plant.setOwner(other);

        CreateCareLogRequest req = new CreateCareLogRequest();
        req.setUserPlantId(plantId);
        req.setTaskType("WATERING");

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userPlantRepository.findById(plantId)).thenReturn(Optional.of(plant));

        assertThrows(ForbiddenException.class, () ->
            careLogService.createCareLog(userId, req));
    }
}
