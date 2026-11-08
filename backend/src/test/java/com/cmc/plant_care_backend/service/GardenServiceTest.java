package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.common.exception.ConflictException;
import com.cmc.plant_care_backend.common.exception.ForbiddenException;
import com.cmc.plant_care_backend.common.exception.ResourceNotFoundException;
import com.cmc.plant_care_backend.dto.garden.CreateGardenRequest;
import com.cmc.plant_care_backend.dto.garden.GardenDetailResponse;
import com.cmc.plant_care_backend.dto.garden.GardenSummaryResponse;
import com.cmc.plant_care_backend.model.Garden;
import com.cmc.plant_care_backend.model.User;
import com.cmc.plant_care_backend.repository.GardenRepository;
import com.cmc.plant_care_backend.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GardenServiceTest {

    @Mock
    private GardenRepository gardenRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private GardenService gardenService;

    private UUID userId;
    private User owner;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
        owner = new User();
        owner.setId(userId);
    }

    @Test
    void getGardens_ShouldReturnOwnerGardens() {
        Garden g = new Garden();
        g.setId(UUID.randomUUID());
        g.setName("Vườn Ban Công");
        g.setLocation("Tầng 5");
        g.setOwner(owner);

        when(gardenRepository.findByOwnerId(userId)).thenReturn(List.of(g));
        when(gardenRepository.countPlantsByGardenId(g.getId())).thenReturn(3L);

        List<GardenSummaryResponse> result = gardenService.getGardens(userId);

        assertEquals(1, result.size());
        assertEquals("Vườn Ban Công", result.get(0).getName());
        assertEquals(3, result.get(0).getPlantCount());
    }

    @Test
    void createGarden_DuplicateName_ShouldThrowConflict() {
        CreateGardenRequest req = new CreateGardenRequest();
        req.setName("Vườn Cũ");
        req.setLocation("Tầng 1");

        when(gardenRepository.existsByOwnerIdAndName(userId, "Vườn Cũ")).thenReturn(true);

        assertThrows(ConflictException.class, () -> gardenService.createGarden(userId, req));
        verify(gardenRepository, never()).save(any());
    }

    @Test
    void getGardenDetail_WhenNotOwner_ShouldThrowForbidden() {
        UUID otherUserId = UUID.randomUUID();
        User otherUser = new User();
        otherUser.setId(otherUserId);

        Garden g = new Garden();
        UUID gardenId = UUID.randomUUID();
        g.setId(gardenId);
        g.setOwner(otherUser);

        when(gardenRepository.findById(gardenId)).thenReturn(Optional.of(g));

        assertThrows(ForbiddenException.class, () -> gardenService.getGardenDetail(gardenId, userId));
    }

    @Test
    void deleteGarden_WhenOwner_ShouldDelete() {
        Garden g = new Garden();
        UUID gardenId = UUID.randomUUID();
        g.setId(gardenId);
        g.setOwner(owner);

        when(gardenRepository.findById(gardenId)).thenReturn(Optional.of(g));

        gardenService.deleteGarden(gardenId, userId);

        verify(gardenRepository).delete(g);
    }
}
