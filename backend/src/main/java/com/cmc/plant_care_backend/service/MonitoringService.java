package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.common.exception.ForbiddenException;
import com.cmc.plant_care_backend.common.exception.ResourceNotFoundException;
import com.cmc.plant_care_backend.dto.monitoring.*;
import com.cmc.plant_care_backend.model.Garden;
import com.cmc.plant_care_backend.model.PlantSpecies;
import com.cmc.plant_care_backend.model.UserPlant;
import com.cmc.plant_care_backend.model.enums.CareLogStatus;
import com.cmc.plant_care_backend.model.enums.EntryType;
import com.cmc.plant_care_backend.model.enums.HealthStatus;
import com.cmc.plant_care_backend.repository.CareLogRepository;
import com.cmc.plant_care_backend.repository.CareScheduleRepository;
import com.cmc.plant_care_backend.repository.GardenRepository;
import com.cmc.plant_care_backend.repository.GrowthJournalRepository;
import com.cmc.plant_care_backend.repository.UserPlantRepository;
import com.cmc.plant_care_backend.repository.projection.CareLogOverviewWindowsProjection;
import com.cmc.plant_care_backend.repository.projection.CareLogWindowProjection;
import com.cmc.plant_care_backend.repository.projection.GardenMonitoringProjection;
import com.cmc.plant_care_backend.repository.projection.PlantHealthDistributionProjection;
import com.cmc.plant_care_backend.repository.projection.RecentMonitoringCareLogProjection;
import com.cmc.plant_care_backend.repository.projection.RecentMonitoringJournalProjection;
import com.cmc.plant_care_backend.repository.projection.ScheduleSummaryProjection;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@Service
public class MonitoringService {

    private static final ZoneId VN_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final int ATTENTION_PLANTS_LIMIT = 10;
    private static final int TIMELINE_LIMIT = 15;
    private static final int JOURNAL_OBSERVATIONS_LIMIT = 10;
    private static final int NOTE_PREVIEW_MAX_LENGTH = 160;
    private static final List<HealthStatus> ATTENTION_STATUSES = List.of(
        HealthStatus.CRITICAL,
        HealthStatus.NEEDS_ATTENTION
    );

    private final GardenRepository gardenRepository;
    private final UserPlantRepository userPlantRepository;
    private final CareScheduleRepository careScheduleRepository;
    private final CareLogRepository careLogRepository;
    private final GrowthJournalRepository growthJournalRepository;
    private final Clock clock;

