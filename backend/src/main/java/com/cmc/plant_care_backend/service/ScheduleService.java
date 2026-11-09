package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.common.exception.ConflictException;
import com.cmc.plant_care_backend.common.exception.ForbiddenException;
import com.cmc.plant_care_backend.common.exception.ResourceNotFoundException;
import com.cmc.plant_care_backend.common.exception.ValidationException;
import com.cmc.plant_care_backend.dto.schedule.*;
import com.cmc.plant_care_backend.model.CareLog;
import com.cmc.plant_care_backend.model.CareSchedule;
import com.cmc.plant_care_backend.model.User;
import com.cmc.plant_care_backend.model.UserPlant;
import com.cmc.plant_care_backend.model.enums.CareLogStatus;
import com.cmc.plant_care_backend.model.enums.Frequency;
import com.cmc.plant_care_backend.model.enums.ScheduleStatus;
import com.cmc.plant_care_backend.repository.CareLogRepository;
import com.cmc.plant_care_backend.repository.CareScheduleRepository;
import com.cmc.plant_care_backend.repository.UserPlantRepository;
import com.cmc.plant_care_backend.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@Transactional
public class ScheduleService {

    private static final ZoneId VN_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final LocalTime DEFAULT_REMINDER_TIME = LocalTime.of(8, 0, 0);

    private final CareScheduleRepository careScheduleRepository;
    private final UserPlantRepository userPlantRepository;
    private final UserRepository userRepository;
    private final CareLogRepository careLogRepository;

    public ScheduleService(
        CareScheduleRepository careScheduleRepository,
        UserPlantRepository userPlantRepository,
        UserRepository userRepository,
        CareLogRepository careLogRepository
    ) {
        this.careScheduleRepository = careScheduleRepository;
        this.userPlantRepository = userPlantRepository;
        this.userRepository = userRepository;
        this.careLogRepository = careLogRepository;
    }

    public CareScheduleResponse createSchedule(UUID userId, CreateScheduleRequest request) {
        User currentUser = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        UserPlant plant = userPlantRepository.findById(request.getUserPlantId())
            .orElseThrow(() -> new ResourceNotFoundException("Cây trồng không tồn tại"));

        if (!plant.getOwner().getId().equals(userId)) {
            throw new ForbiddenException("Bạn không có quyền thao tác trên cây trồng này");
        }

        LocalDate todayVn = LocalDate.now(VN_ZONE);
        if (request.getStartDate().isBefore(todayVn)) {
            throw new ValidationException("Ngày bắt đầu không được trong quá khứ", "startDate");
        }

        if (request.getEndDate() != null && request.getEndDate().isBefore(request.getStartDate())) {
            throw new ValidationException("Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu", "endDate");
        }

        Integer intervalDays = null;
        if (request.getFrequency() == Frequency.CUSTOM) {
            if (request.getIntervalDays() == null || request.getIntervalDays() <= 0) {
                throw new ValidationException("Chu kỳ tùy chỉnh bắt buộc phải có khoảng cách ngày lớn hơn 0", "intervalDays");
            }
            intervalDays = request.getIntervalDays();
        } else {
            if (request.getIntervalDays() != null) {
                throw new ValidationException("Khoảng cách ngày (intervalDays) chỉ áp dụng cho chu kỳ tùy chỉnh (CUSTOM)", "intervalDays");
            }
        }

        LocalTime reminderTime = parseLocalTime(request.getReminderTime(), DEFAULT_REMINDER_TIME);
        OffsetDateTime nextScheduledAt = request.getStartDate()
            .atTime(reminderTime)
            .atZone(VN_ZONE)
            .toOffsetDateTime()
            .withOffsetSameInstant(ZoneOffset.UTC);

        CareSchedule schedule = new CareSchedule();
        schedule.setUserPlant(plant);
        schedule.setOwner(currentUser);
        schedule.setTaskType(request.getTaskType());
        schedule.setTaskLabel(request.getTaskLabel());
        schedule.setFrequency(request.getFrequency());
        schedule.setIntervalDays(intervalDays);
        schedule.setReminderTime(reminderTime);
        schedule.setStartDate(request.getStartDate());
        schedule.setEndDate(request.getEndDate());
        schedule.setNextScheduledAt(nextScheduledAt);
        schedule.setStatus(ScheduleStatus.ACTIVE);

        schedule = careScheduleRepository.save(schedule);
        return mapToScheduleResponse(schedule, OffsetDateTime.now());
    }

