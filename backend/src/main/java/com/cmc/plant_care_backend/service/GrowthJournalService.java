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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.UUID;

@Service
@Transactional
public class GrowthJournalService {

    private final GrowthJournalRepository growthJournalRepository;
    private final UserPlantRepository userPlantRepository;
    private final UserRepository userRepository;
    private final com.cmc.plant_care_backend.common.validation.MediaUrlValidator mediaUrlValidator;

    public GrowthJournalService(
        GrowthJournalRepository growthJournalRepository,
        UserPlantRepository userPlantRepository,
        UserRepository userRepository
    ) {
        this(
            growthJournalRepository,
            userPlantRepository,
            userRepository,
            new com.cmc.plant_care_backend.common.validation.MediaUrlValidator("https")
        );
    }

    @org.springframework.beans.factory.annotation.Autowired
    public GrowthJournalService(
        GrowthJournalRepository growthJournalRepository,
        UserPlantRepository userPlantRepository,
        UserRepository userRepository,
        com.cmc.plant_care_backend.common.validation.MediaUrlValidator mediaUrlValidator
    ) {
        this.growthJournalRepository = growthJournalRepository;
        this.userPlantRepository = userPlantRepository;
        this.userRepository = userRepository;
        this.mediaUrlValidator = mediaUrlValidator != null
            ? mediaUrlValidator
            : new com.cmc.plant_care_backend.common.validation.MediaUrlValidator("https");
    }

    public GrowthJournalResponse createJournal(UUID userId, CreateGrowthJournalRequest request) {
        User currentUser = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        UserPlant plant = userPlantRepository.findById(request.getUserPlantId())
            .orElseThrow(() -> new ResourceNotFoundException("Cây trồng không tồn tại"));

        if (!plant.getOwner().getId().equals(userId)) {
            throw new ForbiddenException("Bạn không có quyền thao tác trên cây trồng này");
        }

        GrowthJournal journal = new GrowthJournal();
        journal.setUserPlant(plant);
        journal.setAuthor(currentUser);
        journal.setEntryType(request.getEntryType() != null ? request.getEntryType() : EntryType.GROWTH);
        journal.setHealthStatus(request.getHealthStatus() != null ? request.getHealthStatus() : JournalHealthStatus.HEALTHY);
        journal.setNote(request.getNote());
        if (request.getImageUrls() != null && !request.getImageUrls().isEmpty()) {
            mediaUrlValidator.validateAll(request.getImageUrls(), "imageUrls");
            journal.setImageUrls(request.getImageUrls().toArray(new String[0]));
        }
        journal.setRecordedAt(request.getRecordedAt() != null ? request.getRecordedAt() : OffsetDateTime.now());

        journal = growthJournalRepository.save(journal);
        return mapToResponse(journal);
    }

    public GrowthJournalResponse updateJournal(UUID journalId, UUID userId, UpdateGrowthJournalRequest request) {
        GrowthJournal journal = growthJournalRepository.findById(journalId)
            .orElseThrow(() -> new ResourceNotFoundException("Nhật ký phát triển", journalId));

        if (!journal.getAuthor().getId().equals(userId)) {
            throw new ForbiddenException("Bạn không có quyền thao tác trên nhật ký này");
        }

        if (request.getEntryType() != null) {
            journal.setEntryType(request.getEntryType());
        }
        if (request.getHealthStatus() != null) {
            journal.setHealthStatus(request.getHealthStatus());
        }
        if (request.getNote() != null) {
            journal.setNote(request.getNote());
        }
        if (request.getImageUrls() != null) {
            mediaUrlValidator.validateAll(request.getImageUrls(), "imageUrls");
            journal.setImageUrls(request.getImageUrls().toArray(new String[0]));
        }
        if (request.getRecordedAt() != null) {
            journal.setRecordedAt(request.getRecordedAt());
        }

        journal = growthJournalRepository.save(journal);
        return mapToResponse(journal);
    }

    public void deleteJournal(UUID journalId, UUID userId) {
        GrowthJournal journal = growthJournalRepository.findById(journalId)
            .orElseThrow(() -> new ResourceNotFoundException("Nhật ký phát triển", journalId));

        if (!journal.getAuthor().getId().equals(userId)) {
            throw new ForbiddenException("Bạn không có quyền thao tác trên nhật ký này");
        }

        growthJournalRepository.delete(journal);
    }

    private GrowthJournalResponse mapToResponse(GrowthJournal j) {
        GrowthJournalResponse res = new GrowthJournalResponse();
        res.setId(j.getId());
        res.setUserPlantId(j.getUserPlant().getId());
        res.setEntryType(j.getEntryType());
        res.setHealthStatus(j.getHealthStatus());
        res.setNote(j.getNote());
        if (j.getImageUrls() != null) {
            res.setImageUrls(Arrays.asList(j.getImageUrls()));
        } else {
            res.setImageUrls(Collections.emptyList());
        }
        res.setRecordedAt(j.getRecordedAt());
        res.setCreatedAt(j.getCreatedAt());
        return res;
    }
}
