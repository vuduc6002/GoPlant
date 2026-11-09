package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.common.exception.ForbiddenException;
import com.cmc.plant_care_backend.common.exception.ResourceNotFoundException;
import com.cmc.plant_care_backend.dto.plant.CreateUserPlantRequest;
import com.cmc.plant_care_backend.dto.plant.UpdateUserPlantRequest;
import com.cmc.plant_care_backend.dto.plant.UserPlantDetailResponse;
import com.cmc.plant_care_backend.model.Garden;
import com.cmc.plant_care_backend.model.PlantSpecies;
import com.cmc.plant_care_backend.model.User;
import com.cmc.plant_care_backend.model.UserPlant;
import com.cmc.plant_care_backend.model.enums.HealthStatus;
import com.cmc.plant_care_backend.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PlantServiceTest {

    @Mock
    private UserPlantRepository userPlantRepository;
    @Mock
    private GardenRepository gardenRepository;
    @Mock
    private PlantSpeciesRepository plantSpeciesRepository;
    @Mock
    private CareScheduleRepository careScheduleRepository;
    @Mock
    private CareLogRepository careLogRepository;
    @Mock
    private GrowthJournalRepository growthJournalRepository;
    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private PlantService plantService;

    private UUID userId;
    private User owner;
    private Garden garden;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
        owner = new User();
        owner.setId(userId);

        garden = new Garden();
        garden.setId(UUID.randomUUID());
        garden.setName("Vườn Ban Công");
        garden.setOwner(owner);
    }

    @Test
    void createPlant_Success() {
        UUID speciesId = UUID.randomUUID();
        PlantSpecies species = new PlantSpecies();
        species.setId(speciesId);
        species.setCommonName("Cà Chua");

        CreateUserPlantRequest req = new CreateUserPlantRequest();
        req.setDisplayName("Cây Cà Chua Bi");
        req.setSpeciesId(speciesId);
        req.setPlantedAt(LocalDate.of(2026, 1, 1));

        when(gardenRepository.findById(garden.getId())).thenReturn(Optional.of(garden));
        when(plantSpeciesRepository.findById(speciesId)).thenReturn(Optional.of(species));
        when(userRepository.getReferenceById(userId)).thenReturn(owner);
        when(userPlantRepository.save(any(UserPlant.class))).thenAnswer(i -> {
            UserPlant p = i.getArgument(0);
            p.setId(UUID.randomUUID());
            return p;
        });

        UserPlantDetailResponse res = plantService.createPlant(garden.getId(), userId, req);

        assertNotNull(res);
        assertEquals("Cây Cà Chua Bi", res.getDisplayName());
        verify(userPlantRepository, times(1)).save(any(UserPlant.class));
    }

    @Test
    void createPlant_GardenNotFound_ThrowsResourceNotFound() {
        UUID nonExistent = UUID.randomUUID();
        CreateUserPlantRequest req = new CreateUserPlantRequest();
        req.setDisplayName("Cây test");

        when(gardenRepository.findById(nonExistent)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () ->
            plantService.createPlant(nonExistent, userId, req));
    }

    @Test
    void createPlant_NotGardenOwner_ThrowsForbidden() {
        Garden otherGarden = new Garden();
        otherGarden.setId(UUID.randomUUID());
        User otherOwner = new User();
        otherOwner.setId(UUID.randomUUID());
        otherGarden.setOwner(otherOwner);

        CreateUserPlantRequest req = new CreateUserPlantRequest();
        req.setDisplayName("Cây lậu");

        when(gardenRepository.findById(otherGarden.getId())).thenReturn(Optional.of(otherGarden));

        assertThrows(ForbiddenException.class, () ->
            plantService.createPlant(otherGarden.getId(), userId, req));
    }

    @Test
    void getPlantDetail_Success() {
        UUID plantId = UUID.randomUUID();
        UserPlant plant = new UserPlant();
        plant.setId(plantId);
        plant.setOwner(owner);
        plant.setGarden(garden);
        plant.setDisplayName("Cây Lưỡi Hổ");

        when(userPlantRepository.findById(plantId)).thenReturn(Optional.of(plant));

        UserPlantDetailResponse res = plantService.getPlantDetail(plantId, userId);

        assertNotNull(res);
        assertEquals("Cây Lưỡi Hổ", res.getDisplayName());
    }

    @Test
    void getPlantDetail_NotFound_ThrowsResourceNotFound() {
        UUID plantId = UUID.randomUUID();
        when(userPlantRepository.findById(plantId)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () ->
            plantService.getPlantDetail(plantId, userId));
    }

    @Test
    void getPlantDetail_NotOwner_ThrowsForbidden() {
        UUID plantId = UUID.randomUUID();
        UserPlant plant = new UserPlant();
        plant.setId(plantId);
        User other = new User();
        other.setId(UUID.randomUUID());
        plant.setOwner(other);

        when(userPlantRepository.findById(plantId)).thenReturn(Optional.of(plant));

        assertThrows(ForbiddenException.class, () ->
            plantService.getPlantDetail(plantId, userId));
    }

    @Test
    void updatePlant_Success() {
        UUID plantId = UUID.randomUUID();
        UserPlant plant = new UserPlant();
        plant.setId(plantId);
        plant.setOwner(owner);
        plant.setGarden(garden);
        plant.setDisplayName("Cây cũ");

        UpdateUserPlantRequest req = new UpdateUserPlantRequest();
        req.setDisplayName("Cây mới cập nhật");

        when(userPlantRepository.findById(plantId)).thenReturn(Optional.of(plant));
        when(userPlantRepository.save(any(UserPlant.class))).thenAnswer(i -> i.getArgument(0));

        UserPlantDetailResponse res = plantService.updatePlant(plantId, userId, req);

        assertNotNull(res);
        assertEquals("Cây mới cập nhật", res.getDisplayName());
    }

    @Test
    void deletePlant_Success() {
        UUID plantId = UUID.randomUUID();
        UserPlant plant = new UserPlant();
        plant.setId(plantId);
        plant.setOwner(owner);

        when(userPlantRepository.findById(plantId)).thenReturn(Optional.of(plant));

        plantService.deletePlant(plantId, userId);

        verify(userPlantRepository, times(1)).delete(plant);
    }

    @Test
    void deletePlant_NotOwner_ThrowsForbidden() {
        UUID plantId = UUID.randomUUID();
        UserPlant plant = new UserPlant();
        plant.setId(plantId);
        User other = new User();
        other.setId(UUID.randomUUID());
        plant.setOwner(other);

        when(userPlantRepository.findById(plantId)).thenReturn(Optional.of(plant));

        assertThrows(ForbiddenException.class, () ->
            plantService.deletePlant(plantId, userId));
    }
}
