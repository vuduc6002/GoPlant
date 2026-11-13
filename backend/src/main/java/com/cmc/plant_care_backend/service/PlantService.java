package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.common.exception.ForbiddenException;
import com.cmc.plant_care_backend.common.exception.ResourceNotFoundException;
import com.cmc.plant_care_backend.common.response.PageResponse;
import com.cmc.plant_care_backend.dto.carelog.CareLogResponse;
import com.cmc.plant_care_backend.dto.journal.GrowthJournalResponse;
import com.cmc.plant_care_backend.dto.plant.*;
import com.cmc.plant_care_backend.dto.schedule.CareScheduleResponse;
import com.cmc.plant_care_backend.dto.species.SpeciesSummaryResponse;
import com.cmc.plant_care_backend.model.*;
import com.cmc.plant_care_backend.model.enums.HealthStatus;
import com.cmc.plant_care_backend.model.enums.ScheduleStatus;
import com.cmc.plant_care_backend.repository.*;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.*;

@Service
public class PlantService {

    private static final Set<String> ALLOWED_SORT_PROPERTIES = Set.of(
        "displayName", "createdAt", "plantedAt", "healthStatus"
    );

    private final UserPlantRepository userPlantRepository;
    private final GardenRepository gardenRepository;
    private final PlantSpeciesRepository plantSpeciesRepository;
    private final UserRepository userRepository;
    private final CareScheduleRepository careScheduleRepository;
    private final CareLogRepository careLogRepository;
    private final GrowthJournalRepository growthJournalRepository;
    private final com.cmc.plant_care_backend.common.validation.MediaUrlValidator mediaUrlValidator;

    public PlantService(
        UserPlantRepository userPlantRepository,
        GardenRepository gardenRepository,
        PlantSpeciesRepository plantSpeciesRepository,
        UserRepository userRepository,
        CareScheduleRepository careScheduleRepository,
        CareLogRepository careLogRepository,
        GrowthJournalRepository growthJournalRepository
    ) {
        this(
            userPlantRepository,
            gardenRepository,
            plantSpeciesRepository,
            userRepository,
            careScheduleRepository,
            careLogRepository,
            growthJournalRepository,
            new com.cmc.plant_care_backend.common.validation.MediaUrlValidator("https")
        );
    }

    @org.springframework.beans.factory.annotation.Autowired
    public PlantService(
        UserPlantRepository userPlantRepository,
        GardenRepository gardenRepository,
        PlantSpeciesRepository plantSpeciesRepository,
        UserRepository userRepository,
        CareScheduleRepository careScheduleRepository,
        CareLogRepository careLogRepository,
        GrowthJournalRepository growthJournalRepository,
        com.cmc.plant_care_backend.common.validation.MediaUrlValidator mediaUrlValidator
    ) {
        this.userPlantRepository = userPlantRepository;
        this.gardenRepository = gardenRepository;
        this.plantSpeciesRepository = plantSpeciesRepository;
        this.userRepository = userRepository;
        this.careScheduleRepository = careScheduleRepository;
        this.careLogRepository = careLogRepository;
        this.growthJournalRepository = growthJournalRepository;
        this.mediaUrlValidator = mediaUrlValidator != null
            ? mediaUrlValidator
            : new com.cmc.plant_care_backend.common.validation.MediaUrlValidator("https");
    }

