package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.common.exception.ConflictException;
import com.cmc.plant_care_backend.common.exception.ForbiddenException;
import com.cmc.plant_care_backend.common.exception.ResourceNotFoundException;
import com.cmc.plant_care_backend.common.validation.MediaUrlValidator;
import com.cmc.plant_care_backend.dto.garden.*;
import com.cmc.plant_care_backend.model.Garden;
import com.cmc.plant_care_backend.model.User;
import com.cmc.plant_care_backend.model.UserPlant;
import com.cmc.plant_care_backend.repository.GardenRepository;
import com.cmc.plant_care_backend.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class GardenService {

    private final GardenRepository gardenRepository;
    private final UserRepository userRepository;
    private final MediaUrlValidator mediaUrlValidator;

    public GardenService(GardenRepository gardenRepository, UserRepository userRepository) {
        this(gardenRepository, userRepository, new MediaUrlValidator("https"));
    }

    @org.springframework.beans.factory.annotation.Autowired
    public GardenService(GardenRepository gardenRepository, UserRepository userRepository, MediaUrlValidator mediaUrlValidator) {
        this.gardenRepository = gardenRepository;
        this.userRepository = userRepository;
        this.mediaUrlValidator = mediaUrlValidator != null ? mediaUrlValidator : new MediaUrlValidator("https");
    }

    @Transactional(readOnly = true)
    public List<GardenSummaryResponse> getGardens(UUID currentUserId) {
        List<Garden> gardens = gardenRepository.findByOwnerId(currentUserId);

        return gardens.stream().map(g -> {
            GardenSummaryResponse res = new GardenSummaryResponse();
            res.setId(g.getId());
            res.setName(g.getName());
            res.setLocation(g.getLocation());
            res.setSpaceType(g.getSpaceType());
            res.setCoverImageUrl(g.getCoverImageUrl());
            res.setPlantCount((int) gardenRepository.countPlantsByGardenId(g.getId()));
            res.setCreatedAt(g.getCreatedAt());
            return res;
        }).collect(Collectors.toList());
    }

    @Transactional
    public GardenDetailResponse createGarden(UUID currentUserId, CreateGardenRequest req) {
        String cleanName = req.getName().trim();

        if (gardenRepository.existsByOwnerIdAndName(currentUserId, cleanName)) {
            throw new ConflictException("Bạn đã có một khu vườn với tên này.", "name");
        }

        User owner = userRepository.getReferenceById(currentUserId);

        Garden garden = new Garden();
        garden.setOwner(owner);
        garden.setName(cleanName);
        garden.setLocation(req.getLocation().trim());
        if (req.getSpaceType() != null) {
            garden.setSpaceType(req.getSpaceType());
        }
        if (req.getDescription() != null) {
            garden.setDescription(req.getDescription().trim());
        }
        if (req.getCoverImageUrl() != null) {
            mediaUrlValidator.validate(req.getCoverImageUrl(), "coverImageUrl");
            garden.setCoverImageUrl(req.getCoverImageUrl().trim().isEmpty() ? null : req.getCoverImageUrl().trim());
        }

        Garden saved = gardenRepository.save(garden);
        return mapToDetail(saved);
    }

    @Transactional(readOnly = true)
    public GardenDetailResponse getGardenDetail(UUID gardenId, UUID currentUserId) {
        Garden garden = gardenRepository.findById(gardenId)
            .orElseThrow(() -> new ResourceNotFoundException("Khu vườn", gardenId));

        validateOwnership(garden, currentUserId);

        return mapToDetail(garden);
    }

    @Transactional
    public GardenDetailResponse updateGarden(UUID gardenId, UUID currentUserId, UpdateGardenRequest req) {
        Garden garden = gardenRepository.findById(gardenId)
            .orElseThrow(() -> new ResourceNotFoundException("Khu vườn", gardenId));

        validateOwnership(garden, currentUserId);

        if (req.getName() != null && !req.getName().trim().isEmpty()) {
            String newName = req.getName().trim();
            if (gardenRepository.existsByOwnerIdAndNameAndIdNot(currentUserId, newName, gardenId)) {
                throw new ConflictException("Bạn đã có một khu vườn khác với tên này.", "name");
            }
            garden.setName(newName);
        }

        if (req.getLocation() != null && !req.getLocation().trim().isEmpty()) {
            garden.setLocation(req.getLocation().trim());
        }
        if (req.getSpaceType() != null) {
            garden.setSpaceType(req.getSpaceType());
        }
        if (req.getDescription() != null) {
            garden.setDescription(req.getDescription().trim());
        }
        if (req.getCoverImageUrl() != null) {
            mediaUrlValidator.validate(req.getCoverImageUrl(), "coverImageUrl");
            garden.setCoverImageUrl(req.getCoverImageUrl().trim().isEmpty() ? null : req.getCoverImageUrl().trim());
        }

        Garden updated = gardenRepository.save(garden);
        return mapToDetail(updated);
    }

    @Transactional
    public void deleteGarden(UUID gardenId, UUID currentUserId) {
        Garden garden = gardenRepository.findById(gardenId)
            .orElseThrow(() -> new ResourceNotFoundException("Khu vườn", gardenId));

        validateOwnership(garden, currentUserId);

        gardenRepository.delete(garden);
    }

    private void validateOwnership(Garden garden, UUID currentUserId) {
        if (!garden.getOwner().getId().equals(currentUserId)) {
            throw new ForbiddenException("Bạn không có quyền truy cập khu vườn này.");
        }
    }

    private GardenDetailResponse mapToDetail(Garden g) {
        GardenDetailResponse res = new GardenDetailResponse();
        res.setId(g.getId());
        res.setName(g.getName());
        res.setLocation(g.getLocation());
        res.setSpaceType(g.getSpaceType());
        res.setDescription(g.getDescription());
        res.setCoverImageUrl(g.getCoverImageUrl());
        res.setCreatedAt(g.getCreatedAt());
        res.setUpdatedAt(g.getUpdatedAt());

        List<UserPlantSummary> plantSummaries = new ArrayList<>();
        if (g.getPlants() != null) {
            for (UserPlant p : g.getPlants()) {
                UserPlantSummary ps = new UserPlantSummary();
                ps.setId(p.getId());
                ps.setDisplayName(p.getDisplayName());
                if (p.getSpecies() != null) {
                    ps.setSpeciesName(p.getSpecies().getCommonName());
                    ps.setScientificName(p.getSpecies().getScientificName());
                    ps.setCategory(p.getSpecies().getCategory());
                }
                ps.setHealthStatus(p.getHealthStatus());
                ps.setImageUrl(p.getImageUrl());
                plantSummaries.add(ps);
            }
        }
        res.setPlants(plantSummaries);

        return res;
    }
}