    @Transactional(readOnly = true)
    public List<TodayScheduleItemResponse> getTodaySchedules(UUID userId) {
        LocalDate todayVn = LocalDate.now(VN_ZONE);
        OffsetDateTime endOfTodayVn = todayVn.atTime(23, 59, 59, 999_999_999)
            .atZone(VN_ZONE)
            .toOffsetDateTime();

        List<CareSchedule> schedules = careScheduleRepository
            .findByOwnerIdAndStatusAndNextScheduledAtLessThanEqualOrderByNextScheduledAtAsc(
                userId, ScheduleStatus.ACTIVE, endOfTodayVn
            );

        OffsetDateTime now = OffsetDateTime.now();
        return schedules.stream()
            .map(s -> {
                TodayScheduleItemResponse item = new TodayScheduleItemResponse();
                item.setScheduleId(s.getId());
                item.setPlantId(s.getUserPlant().getId());
                item.setPlantName(s.getUserPlant().getDisplayName());
                if (s.getUserPlant().getGarden() != null) {
                    item.setGardenName(s.getUserPlant().getGarden().getName());
                }
                item.setTaskType(s.getTaskType());
                item.setTaskLabel(s.getTaskLabel());
                if (s.getNextScheduledAt() != null) {
                    item.setNextScheduledAt(s.getNextScheduledAt().withOffsetSameInstant(ZoneOffset.UTC));
                }
                item.setOverdue(s.getNextScheduledAt().isBefore(now));
                item.setStatus(s.getStatus());
                return item;
            })
            .collect(Collectors.toList());
    }

    public CareScheduleResponse updateSchedule(UUID scheduleId, UUID userId, UpdateScheduleRequest request) {
        CareSchedule schedule = careScheduleRepository.findByIdWithPessimisticLock(scheduleId)
            .orElseThrow(() -> new ResourceNotFoundException("Lịch chăm sóc", scheduleId));

        if (!schedule.getOwner().getId().equals(userId)) {
            throw new ForbiddenException("Bạn không có quyền thao tác trên lịch chăm sóc này");
        }

        if (request.isTaskTypePresent() && request.getTaskType() != null) {
            schedule.setTaskType(request.getTaskType());
        }

        if (request.isTaskLabelPresent()) {
            schedule.setTaskLabel(request.getTaskLabel());
        }

        if (request.isReminderTimePresent()) {
            if (request.getReminderTime() == null) {
                schedule.setReminderTime(DEFAULT_REMINDER_TIME);
            } else {
                schedule.setReminderTime(parseLocalTime(request.getReminderTime(), DEFAULT_REMINDER_TIME));
            }
        }

        if (request.isFrequencyPresent() && request.getFrequency() == null) {
            throw new ValidationException("Tần suất lặp không được để trống", "frequency");
        }

        Frequency targetFreq = request.isFrequencyPresent() ? request.getFrequency() : schedule.getFrequency();
        Integer targetInterval;
        if (request.isIntervalDaysPresent()) {
            targetInterval = request.getIntervalDays();
        } else {
            targetInterval = (targetFreq == Frequency.CUSTOM) ? schedule.getIntervalDays() : null;
        }

        if (targetFreq == Frequency.CUSTOM) {
            if (targetInterval == null || targetInterval <= 0) {
                throw new ValidationException("Chu kỳ tùy chỉnh bắt buộc phải có khoảng cách ngày lớn hơn 0", "intervalDays");
            }
            schedule.setIntervalDays(targetInterval);
        } else {
            if (request.isIntervalDaysPresent() && request.getIntervalDays() != null) {
                throw new ValidationException("Khoảng cách ngày (intervalDays) chỉ áp dụng cho chu kỳ tùy chỉnh (CUSTOM)", "intervalDays");
            }
            schedule.setIntervalDays(null);
        }
        schedule.setFrequency(targetFreq);

        if (request.isStartDatePresent() && request.getStartDate() != null) {
            schedule.setStartDate(request.getStartDate());
        }

        if (request.isEndDatePresent()) {
            schedule.setEndDate(request.getEndDate());
        }

        if (schedule.getEndDate() != null && schedule.getEndDate().isBefore(schedule.getStartDate())) {
            throw new ValidationException("Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu", "endDate");
        }

        if (request.isStatusPresent() && request.getStatus() != null) {
            schedule.setStatus(request.getStatus());
        }

        if (schedule.getStatus() == ScheduleStatus.ACTIVE &&
            (request.isStartDatePresent() || request.isReminderTimePresent() || request.isFrequencyPresent())) {
            LocalTime rt = schedule.getReminderTime() != null ? schedule.getReminderTime() : DEFAULT_REMINDER_TIME;
            LocalDate todayVn = LocalDate.now(VN_ZONE);
            LocalDate baseDate = schedule.getStartDate().isAfter(todayVn) ? schedule.getStartDate() : todayVn;
            OffsetDateTime next = baseDate.atTime(rt).atZone(VN_ZONE).toOffsetDateTime();
            OffsetDateTime now = OffsetDateTime.now();
            if (next.isBefore(now) && schedule.getFrequency() != Frequency.ONCE) {
                int step = getStepDays(schedule.getFrequency(), schedule.getIntervalDays());
                while (!next.isAfter(now)) {
                    next = next.plusDays(step);
                }
            }
            schedule.setNextScheduledAt(next.withOffsetSameInstant(ZoneOffset.UTC));
        }

        schedule = careScheduleRepository.save(schedule);
        return mapToScheduleResponse(schedule, OffsetDateTime.now());
    }

