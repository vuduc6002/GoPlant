package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.common.exception.ConflictException;
import com.cmc.plant_care_backend.common.exception.ResourceNotFoundException;
import com.cmc.plant_care_backend.common.response.PageResponse;
import com.cmc.plant_care_backend.dto.species.SpeciesDetailResponse;
import com.cmc.plant_care_backend.dto.species.SpeciesSummaryResponse;
import com.cmc.plant_care_backend.model.PlantSpecies;
import com.cmc.plant_care_backend.model.User;
import com.cmc.plant_care_backend.model.UserFavoriteSpecies;
import com.cmc.plant_care_backend.repository.PlantSpeciesRepository;
import com.cmc.plant_care_backend.repository.UserFavoriteSpeciesRepository;
import com.cmc.plant_care_backend.repository.UserRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.Set;
import java.util.UUID;

@Service
public class SpeciesService {

    private final PlantSpeciesRepository speciesRepository;
    private final UserFavoriteSpeciesRepository favoriteRepository;
    private final UserRepository userRepository;

    public SpeciesService(
        PlantSpeciesRepository speciesRepository,
        UserFavoriteSpeciesRepository favoriteRepository,
        UserRepository userRepository
    ) {
        this.speciesRepository = speciesRepository;
        this.favoriteRepository = favoriteRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public PageResponse<SpeciesSummaryResponse> getSpeciesList(String keyword, String category, UUID currentUserId, Pageable pageable) {
        String cleanKeyword = (keyword != null && !keyword.trim().isEmpty()) ? keyword.trim() : null;
        String cleanCategory = (category != null && !category.trim().isEmpty()) ? category.trim() : null;

        Page<PlantSpecies> speciesPage = speciesRepository.searchActiveSpecies(cleanKeyword, cleanCategory, pageable);

        Set<UUID> favoriteIds = currentUserId != null
            ? favoriteRepository.findFavoriteSpeciesIdsByUserId(currentUserId)
            : Collections.emptySet();

        Page<SpeciesSummaryResponse> mapped = speciesPage.map(s -> mapToSummary(s, favoriteIds.contains(s.getId())));
        return PageResponse.from(mapped);
    }

    @Transactional(readOnly = true)
    public SpeciesDetailResponse getSpeciesDetail(UUID speciesId, UUID currentUserId) {
        PlantSpecies species = speciesRepository.findById(speciesId)
            .filter(PlantSpecies::getIsActive)
            .orElseThrow(() -> new ResourceNotFoundException("Giống cây", speciesId));

        boolean isFavorited = currentUserId != null && favoriteRepository.existsByUserIdAndSpeciesId(currentUserId, speciesId);
        return mapToDetail(species, isFavorited);
    }

    @Transactional
    public void addFavorite(UUID speciesId, UUID currentUserId) {
        PlantSpecies species = speciesRepository.findById(speciesId)
            .filter(PlantSpecies::getIsActive)
            .orElseThrow(() -> new ResourceNotFoundException("Giống cây", speciesId));

        if (favoriteRepository.existsByUserIdAndSpeciesId(currentUserId, speciesId)) {
            throw new ConflictException("Giống cây này đã có trong danh sách yêu thích của bạn.");
        }

        User user = userRepository.getReferenceById(currentUserId);
        UserFavoriteSpecies fav = new UserFavoriteSpecies(user, species);
        favoriteRepository.save(fav);
    }

    @Transactional
    public void removeFavorite(UUID speciesId, UUID currentUserId) {
        if (!favoriteRepository.existsByUserIdAndSpeciesId(currentUserId, speciesId)) {
            throw new ResourceNotFoundException("Giống cây chưa có trong danh sách yêu thích của bạn.");
        }

        favoriteRepository.deleteByUserIdAndSpeciesId(currentUserId, speciesId);
    }

    @Transactional(readOnly = true)
    public PageResponse<SpeciesSummaryResponse> getFavoriteSpecies(UUID currentUserId, Pageable pageable) {
        Page<PlantSpecies> favPage = favoriteRepository.findFavoriteSpeciesByUserId(currentUserId, pageable);
        Page<SpeciesSummaryResponse> mapped = favPage.map(s -> mapToSummary(s, true));
        return PageResponse.from(mapped);
    }

    public SpeciesSummaryResponse mapToSummary(PlantSpecies s, boolean isFavorited) {
        SpeciesSummaryResponse res = new SpeciesSummaryResponse();
        res.setId(s.getId());
        res.setCommonName(s.getCommonName());
        res.setScientificName(s.getScientificName());
        res.setCategory(s.getCategory());
        res.setDifficulty(s.getDifficulty());
        res.setThumbnailUrl(s.getThumbnailUrl());
        res.setIsFavorited(isFavorited);
        return res;
    }

    public SpeciesDetailResponse mapToDetail(PlantSpecies s, boolean isFavorited) {
        SpeciesDetailResponse res = new SpeciesDetailResponse();
        res.setId(s.getId());
        res.setCommonName(s.getCommonName());
        res.setScientificName(s.getScientificName());
        res.setCategory(s.getCategory());
        res.setDifficulty(s.getDifficulty());
        res.setLightRequirement(s.getLightRequirement());
        res.setWaterRequirement(s.getWaterRequirement());
        res.setEnvironment(s.getEnvironment());
        res.setSpaceRequirement(s.getSpaceRequirement());
        res.setMatureSize(s.getMatureSize());
        res.setTemperatureRange(s.getTemperatureRange());
        res.setHumidityRange(s.getHumidityRange());
        res.setGrowingMedium(s.getGrowingMedium());
        res.setDrainage(s.getDrainage());
        res.setSoilPh(s.getSoilPh());
        res.setSunTolerance(s.getSunTolerance());
        res.setOrigin(s.getOrigin());
        res.setOverview(s.getOverview());
        res.setMorphology(s.getMorphology());
        res.setLifespan(s.getLifespan());
        res.setFloweringSeason(s.getFloweringSeason());
        res.setUsageAndCaution(s.getUsageAndCaution());
        res.setGrowthRate(s.getGrowthRate());
        res.setWateringFrequency(s.getWateringFrequency());
        res.setNutrition(s.getNutrition());
        res.setThumbnailUrl(s.getThumbnailUrl());
        res.setIsFavorited(isFavorited);
        res.setIsActive(s.getIsActive());
        res.setCreatedAt(s.getCreatedAt());
        res.setUpdatedAt(s.getUpdatedAt());
        return res;
    }
}
