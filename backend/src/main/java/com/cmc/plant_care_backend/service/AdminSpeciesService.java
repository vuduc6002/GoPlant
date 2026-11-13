package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.common.exception.ConflictException;
import com.cmc.plant_care_backend.common.exception.ResourceNotFoundException;
import com.cmc.plant_care_backend.common.response.PageResponse;
import com.cmc.plant_care_backend.dto.species.AdminCreateSpeciesRequest;
import com.cmc.plant_care_backend.dto.species.AdminUpdateSpeciesRequest;
import com.cmc.plant_care_backend.dto.species.SpeciesDetailResponse;
import com.cmc.plant_care_backend.dto.species.SpeciesSummaryResponse;
import com.cmc.plant_care_backend.model.PlantSpecies;
import com.cmc.plant_care_backend.repository.PlantSpeciesRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class AdminSpeciesService {

    private final PlantSpeciesRepository speciesRepository;
    private final SpeciesService speciesService;
    private final com.cmc.plant_care_backend.common.validation.MediaUrlValidator mediaUrlValidator;

    public AdminSpeciesService(PlantSpeciesRepository speciesRepository, SpeciesService speciesService) {
        this(speciesRepository, speciesService, new com.cmc.plant_care_backend.common.validation.MediaUrlValidator("https"));
    }

    @org.springframework.beans.factory.annotation.Autowired
    public AdminSpeciesService(
        PlantSpeciesRepository speciesRepository,
        SpeciesService speciesService,
        com.cmc.plant_care_backend.common.validation.MediaUrlValidator mediaUrlValidator
    ) {
        this.speciesRepository = speciesRepository;
        this.speciesService = speciesService;
        this.mediaUrlValidator = mediaUrlValidator != null
            ? mediaUrlValidator
            : new com.cmc.plant_care_backend.common.validation.MediaUrlValidator("https");
    }

    @Transactional(readOnly = true)
    public PageResponse<SpeciesSummaryResponse> getSpeciesList(String keyword, Pageable pageable) {
        String cleanKeyword = (keyword != null && !keyword.trim().isEmpty()) ? keyword.trim() : null;
        Page<PlantSpecies> speciesPage = speciesRepository.searchAllSpecies(cleanKeyword, pageable);
        Page<SpeciesSummaryResponse> mapped = speciesPage.map(s -> speciesService.mapToSummary(s, false));
        return PageResponse.from(mapped);
    }

    @Transactional
    public SpeciesDetailResponse createSpecies(AdminCreateSpeciesRequest req) {
        String scientificName = req.getScientificName().trim();
        if (speciesRepository.existsByScientificName(scientificName)) {
            throw new ConflictException("Tên khoa học '" + scientificName + "' đã tồn tại trong hệ thống.", "scientificName");
        }

        PlantSpecies species = new PlantSpecies();
        species.setCommonName(req.getCommonName().trim());
        species.setScientificName(scientificName);
        species.setCategory(req.getCategory().trim());
        species.setDifficulty(req.getDifficulty());
        species.setLightRequirement(req.getLightRequirement());
        species.setWaterRequirement(req.getWaterRequirement());
        species.setEnvironment(req.getEnvironment());
        species.setSpaceRequirement(req.getSpaceRequirement());
        species.setMatureSize(req.getMatureSize());
        species.setTemperatureRange(req.getTemperatureRange());
        species.setHumidityRange(req.getHumidityRange());
        species.setGrowingMedium(req.getGrowingMedium());
        species.setDrainage(req.getDrainage());
        species.setSoilPh(req.getSoilPh());
        species.setSunTolerance(req.getSunTolerance());
        species.setOrigin(req.getOrigin());
        species.setOverview(req.getOverview());
        species.setMorphology(req.getMorphology());
        species.setLifespan(req.getLifespan());
        species.setFloweringSeason(req.getFloweringSeason());
        species.setUsageAndCaution(req.getUsageAndCaution());
        species.setGrowthRate(req.getGrowthRate());
        species.setWateringFrequency(req.getWateringFrequency());
        species.setNutrition(req.getNutrition());
        if (req.getThumbnailUrl() != null && !req.getThumbnailUrl().trim().isEmpty()) {
            mediaUrlValidator.validate(req.getThumbnailUrl().trim(), "thumbnailUrl");
            species.setThumbnailUrl(req.getThumbnailUrl().trim());
        } else {
            species.setThumbnailUrl(null);
        }
        if (req.getIsActive() != null) {
            species.setIsActive(req.getIsActive());
        }

        PlantSpecies saved = speciesRepository.save(species);
        return speciesService.mapToDetail(saved, false);
    }

    @Transactional
    public SpeciesDetailResponse updateSpecies(UUID speciesId, AdminUpdateSpeciesRequest req) {
        PlantSpecies species = speciesRepository.findById(speciesId)
            .orElseThrow(() -> new ResourceNotFoundException("Giống cây", speciesId));

        if (req.getScientificName() != null && !req.getScientificName().trim().isEmpty()) {
            String scientificName = req.getScientificName().trim();
            if (speciesRepository.existsByScientificNameAndIdNot(scientificName, speciesId)) {
                throw new ConflictException("Tên khoa học '" + scientificName + "' đã tồn tại trong hệ thống.", "scientificName");
            }
            species.setScientificName(scientificName);
        }

        if (req.getCommonName() != null && !req.getCommonName().trim().isEmpty()) {
            species.setCommonName(req.getCommonName().trim());
        }
        if (req.getCategory() != null && !req.getCategory().trim().isEmpty()) {
            species.setCategory(req.getCategory().trim());
        }
        if (req.getDifficulty() != null) {
            species.setDifficulty(req.getDifficulty());
        }
        if (req.getLightRequirement() != null) {
            species.setLightRequirement(req.getLightRequirement());
        }
        if (req.getWaterRequirement() != null) {
            species.setWaterRequirement(req.getWaterRequirement());
        }
        if (req.getEnvironment() != null) {
            species.setEnvironment(req.getEnvironment());
        }
        if (req.getSpaceRequirement() != null) {
            species.setSpaceRequirement(req.getSpaceRequirement());
        }
        if (req.getMatureSize() != null) {
            species.setMatureSize(req.getMatureSize());
        }
        if (req.getTemperatureRange() != null) {
            species.setTemperatureRange(req.getTemperatureRange());
        }
        if (req.getHumidityRange() != null) {
            species.setHumidityRange(req.getHumidityRange());
        }
        if (req.getGrowingMedium() != null) {
            species.setGrowingMedium(req.getGrowingMedium());
        }
        if (req.getDrainage() != null) {
            species.setDrainage(req.getDrainage());
        }
        if (req.getSoilPh() != null) {
            species.setSoilPh(req.getSoilPh());
        }
        if (req.getSunTolerance() != null) {
            species.setSunTolerance(req.getSunTolerance());
        }
        if (req.getOrigin() != null) {
            species.setOrigin(req.getOrigin());
        }
        if (req.getOverview() != null) {
            species.setOverview(req.getOverview());
        }
        if (req.getMorphology() != null) {
            species.setMorphology(req.getMorphology());
        }
        if (req.getLifespan() != null) {
            species.setLifespan(req.getLifespan());
        }
        if (req.getFloweringSeason() != null) {
            species.setFloweringSeason(req.getFloweringSeason());
        }
        if (req.getUsageAndCaution() != null) {
            species.setUsageAndCaution(req.getUsageAndCaution());
        }
        if (req.getGrowthRate() != null) {
            species.setGrowthRate(req.getGrowthRate());
        }
        if (req.getWateringFrequency() != null) {
            species.setWateringFrequency(req.getWateringFrequency());
        }
        if (req.getNutrition() != null) {
            species.setNutrition(req.getNutrition());
        }
        if (req.getThumbnailUrl() != null) {
            String trimmed = req.getThumbnailUrl().trim();
            if (trimmed.isEmpty()) {
                species.setThumbnailUrl(null);
            } else {
                mediaUrlValidator.validate(trimmed, "thumbnailUrl");
                species.setThumbnailUrl(trimmed);
            }
        }
        if (req.getIsActive() != null) {
            species.setIsActive(req.getIsActive());
        }

        PlantSpecies updated = speciesRepository.save(species);
        return speciesService.mapToDetail(updated, false);
    }

    @Transactional
    public void deleteSpecies(UUID speciesId) {
        PlantSpecies species = speciesRepository.findById(speciesId)
            .orElseThrow(() -> new ResourceNotFoundException("Giống cây", speciesId));

        if (speciesRepository.isSpeciesInUse(speciesId)) {
            throw new ConflictException("Không thể xóa giống cây đang được trồng bởi người dùng.");
        }

        speciesRepository.delete(species);
    }
}