    public void deleteSchedule(UUID scheduleId, UUID userId) {
        CareSchedule schedule = careScheduleRepository.findByIdWithPessimisticLock(scheduleId)
            .orElseThrow(() -> new ResourceNotFoundException("Lịch chăm sóc", scheduleId));

        if (!schedule.getOwner().getId().equals(userId)) {
            throw new ForbiddenException("Bạn không có quyền thao tác trên lịch chăm sóc này");
        }

        careLogRepository.detachSchedule(scheduleId);
        careScheduleRepository.delete(schedule);
    }

    public CompleteScheduleResponse completeSchedule(UUID scheduleId, UUID userId, CompleteCareRequest request) {
        CareSchedule schedule = careScheduleRepository.findByIdWithPessimisticLock(scheduleId)
            .orElseThrow(() -> new ResourceNotFoundException("Lịch chăm sóc", scheduleId));

        if (!schedule.getOwner().getId().equals(userId)) {
            throw new ForbiddenException("Bạn không có quyền thao tác trên lịch chăm sóc này");
        }

        if (schedule.getStatus() != ScheduleStatus.ACTIVE) {
            throw new ConflictException("Lịch chăm sóc không ở trạng thái hoạt động (" + schedule.getStatus() + ")");
        }

        OffsetDateTime now = OffsetDateTime.now();
        if (schedule.getNextScheduledAt().isAfter(now)) {
            throw new ConflictException("Lượt chăm sóc chưa đến hạn hoặc đã được hoàn thành");
        }

        CareLog log = new CareLog();
        log.setUserPlant(schedule.getUserPlant());
        log.setPerformedBy(schedule.getOwner());
        log.setSchedule(schedule);
        log.setTaskType(schedule.getTaskType().name());
        log.setStatus(CareLogStatus.COMPLETED);
        if (request != null) {
            log.setNote(request.getNote());
            if (request.getImageUrls() != null) {
                log.setImageUrls(request.getImageUrls().toArray(new String[0]));
            }
            if (request.getPerformedAt() != null) {
                log.setPerformedAt(request.getPerformedAt());
            } else {
                log.setPerformedAt(now);
            }
        } else {
            log.setPerformedAt(now);
        }
        log = careLogRepository.save(log);

        advanceSchedule(schedule);
        schedule = careScheduleRepository.save(schedule);

        OffsetDateTime nextUtc = schedule.getNextScheduledAt() != null
            ? schedule.getNextScheduledAt().withOffsetSameInstant(ZoneOffset.UTC)
            : null;

        return new CompleteScheduleResponse(log.getId(), schedule.getStatus().name(), nextUtc);
    }