    public MonitoringService(
        GardenRepository gardenRepository,
        UserPlantRepository userPlantRepository,
        CareScheduleRepository careScheduleRepository,
        CareLogRepository careLogRepository,
        GrowthJournalRepository growthJournalRepository,
        Clock clock
    ) {
        this.gardenRepository = gardenRepository;
        this.userPlantRepository = userPlantRepository;
        this.careScheduleRepository = careScheduleRepository;
        this.careLogRepository = careLogRepository;
        this.growthJournalRepository = growthJournalRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public MonitoringOverviewResponse getOverview(UUID currentUserId) {
        Instant nowInstant = clock.instant();
        OffsetDateTime nowUtc = OffsetDateTime.ofInstant(nowInstant, ZoneOffset.UTC);
        LocalDate todayVn = LocalDate.ofInstant(nowInstant, VN_ZONE);
        OffsetDateTime startOfTomorrowVnUtc = todayVn.plusDays(1)
            .atStartOfDay(VN_ZONE)
            .toOffsetDateTime()
            .withOffsetSameInstant(ZoneOffset.UTC);
        OffsetDateTime window7dStartUtc = nowUtc.minusDays(7);
        OffsetDateTime window30dStartUtc = nowUtc.minusDays(30);

        // Query 1: Garden summaries (also gives exact gardensCount without an extra count query)
        List<GardenMonitoringProjection> gardenRows =
            gardenRepository.findMonitoringGardenSummariesByOwnerId(currentUserId, ATTENTION_STATUSES);
        List<MonitoringGardenSummaryDto> gardensSummary = gardenRows == null
            ? Collections.emptyList()
            : gardenRows.stream()
                .map(row -> new MonitoringGardenSummaryDto(
                    row.gardenId(),
                    row.name(),
                    toInt(row.plantCount()),
                    toInt(row.attentionCount())
                ))
                .toList();

        // Query 2: Plant count + health status distribution from UserPlant.healthStatus
        PlantHealthDistributionProjection healthRow =
            userPlantRepository.summarizeHealthDistributionByOwnerId(currentUserId);
        int plantsCount = healthRow != null ? toInt(healthRow.totalCount()) : 0;
        HealthDistributionDto healthDistribution = healthRow == null
            ? new HealthDistributionDto(0, 0, 0, 0)
            : new HealthDistributionDto(
                toInt(healthRow.healthyCount()),
                toInt(healthRow.needsAttentionCount()),
                toInt(healthRow.criticalCount()),
                toInt(healthRow.unknownCount())
            );

        // Query 3: Active schedules summary with half-open VN boundaries
        ScheduleSummaryProjection scheduleRow = careScheduleRepository.summarizeActiveSchedulesByOwnerId(
            currentUserId,
            nowUtc,
            startOfTomorrowVnUtc
        );
        SchedulesSummaryDto schedulesSummary = toSchedulesSummaryDto(scheduleRow);

        // Query 4: CareLog 7d & 30d neutral link-state counters in one aggregate scan
        CareLogOverviewWindowsProjection logWindows = careLogRepository.summarizeOverviewWindowsByOwnerId(
            currentUserId,
            window7dStartUtc,
            window30dStartUtc,
            nowUtc
        );
        CareLogsWindowSummaryDto careLogsSummary7d = logWindows == null
            ? new CareLogsWindowSummaryDto(0, 0, 0, 0)
            : new CareLogsWindowSummaryDto(
                toInt(logWindows.unlinkedCompletedLogs7d()),
                toInt(logWindows.unlinkedSkippedLogs7d()),
                toInt(logWindows.linkedScheduledCompletedLogs7d()),
                toInt(logWindows.linkedScheduledSkippedLogs7d())
            );
        CareLogsWindowSummaryDto careLogsSummary30d = logWindows == null
            ? new CareLogsWindowSummaryDto(0, 0, 0, 0)
            : new CareLogsWindowSummaryDto(
                toInt(logWindows.unlinkedCompletedLogs30d()),
                toInt(logWindows.unlinkedSkippedLogs30d()),
                toInt(logWindows.linkedScheduledCompletedLogs30d()),
                toInt(logWindows.linkedScheduledSkippedLogs30d())
            );

        // Query 5: Top 10 attention plants (CRITICAL first, then NEEDS_ATTENTION)
        List<AttentionPlantDto> attentionPlants = userPlantRepository.findAttentionPlantsByOwnerId(
            currentUserId,
            ATTENTION_STATUSES,
            PageRequest.of(0, ATTENTION_PLANTS_LIMIT)
        );
        if (attentionPlants == null) {
            attentionPlants = Collections.emptyList();
        }

        MonitoringOverviewResponse response = new MonitoringOverviewResponse();
        response.setGardensCount(gardensSummary.size());
        response.setPlantsCount(plantsCount);
        response.setHealthDistribution(healthDistribution);
        response.setSchedulesSummary(schedulesSummary);
        response.setCareLogsSummary7d(careLogsSummary7d);
        response.setCareLogsSummary30d(careLogsSummary30d);
        response.setAttentionPlants(attentionPlants);
        response.setGardensSummary(gardensSummary);
        response.setSensorConnected(false);
        response.setGeneratedAt(nowUtc);
        return response;
    }

    @Transactional(readOnly = true)
    public PlantMonitoringDetailResponse getPlantDetail(UUID plantId, UUID currentUserId) {
        // Query 1: Fetch plant with owner, garden, species; validate ownership before running sub-queries
        UserPlant plant = userPlantRepository.findByIdWithDetailsForMonitoring(plantId)
            .orElseThrow(() -> new ResourceNotFoundException("Cây trồng", plantId));

        if (!plant.getOwner().getId().equals(currentUserId)) {
            throw new ForbiddenException("Bạn không có quyền truy cập cây trồng này.");
        }

        Instant nowInstant = clock.instant();
        OffsetDateTime nowUtc = OffsetDateTime.ofInstant(nowInstant, ZoneOffset.UTC);
        LocalDate todayVn = LocalDate.ofInstant(nowInstant, VN_ZONE);
        OffsetDateTime startOfTomorrowVnUtc = todayVn.plusDays(1)
            .atStartOfDay(VN_ZONE)
            .toOffsetDateTime()
            .withOffsetSameInstant(ZoneOffset.UTC);
        OffsetDateTime window30dStartUtc = nowUtc.minusDays(30);

        // Query 2: Plant active schedules summary
        ScheduleSummaryProjection scheduleRow = careScheduleRepository.summarizeActiveSchedulesByPlantIdAndOwnerId(
            plantId,
            currentUserId,
            nowUtc,
            startOfTomorrowVnUtc
        );
        SchedulesSummaryDto schedulesSummary = toSchedulesSummaryDto(scheduleRow);

        // Query 3: Plant 30d CareLog counters
        CareLogWindowProjection logWindow = careLogRepository.summarizePlantWindowByPlantIdAndOwnerId(
            plantId,
            currentUserId,
            window30dStartUtc,
            nowUtc
        );
        CareLogsWindowSummaryDto careLogsSummary30d = logWindow == null
            ? new CareLogsWindowSummaryDto(0, 0, 0, 0)
            : new CareLogsWindowSummaryDto(
                toInt(logWindow.unlinkedCompletedLogs()),
                toInt(logWindow.unlinkedSkippedLogs()),
                toInt(logWindow.linkedScheduledCompletedLogs()),
                toInt(logWindow.linkedScheduledSkippedLogs())
            );

        // Query 4: Recent CareLogs for activity timeline
        List<RecentMonitoringCareLogProjection> recentLogs =
            careLogRepository.findRecentMonitoringLogsByPlantIdAndOwnerId(
                plantId,
                currentUserId,
                PageRequest.of(0, TIMELINE_LIMIT)
            );
        if (recentLogs == null) {
            recentLogs = Collections.emptyList();
        }

        // Query 5: Recent GrowthJournals for both recentJournalObservations and activity timeline
        List<RecentMonitoringJournalProjection> recentJournals =
            growthJournalRepository.findRecentMonitoringJournalsByPlantIdAndOwnerId(
                plantId,
                currentUserId,
                PageRequest.of(0, TIMELINE_LIMIT)
            );
        if (recentJournals == null) {
            recentJournals = Collections.emptyList();
        }

        List<MonitoringJournalObservationDto> recentJournalObservations = recentJournals.stream()
            .limit(JOURNAL_OBSERVATIONS_LIMIT)
            .map(j -> new MonitoringJournalObservationDto(
                j.id(),
                toUtc(j.recordedAt()),
                j.entryType(),
                j.healthStatus(),
                buildNotePreview(j.note())
            ))
            .toList();

        List<MonitoringActivityItemDto> recentActivityTimeline = buildTimeline(recentLogs, recentJournals);

        Garden garden = plant.getGarden();
        PlantSpecies species = plant.getSpecies();

        Integer ageDays = calculateAgeDays(plant.getPlantedAt(), todayVn);

        PlantMonitoringDetailResponse response = new PlantMonitoringDetailResponse();
        response.setPlantId(plant.getId());
        response.setDisplayName(plant.getDisplayName());
        response.setGarden(garden != null ? new MonitoringPlantGardenDto(garden.getId(), garden.getName()) : null);
        response.setSpecies(species != null
            ? new MonitoringPlantSpeciesDto(
                species.getId(),
                species.getCommonName(),
                species.getScientificName(),
                species.getCategory()
            )
            : null);
        response.setCurrentHealthStatus(plant.getHealthStatus());
        response.setPlantedAt(plant.getPlantedAt());
        response.setAgeDays(ageDays);
        response.setSchedulesSummary(schedulesSummary);
        response.setCareLogsSummary30d(careLogsSummary30d);
        response.setRecentActivityTimeline(recentActivityTimeline);
        response.setRecentJournalObservations(recentJournalObservations);
        response.setSpeciesCareGuide(mapSpeciesCareGuide(species));
        response.setSensorConnected(false);
        response.setGeneratedAt(nowUtc);
        return response;
    }

    private SchedulesSummaryDto toSchedulesSummaryDto(ScheduleSummaryProjection row) {
        if (row == null) {
            return new SchedulesSummaryDto(0, 0, 0);
        }
        return new SchedulesSummaryDto(
            toInt(row.activeCount()),
            toInt(row.dueTodayCount()),
            toInt(row.overdueCount())
        );
    }

    private List<MonitoringActivityItemDto> buildTimeline(
        List<RecentMonitoringCareLogProjection> logs,
        List<RecentMonitoringJournalProjection> journals
    ) {
        List<MonitoringActivityItemDto> combined = new ArrayList<>(logs.size() + journals.size());

        for (RecentMonitoringCareLogProjection log : logs) {
            MonitoringActivityItemDto item = new MonitoringActivityItemDto();
            item.setId(log.id());
            item.setSourceType(
                log.scheduleId() == null
                    ? MonitoringActivitySourceType.CARE_LOG_UNLINKED
                    : MonitoringActivitySourceType.CARE_LOG_LINKED
            );
            item.setTitle(buildCareLogTitle(log.taskType(), log.status()));
            item.setTaskType(log.taskType());
            item.setStatus(log.status() != null ? log.status().name() : null);
            item.setEntryType(null);
            item.setHealthStatus(null);
            item.setNotePreview(buildNotePreview(log.note()));
            item.setOccurredAt(toUtc(log.performedAt()));
            combined.add(item);
        }

        for (RecentMonitoringJournalProjection journal : journals) {
            MonitoringActivityItemDto item = new MonitoringActivityItemDto();
            item.setId(journal.id());
            item.setSourceType(MonitoringActivitySourceType.GROWTH_JOURNAL);
            item.setTitle(buildJournalTitle(journal.entryType()));
            item.setTaskType(null);
            item.setStatus(null);
            item.setEntryType(journal.entryType());
            item.setHealthStatus(journal.healthStatus());
            item.setNotePreview(buildNotePreview(journal.note()));
            item.setOccurredAt(toUtc(journal.recordedAt()));
            combined.add(item);
        }

        combined.sort(
            Comparator.comparing(
                    (MonitoringActivityItemDto item) -> item.getOccurredAt() != null ? item.getOccurredAt().toInstant() : null,
                    Comparator.nullsLast(Comparator.reverseOrder())
                )
                .thenComparingInt(item -> item.getSourceType().ordinal())
                .thenComparing(MonitoringActivityItemDto::getId, Comparator.nullsLast(Comparator.reverseOrder()))
        );

        if (combined.size() > TIMELINE_LIMIT) {
            return combined.subList(0, TIMELINE_LIMIT);
        }
        return combined;
    }

    private SpeciesCareGuideDto mapSpeciesCareGuide(PlantSpecies species) {
        SpeciesCareGuideDto guide = new SpeciesCareGuideDto();
        if (species == null) {
            return guide;
        }
        guide.setLightRequirement(normalizeNullableText(species.getLightRequirement()));
        guide.setWaterRequirement(normalizeNullableText(species.getWaterRequirement()));
        guide.setWateringFrequency(normalizeNullableText(species.getWateringFrequency()));
        guide.setTemperatureRange(normalizeNullableText(species.getTemperatureRange()));
        guide.setHumidityRange(normalizeNullableText(species.getHumidityRange()));
        guide.setSoilPh(normalizeNullableText(species.getSoilPh()));
        guide.setUsageAndCaution(normalizeNullableText(species.getUsageAndCaution()));
        return guide;
    }

    private Integer calculateAgeDays(LocalDate plantedAt, LocalDate todayVn) {
        if (plantedAt == null) {
            return null;
        }
        long diff = ChronoUnit.DAYS.between(plantedAt, todayVn);
        if (diff <= 0L) {
            return 0;
        }
        if (diff > Integer.MAX_VALUE) {
            return Integer.MAX_VALUE;
        }
        return (int) diff;
    }

    private OffsetDateTime toUtc(OffsetDateTime value) {
        return value == null ? null : value.withOffsetSameInstant(ZoneOffset.UTC);
    }

    private String normalizeNullableText(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String buildNotePreview(String note) {
        String normalized = normalizeNullableText(note);
        if (normalized == null) {
            return null;
        }
        if (normalized.length() <= NOTE_PREVIEW_MAX_LENGTH) {
            return normalized;
        }
        return normalized.substring(0, NOTE_PREVIEW_MAX_LENGTH - 3).trim() + "...";
    }

    private String buildCareLogTitle(String taskType, CareLogStatus status) {
        String taskLabel = formatTaskTypeVi(taskType);
        String statusLabel = status == CareLogStatus.SKIPPED ? "Bỏ qua" : "Hoàn thành";
        return taskLabel + " • " + statusLabel;
    }

    private String formatTaskTypeVi(String taskType) {
        if (taskType == null || taskType.trim().isEmpty()) {
            return "Chăm sóc";
        }
        return switch (taskType.trim().toUpperCase()) {
            case "WATERING" -> "Tưới nước";
            case "FERTILIZING" -> "Bón phân";
            case "PRUNING" -> "Cắt tỉa";
            case "PEST_CHECK" -> "Kiểm tra sâu bệnh";
            case "MISTING" -> "Phun sương";
            case "JOURNAL" -> "Ghi nhật ký";
            default -> taskType.trim();
        };
    }

    private String buildJournalTitle(EntryType entryType) {
        if (entryType == null) {
            return "Nhật ký phát triển";
        }
        return switch (entryType) {
            case GROWTH -> "Nhật ký sinh trưởng";
            case WATERING -> "Nhật ký tưới nước";
            case FERTILIZING -> "Nhật ký bón phân";
            case PEST -> "Nhật ký sâu bệnh";
            case OTHER -> "Nhật ký khác";
        };
    }

    private int toInt(Long value) {
        if (value == null || value <= 0L) {
            return 0;
        }
        if (value > Integer.MAX_VALUE) {
            return Integer.MAX_VALUE;
        }
        return value.intValue();
    }
}
