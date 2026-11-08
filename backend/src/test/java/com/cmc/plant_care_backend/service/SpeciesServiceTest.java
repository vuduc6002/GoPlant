package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.common.exception.ConflictException;
import com.cmc.plant_care_backend.common.exception.ResourceNotFoundException;
import com.cmc.plant_care_backend.dto.species.SpeciesDetailResponse;
import com.cmc.plant_care_backend.model.PlantSpecies;
import com.cmc.plant_care_backend.model.User;
import com.cmc.plant_care_backend.repository.PlantSpeciesRepository;
import com.cmc.plant_care_backend.repository.UserFavoriteSpeciesRepository;
import com.cmc.plant_care_backend.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
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
class SpeciesServiceTest {

    @Mock
    private PlantSpeciesRepository speciesRepository;

    @Mock
    private UserFavoriteSpeciesRepository favoriteRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private SpeciesService speciesService;

    private UUID speciesId;
    private UUID userId;
    private PlantSpecies testSpecies;

    @BeforeEach
    void setUp() {
        speciesId = UUID.randomUUID();
        userId = UUID.randomUUID();
        testSpecies = new PlantSpecies();
        testSpecies.setId(speciesId);
        testSpecies.setCommonName("Trầu bà lá xẻ");
        testSpecies.setScientificName("Monstera deliciosa");
        testSpecies.setCategory("Cây cảnh");
        testSpecies.setIsActive(true);
    }

    @Test
    void getSpeciesDetail_WhenActive_ShouldReturnDetail() {
        when(speciesRepository.findById(speciesId)).thenReturn(Optional.of(testSpecies));
        when(favoriteRepository.existsByUserIdAndSpeciesId(userId, speciesId)).thenReturn(true);

        SpeciesDetailResponse res = speciesService.getSpeciesDetail(speciesId, userId);

        assertNotNull(res);
        assertEquals("Trầu bà lá xẻ", res.getCommonName());
        assertTrue(res.getIsFavorited());
    }

    @Test
    void addFavorite_WhenAlreadyFavorited_ShouldThrowConflict() {
        when(speciesRepository.findById(speciesId)).thenReturn(Optional.of(testSpecies));
        when(favoriteRepository.existsByUserIdAndSpeciesId(userId, speciesId)).thenReturn(true);

        assertThrows(ConflictException.class, () -> speciesService.addFavorite(speciesId, userId));
        verify(favoriteRepository, never()).save(any());
    }

    @Test
    void addFavorite_WhenNew_ShouldSave() {
        when(speciesRepository.findById(speciesId)).thenReturn(Optional.of(testSpecies));
        when(favoriteRepository.existsByUserIdAndSpeciesId(userId, speciesId)).thenReturn(false);
        when(userRepository.getReferenceById(userId)).thenReturn(new User());

        speciesService.addFavorite(speciesId, userId);

        verify(favoriteRepository).save(any());
    }

    @Test
    void removeFavorite_WhenNotFavorited_ShouldThrowNotFound() {
        when(favoriteRepository.existsByUserIdAndSpeciesId(userId, speciesId)).thenReturn(false);

        assertThrows(ResourceNotFoundException.class, () -> speciesService.removeFavorite(speciesId, userId));
    }
}
