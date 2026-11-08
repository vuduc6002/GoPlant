package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.common.exception.ConflictException;
import com.cmc.plant_care_backend.dto.species.AdminCreateSpeciesRequest;
import com.cmc.plant_care_backend.dto.species.SpeciesDetailResponse;
import com.cmc.plant_care_backend.model.PlantSpecies;
import com.cmc.plant_care_backend.repository.PlantSpeciesRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AdminSpeciesServiceTest {

    @Mock
    private PlantSpeciesRepository speciesRepository;

    @Mock
    private SpeciesService speciesService;

    @InjectMocks
    private AdminSpeciesService adminSpeciesService;

    @Test
    void createSpecies_WhenDuplicateScientificName_ShouldThrowConflict() {
        AdminCreateSpeciesRequest req = new AdminCreateSpeciesRequest();
        req.setCommonName("Trầu bà");
        req.setScientificName("Monstera deliciosa");
        req.setCategory("Cây cảnh");

        when(speciesRepository.existsByScientificName("Monstera deliciosa")).thenReturn(true);

        assertThrows(ConflictException.class, () -> adminSpeciesService.createSpecies(req));
        verify(speciesRepository, never()).save(any());
    }

    @Test
    void deleteSpecies_WhenInUse_ShouldThrowConflict() {
        UUID speciesId = UUID.randomUUID();
        PlantSpecies species = new PlantSpecies();
        species.setId(speciesId);

        when(speciesRepository.findById(speciesId)).thenReturn(Optional.of(species));
        when(speciesRepository.isSpeciesInUse(speciesId)).thenReturn(true);

        assertThrows(ConflictException.class, () -> adminSpeciesService.deleteSpecies(speciesId));
        verify(speciesRepository, never()).delete(any());
    }

    @Test
    void deleteSpecies_WhenNotInUse_ShouldDelete() {
        UUID speciesId = UUID.randomUUID();
        PlantSpecies species = new PlantSpecies();
        species.setId(speciesId);

        when(speciesRepository.findById(speciesId)).thenReturn(Optional.of(species));
        when(speciesRepository.isSpeciesInUse(speciesId)).thenReturn(false);

        adminSpeciesService.deleteSpecies(speciesId);

        verify(speciesRepository).delete(species);
    }
}