    @Transactional
    public UserPlantDetailResponse createPlant(UUID gardenId, UUID currentUserId, CreateUserPlantRequest req) {
        Garden garden = gardenRepository.findById(gardenId)
            .orElseThrow(() -> new ResourceNotFoundException("Khu vườn", gardenId));

        if (!garden.getOwner().getId().equals(currentUserId)) {
            throw new ForbiddenException("Bạn không có quyền truy cập khu vườn này.");
        }

        PlantSpecies species = plantSpeciesRepository.findById(req.getSpeciesId())
            .orElseThrow(() -> new ResourceNotFoundException("Loài cây", req.getSpeciesId()));

        User owner = userRepository.getReferenceById(currentUserId);

        UserPlant plant = new UserPlant();
        plant.setOwner(owner);
        plant.setGarden(garden);
        plant.setSpecies(species);
        plant.setDisplayName(req.getDisplayName().trim());
        if (req.getLocation() != null && !req.getLocation().trim().isEmpty()) {
            plant.setLocation(req.getLocation().trim());
        }
        plant.setPlantedAt(req.getPlantedAt() != null ? req.getPlantedAt() : LocalDate.now());
        if (req.getNote() != null) {
            plant.setNote(req.getNote().trim());
        }
        if (req.getImageUrl() != null && !req.getImageUrl().trim().isEmpty()) {
            mediaUrlValidator.validate(req.getImageUrl().trim(), "imageUrl");
            plant.setImageUrl(req.getImageUrl().trim());
        }
        plant.setHealthStatus(HealthStatus.HEALTHY);

        UserPlant saved = userPlantRepository.save(plant);
        return mapToDetail(saved);
    }

    @Transactional(readOnly = true)
    public PageResponse<UserPlantSummaryResponse> getMyPlants(
        UUID currentUserId,
        String keyword,
        UUID gardenId,
        HealthStatus healthStatus,
        int page,
        int size,
        String sortParam
    ) {
        Sort sort = parseSort(sortParam);
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.max(1, size), sort);

