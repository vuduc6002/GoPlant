package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.common.exception.ForbiddenException;
import com.cmc.plant_care_backend.common.exception.ResourceNotFoundException;
import com.cmc.plant_care_backend.dto.journal.CreateGrowthJournalRequest;
import com.cmc.plant_care_backend.dto.journal.GrowthJournalResponse;
import com.cmc.plant_care_backend.dto.journal.UpdateGrowthJournalRequest;
import com.cmc.plant_care_backend.model.GrowthJournal;
import com.cmc.plant_care_backend.model.User;
import com.cmc.plant_care_backend.model.UserPlant;
import com.cmc.plant_care_backend.model.enums.EntryType;
import com.cmc.plant_care_backend.model.enums.JournalHealthStatus;
import com.cmc.plant_care_backend.repository.GrowthJournalRepository;
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
class GrowthJournalServiceTest {

    @Mock
    private GrowthJournalRepository growthJournalRepository;
    @Mock
    private UserPlantRepository userPlantRepository;
    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private GrowthJournalService growthJournalService;

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
    void createJournal_Success() {
        CreateGrowthJournalRequest req = new CreateGrowthJournalRequest();
        req.setUserPlantId(plantId);
        req.setEntryType(EntryType.GROWTH);
        req.setHealthStatus(JournalHealthStatus.HEALTHY);
        req.setNote("Cây ra thêm 3 lá non mới");
        req.setImageUrls(List.of("https://example.com/growth1.jpg"));

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userPlantRepository.findById(plantId)).thenReturn(Optional.of(plant));
        when(growthJournalRepository.save(any(GrowthJournal.class))).thenAnswer(i -> {
            GrowthJournal j = i.getArgument(0);
            j.setId(UUID.randomUUID());
            return j;
        });

        GrowthJournalResponse res = growthJournalService.createJournal(userId, req);

        assertNotNull(res);
        assertEquals(EntryType.GROWTH, res.getEntryType());
        assertEquals(JournalHealthStatus.HEALTHY, res.getHealthStatus());
        assertEquals("Cây ra thêm 3 lá non mới", res.getNote());
        assertEquals(1, res.getImageUrls().size());
    }

    @Test
    void createJournal_NotPlantOwner_ThrowsForbidden() {
        User other = new User();
        other.setId(UUID.randomUUID());
        plant.setOwner(other);

        CreateGrowthJournalRequest req = new CreateGrowthJournalRequest();
        req.setUserPlantId(plantId);
        req.setNote("Nhật ký lậu");

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userPlantRepository.findById(plantId)).thenReturn(Optional.of(plant));

        assertThrows(ForbiddenException.class, () ->
            growthJournalService.createJournal(userId, req));
    }

    @Test
    void updateJournal_Success() {
        UUID journalId = UUID.randomUUID();
        GrowthJournal j = new GrowthJournal();
        j.setId(journalId);
        j.setUserPlant(plant);
        j.setAuthor(user);
        j.setNote("Ghi chú cũ");

        UpdateGrowthJournalRequest req = new UpdateGrowthJournalRequest();
        req.setNote("Ghi chú mới đã sửa");

        when(growthJournalRepository.findById(journalId)).thenReturn(Optional.of(j));
        when(growthJournalRepository.save(any(GrowthJournal.class))).thenAnswer(i -> i.getArgument(0));

        GrowthJournalResponse res = growthJournalService.updateJournal(journalId, userId, req);

        assertNotNull(res);
        assertEquals("Ghi chú mới đã sửa", res.getNote());
    }

    @Test
    void updateJournal_NotAuthor_ThrowsForbidden() {
        UUID journalId = UUID.randomUUID();
        GrowthJournal j = new GrowthJournal();
        j.setId(journalId);
        User other = new User();
        other.setId(UUID.randomUUID());
        j.setAuthor(other);

        UpdateGrowthJournalRequest req = new UpdateGrowthJournalRequest();
        req.setNote("Thử sửa nhật ký người khác");

        when(growthJournalRepository.findById(journalId)).thenReturn(Optional.of(j));

        assertThrows(ForbiddenException.class, () ->
            growthJournalService.updateJournal(journalId, userId, req));
    }

    @Test
    void deleteJournal_Success() {
        UUID journalId = UUID.randomUUID();
        GrowthJournal j = new GrowthJournal();
        j.setId(journalId);
        j.setAuthor(user);

        when(growthJournalRepository.findById(journalId)).thenReturn(Optional.of(j));

        growthJournalService.deleteJournal(journalId, userId);

        verify(growthJournalRepository, times(1)).delete(j);
    }

    @Test
    void deleteJournal_NotAuthor_ThrowsForbidden() {
        UUID journalId = UUID.randomUUID();
        GrowthJournal j = new GrowthJournal();
        j.setId(journalId);
        User other = new User();
        other.setId(UUID.randomUUID());
        j.setAuthor(other);

        when(growthJournalRepository.findById(journalId)).thenReturn(Optional.of(j));

        assertThrows(ForbiddenException.class, () ->
            growthJournalService.deleteJournal(journalId, userId));
    }
}
