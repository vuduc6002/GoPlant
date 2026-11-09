package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.common.exception.ForbiddenException;
import com.cmc.plant_care_backend.common.exception.ResourceNotFoundException;
import com.cmc.plant_care_backend.dto.carelog.CareLogResponse;
import com.cmc.plant_care_backend.dto.carelog.CreateCareLogRequest;
import com.cmc.plant_care_backend.model.CareLog;
import com.cmc.plant_care_backend.model.User;
import com.cmc.plant_care_backend.model.UserPlant;
import com.cmc.plant_care_backend.model.enums.CareLogStatus;
import com.cmc.plant_care_backend.repository.CareLogRepository;
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
public class CareLogService {

    private final CareLogRepository careLogRepository;
    private final UserPlantRepository userPlantRepository;
    private final UserRepository userRepository;

    public CareLogService(
        CareLogRepository careLogRepository,
        UserPlantRepository userPlantRepository,
        UserRepository userRepository
    ) {
        this.careLogRepository = careLogRepository;
        this.userPlantRepository = userPlantRepository;
        this.userRepository = userRepository;
    }

    public CareLogResponse createCareLog(UUID userId, CreateCareLogRequest request) {
        User currentUser = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        UserPlant plant = userPlantRepository.findById(request.getUserPlantId())
            .orElseThrow(() -> new ResourceNotFoundException("Cây trồng không tồn tại"));

        if (!plant.getOwner().getId().equals(userId)) {
            throw new ForbiddenException("Bạn không có quyền thao tác trên cây trồng này");
        }

        CareLog log = new CareLog();
        log.setUserPlant(plant);
        log.setPerformedBy(currentUser);
        log.setSchedule(null);
        log.setTaskType(request.getTaskType());
        log.setStatus(CareLogStatus.COMPLETED);
        log.setNote(request.getNote());
        if (request.getImageUrls() != null && !request.getImageUrls().isEmpty()) {
            log.setImageUrls(request.getImageUrls().toArray(new String[0]));
        }
        log.setPerformedAt(request.getPerformedAt() != null ? request.getPerformedAt() : OffsetDateTime.now());

        log = careLogRepository.save(log);

        return mapToResponse(log);
    }

    private CareLogResponse mapToResponse(CareLog log) {
        CareLogResponse res = new CareLogResponse();
        res.setId(log.getId());
        res.setUserPlantId(log.getUserPlant().getId());
        res.setTaskType(log.getTaskType());
        res.setStatus(log.getStatus());
        res.setNote(log.getNote());
        if (log.getImageUrls() != null) {
            res.setImageUrls(Arrays.asList(log.getImageUrls()));
        } else {
            res.setImageUrls(Collections.emptyList());
        }
        res.setPerformedAt(log.getPerformedAt());
        res.setCreatedAt(log.getCreatedAt());
        return res;
    }
}