    public CompleteScheduleResponse skipSchedule(UUID scheduleId, UUID userId, SkipCareRequest request) {
        CareSchedule schedule = careScheduleRepository.findByIdWithPessimisticLock(scheduleId)
            .orElseThrow(() -> new ResourceNotFoundException("Lịch chăm sóc", scheduleId));

        if (!schedule.getOwner().getId().equals(userId)) {
            throw new ForbiddenException("Bạn không có quyền thao tác trên lịch chăm sóc này");
        }

        if (schedule.getStatus() != ScheduleStatus.ACTIVE) {
            throw new ConflictException("Lịch chăm sóc không ở trạng thái hoạt động (" + schedule.getStatus() + ")");
        }

        OffsetDateTime now = OffsetDateTime.now();
        if (schedule.getNextScheduledAt().isAfter(now)) {
            throw new ConflictException("Lượt chăm sóc chưa đến hạn hoặc đã được hoàn thành");
        }

        CareLog log = new CareLog();
        log.setUserPlant(schedule.getUserPlant());
        log.setPerformedBy(schedule.getOwner());
        log.setSchedule(schedule);
        log.setTaskType(schedule.getTaskType().name());
        log.setStatus(CareLogStatus.SKIPPED);
        if (request != null && request.getNote() != null) {
            log.setNote(request.getNote());
        }
        log.setPerformedAt(now);
        log = careLogRepository.save(log);

        advanceSchedule(schedule);
        schedule = careScheduleRepository.save(schedule);

        OffsetDateTime nextUtc = schedule.getNextScheduledAt() != null
            ? schedule.getNextScheduledAt().withOffsetSameInstant(ZoneOffset.UTC)
            : null;

        return new CompleteScheduleResponse(log.getId(), schedule.getStatus().name(), nextUtc);
    }

    private void advanceSchedule(CareSchedule schedule) {
        if (schedule.getFrequency() == Frequency.ONCE) {
            schedule.setStatus(ScheduleStatus.COMPLETED);
            return;
        }

        int stepDays = getStepDays(schedule.getFrequency(), schedule.getIntervalDays());
        OffsetDateTime next = schedule.getNextScheduledAt().plusDays(stepDays);
        OffsetDateTime now = OffsetDateTime.now();
        while (!next.isAfter(now)) {
            next = next.plusDays(stepDays);
        }

        if (schedule.getEndDate() != null) {
            LocalDate nextDateVn = next.atZoneSameInstant(VN_ZONE).toLocalDate();
            if (nextDateVn.isAfter(schedule.getEndDate())) {
                schedule.setStatus(ScheduleStatus.COMPLETED);
                return;
            }
        }

        schedule.setNextScheduledAt(next.withOffsetSameInstant(ZoneOffset.UTC));
    }

    private int getStepDays(Frequency freq, Integer intervalDays) {
        return switch (freq) {
            case DAILY -> 1;
            case EVERY_OTHER_DAY -> 2;
            case WEEKLY -> 7;
            case CUSTOM -> (intervalDays != null && intervalDays > 0) ? intervalDays : 1;
            case ONCE -> 0;
        };
    }

    private LocalTime parseLocalTime(String timeStr, LocalTime defaultTime) {
        if (timeStr == null) {
            return defaultTime;
        }
        String trimmed = timeStr.trim();
        if (trimmed.isEmpty()) {
            throw new ValidationException("Giờ nhắc không được để trống", "reminderTime");
        }
        try {
            if (trimmed.length() == 5) {
                trimmed = trimmed + ":00";
            }
            return LocalTime.parse(trimmed);
        } catch (DateTimeParseException e) {
            throw new ValidationException("Giờ nhắc không đúng định dạng HH:mm:ss", "reminderTime");
        }
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
}