        Specification<UserPlant> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("owner").get("id"), currentUserId));

            if (gardenId != null) {
                predicates.add(cb.equal(root.get("garden").get("id"), gardenId));
            }

            if (healthStatus != null) {
                predicates.add(cb.equal(root.get("healthStatus"), healthStatus));
            }

            if (keyword != null && !keyword.trim().isEmpty()) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                Predicate matchDisplayName = cb.like(cb.lower(root.get("displayName")), pattern);
                Predicate matchCommonName = cb.like(cb.lower(root.get("species").get("commonName")), pattern);
                predicates.add(cb.or(matchDisplayName, matchCommonName));
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };

        Page<UserPlant> plantPage = userPlantRepository.findAll(spec, pageable);
        return PageResponse.from(plantPage.map(this::mapToSummary));
    }

    @Transactional(readOnly = true)
    public UserPlantDetailResponse getPlantDetail(UUID plantId, UUID currentUserId) {
        UserPlant plant = userPlantRepository.findById(plantId)
            .orElseThrow(() -> new ResourceNotFoundException("Cây trồng", plantId));

        validateOwnership(plant, currentUserId);
        return mapToDetail(plant);
    }

    @Transactional
    public UserPlantDetailResponse updatePlant(UUID plantId, UUID currentUserId, UpdateUserPlantRequest req) {
        UserPlant plant = userPlantRepository.findById(plantId)
            .orElseThrow(() -> new ResourceNotFoundException("Cây trồng", plantId));

        validateOwnership(plant, currentUserId);

        if (req.getDisplayName() != null && !req.getDisplayName().trim().isEmpty()) {
            plant.setDisplayName(req.getDisplayName().trim());
        }
        if (req.getLocation() != null) {
            plant.setLocation(req.getLocation().trim().isEmpty() ? null : req.getLocation().trim());
        }
        if (req.getPlantedAt() != null) {
            plant.setPlantedAt(req.getPlantedAt());
        }
        if (req.getNote() != null) {
            plant.setNote(req.getNote().trim().isEmpty() ? null : req.getNote().trim());
        }
        if (req.getHealthStatus() != null) {
            plant.setHealthStatus(req.getHealthStatus());
        }
        if (req.getImageUrl() != null) {
            String trimmedUrl = req.getImageUrl().trim();
            if (trimmedUrl.isEmpty()) {
                plant.setImageUrl(null);
            } else {
                mediaUrlValidator.validate(trimmedUrl, "imageUrl");
                plant.setImageUrl(trimmedUrl);
            }
        }

        UserPlant updated = userPlantRepository.save(plant);
        return mapToDetail(updated);
    }

    @Transactional
    public void deletePlant(UUID plantId, UUID currentUserId) {
        UserPlant plant = userPlantRepository.findById(plantId)
            .orElseThrow(() -> new ResourceNotFoundException("Cây trồng", plantId));

        validateOwnership(plant, currentUserId);
        userPlantRepository.delete(plant);
    }

    @Transactional(readOnly = true)
    public PageResponse<CareScheduleResponse> getPlantSchedules(
        UUID plantId,
        UUID currentUserId,
        ScheduleStatus status,
        int page,
        int size
    ) {
        UserPlant plant = userPlantRepository.findById(plantId)
            .orElseThrow(() -> new ResourceNotFoundException("Cây trồng", plantId));
        validateOwnership(plant, currentUserId);

        Pageable pageable = PageRequest.of(Math.max(0, page), Math.max(1, size), Sort.by(Sort.Direction.ASC, "nextScheduledAt"));
        Page<CareSchedule> schedulePage;

        if (status != null) {
            schedulePage = careScheduleRepository.findByUserPlantIdAndStatusAndOwnerId(plantId, status, currentUserId, pageable);
        } else {
            schedulePage = careScheduleRepository.findByUserPlantIdAndOwnerId(plantId, currentUserId, pageable);
        }

        OffsetDateTime now = OffsetDateTime.now();
        return PageResponse.from(schedulePage.map(s -> mapToScheduleResponse(s, now)));
    }

    @Transactional(readOnly = true)
    public PageResponse<CareLogResponse> getPlantCareLogs(
        UUID plantId,
        UUID currentUserId,
        int page,
        int size
    ) {
        UserPlant plant = userPlantRepository.findById(plantId)
            .orElseThrow(() -> new ResourceNotFoundException("Cây trồng", plantId));
        validateOwnership(plant, currentUserId);

        Pageable pageable = PageRequest.of(Math.max(0, page), Math.max(1, size), Sort.by(Sort.Direction.DESC, "performedAt"));
        Page<CareLog> careLogPage = careLogRepository.findByUserPlantIdAndPerformedById(plantId, currentUserId, pageable);

        return PageResponse.from(careLogPage.map(this::mapToCareLogResponse));
    }

    @Transactional(readOnly = true)
    public PageResponse<GrowthJournalResponse> getPlantJournals(
        UUID plantId,
        UUID currentUserId,
        int page,
        int size
    ) {
        UserPlant plant = userPlantRepository.findById(plantId)
            .orElseThrow(() -> new ResourceNotFoundException("Cây trồng", plantId));
        validateOwnership(plant, currentUserId);

        Pageable pageable = PageRequest.of(Math.max(0, page), Math.max(1, size), Sort.by(Sort.Direction.DESC, "recordedAt"));
        Page<GrowthJournal> journalPage = growthJournalRepository.findByUserPlantIdAndAuthorId(plantId, currentUserId, pageable);

        return PageResponse.from(journalPage.map(this::mapToJournalResponse));
    }

    private void validateOwnership(UserPlant plant, UUID currentUserId) {
        if (!plant.getOwner().getId().equals(currentUserId)) {
            throw new ForbiddenException("Bạn không có quyền truy cập cây trồng này.");
        }
    }

    private Sort parseSort(String sortParam) {
        if (sortParam == null || sortParam.trim().isEmpty()) {
            return Sort.by(Sort.Direction.DESC, "createdAt");
        }

        String[] parts = sortParam.split(",");
        String prop = parts[0].trim();

        if (!ALLOWED_SORT_PROPERTIES.contains(prop)) {
            return Sort.by(Sort.Direction.DESC, "createdAt");
        }

        Sort.Direction direction = (parts.length > 1 && parts[1].trim().equalsIgnoreCase("asc"))
            ? Sort.Direction.ASC
            : Sort.Direction.DESC;

        return Sort.by(direction, prop);
    }

    private UserPlantSummaryResponse mapToSummary(UserPlant p) {
        UserPlantSummaryResponse res = new UserPlantSummaryResponse();
        res.setId(p.getId());
        res.setDisplayName(p.getDisplayName());
        if (p.getSpecies() != null) {
            res.setSpeciesName(p.getSpecies().getCommonName());
            res.setScientificName(p.getSpecies().getScientificName());
            res.setCategory(p.getSpecies().getCategory());
        }
        if (p.getGarden() != null) {
            res.setGardenName(p.getGarden().getName());
        }
        res.setHealthStatus(p.getHealthStatus());
        res.setImageUrl(p.getImageUrl());
        res.setCreatedAt(p.getCreatedAt());
        return res;
    }

    private UserPlantDetailResponse mapToDetail(UserPlant p) {
        UserPlantDetailResponse res = new UserPlantDetailResponse();
        res.setId(p.getId());
        res.setDisplayName(p.getDisplayName());
        res.setLocation(p.getLocation());
        res.setPlantedAt(p.getPlantedAt());
        res.setNote(p.getNote());
        res.setHealthStatus(p.getHealthStatus());
        res.setPlantCode(p.getPlantCode());
        res.setImageUrl(p.getImageUrl());
        res.setCreatedAt(p.getCreatedAt());

        if (p.getSpecies() != null) {
            PlantSpecies s = p.getSpecies();
            SpeciesSummaryResponse speciesDto = new SpeciesSummaryResponse();
            speciesDto.setId(s.getId());
            speciesDto.setCommonName(s.getCommonName());
            speciesDto.setScientificName(s.getScientificName());
            speciesDto.setCategory(s.getCategory());
            speciesDto.setDifficulty(s.getDifficulty());
            speciesDto.setThumbnailUrl(s.getThumbnailUrl());
            res.setSpecies(speciesDto);
        }

        if (p.getGarden() != null) {
            res.setGarden(new PlantGardenSummaryDto(p.getGarden().getId(), p.getGarden().getName()));
        }

        return res;
    }

    private CareScheduleResponse mapToScheduleResponse(CareSchedule s, OffsetDateTime now) {
        CareScheduleResponse res = new CareScheduleResponse();
        res.setId(s.getId());
        res.setUserPlantId(s.getUserPlant().getId());
        res.setPlantName(s.getUserPlant().getDisplayName());
        res.setTaskType(s.getTaskType());
        res.setTaskLabel(s.getTaskLabel());
        res.setFrequency(s.getFrequency());
        res.setIntervalDays(s.getIntervalDays());
        if (s.getReminderTime() != null) {
            res.setReminderTime(String.format("%02d:%02d:%02d",
                s.getReminderTime().getHour(),
                s.getReminderTime().getMinute(),
                s.getReminderTime().getSecond()));
        }
        res.setStartDate(s.getStartDate());
        res.setEndDate(s.getEndDate());
        if (s.getNextScheduledAt() != null) {
            res.setNextScheduledAt(s.getNextScheduledAt().withOffsetSameInstant(ZoneOffset.UTC));
        }
        res.setOverdue(s.getStatus() == ScheduleStatus.ACTIVE && s.getNextScheduledAt().isBefore(now));
        res.setStatus(s.getStatus());
        return res;
    }

    private CareLogResponse mapToCareLogResponse(CareLog log) {
        CareLogResponse res = new CareLogResponse();
        res.setId(log.getId());
        res.setUserPlantId(log.getUserPlant().getId());
        res.setTaskType(log.getTaskType());
        res.setStatus(log.getStatus());
        res.setNote(log.getNote());
        if (log.getImageUrls() != null) {
            res.setImageUrls(Arrays.asList(log.getImageUrls()));
        }
        res.setPerformedAt(log.getPerformedAt());
        res.setCreatedAt(log.getCreatedAt());
        return res;
    }

    private GrowthJournalResponse mapToJournalResponse(GrowthJournal j) {
        GrowthJournalResponse res = new GrowthJournalResponse();
        res.setId(j.getId());
        res.setUserPlantId(j.getUserPlant().getId());
        res.setEntryType(j.getEntryType());
        res.setHealthStatus(j.getHealthStatus());
        res.setNote(j.getNote());
        if (j.getImageUrls() != null) {
            res.setImageUrls(Arrays.asList(j.getImageUrls()));
        }
        res.setRecordedAt(j.getRecordedAt());
        res.setCreatedAt(j.getCreatedAt());
        return res;
    }
}
