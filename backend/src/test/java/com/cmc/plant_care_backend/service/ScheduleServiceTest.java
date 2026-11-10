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
import com.cmc.plant_care_backend.model.enums.TaskType;
import com.cmc.plant_care_backend.repository.CareLogRepository;
import com.cmc.plant_care_backend.repository.CareScheduleRepository;
import com.cmc.plant_care_backend.repository.UserPlantRepository;
import com.cmc.plant_care_backend.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ScheduleServiceTest {

    private static final ZoneId VN_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    @Mock
    private CareScheduleRepository careScheduleRepository;
    @Mock
    private UserPlantRepository userPlantRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private CareLogRepository careLogRepository;

    @InjectMocks
    private ScheduleService scheduleService;

    private UUID userId;
    private User user;
    private UUID plantId;
    private UserPlant plant;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
        user = new User();
        user.setId(userId);

        plantId = UUID.randomUUID();
        plant = new UserPlant();
        plant.setId(plantId);
        plant.setDisplayName("Cà Chua Cherry");
        plant.setOwner(user);
    }

    @Test
    void createSchedule_Success_Daily() {
        LocalDate todayVn = LocalDate.now(VN_ZONE);
        CreateScheduleRequest req = new CreateScheduleRequest();
        req.setUserPlantId(plantId);
        req.setTaskType(TaskType.WATERING);
        req.setFrequency(Frequency.DAILY);
        req.setStartDate(todayVn);
        req.setReminderTime("08:00:00");

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userPlantRepository.findById(plantId)).thenReturn(Optional.of(plant));
        when(careScheduleRepository.save(any(CareSchedule.class))).thenAnswer(i -> {
            CareSchedule s = i.getArgument(0);
            s.setId(UUID.randomUUID());
            return s;
        });

        CareScheduleResponse res = scheduleService.createSchedule(userId, req);

        assertNotNull(res);
        assertEquals(TaskType.WATERING, res.getTaskType());
        assertEquals(Frequency.DAILY, res.getFrequency());
        assertNull(res.getIntervalDays());
        assertEquals(ScheduleStatus.ACTIVE, res.getStatus());
    }

    @Test
    void createSchedule_NonCustomWithIntervalDays_ThrowsValidationException() {
        LocalDate todayVn = LocalDate.now(VN_ZONE);
        CreateScheduleRequest req = new CreateScheduleRequest();
        req.setUserPlantId(plantId);
        req.setTaskType(TaskType.WATERING);
        req.setFrequency(Frequency.DAILY);
        req.setIntervalDays(3);
        req.setStartDate(todayVn);

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userPlantRepository.findById(plantId)).thenReturn(Optional.of(plant));

        assertThrows(ValidationException.class, () ->
            scheduleService.createSchedule(userId, req));
    }

    @Test
    void createSchedule_InvalidReminderTime_ThrowsValidationException() {
        LocalDate todayVn = LocalDate.now(VN_ZONE);
        CreateScheduleRequest req = new CreateScheduleRequest();
        req.setUserPlantId(plantId);
        req.setTaskType(TaskType.WATERING);
        req.setFrequency(Frequency.DAILY);
        req.setStartDate(todayVn);
        req.setReminderTime("invalid_time");

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userPlantRepository.findById(plantId)).thenReturn(Optional.of(plant));

        assertThrows(ValidationException.class, () ->
            scheduleService.createSchedule(userId, req));
    }

    @Test
    void createSchedule_BlankReminderTime_ThrowsValidationException() {
        LocalDate todayVn = LocalDate.now(VN_ZONE);
        CreateScheduleRequest req = new CreateScheduleRequest();
        req.setUserPlantId(plantId);
        req.setTaskType(TaskType.WATERING);
        req.setFrequency(Frequency.DAILY);
        req.setStartDate(todayVn);
        req.setReminderTime("   ");

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userPlantRepository.findById(plantId)).thenReturn(Optional.of(plant));

        assertThrows(ValidationException.class, () ->
            scheduleService.createSchedule(userId, req));
    }

    @Test
    void createSchedule_CustomWithoutInterval_ThrowsValidationException() {
        LocalDate todayVn = LocalDate.now(VN_ZONE);
        CreateScheduleRequest req = new CreateScheduleRequest();
        req.setUserPlantId(plantId);
        req.setTaskType(TaskType.WATERING);
        req.setFrequency(Frequency.CUSTOM);
        req.setIntervalDays(null);
        req.setStartDate(todayVn);

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userPlantRepository.findById(plantId)).thenReturn(Optional.of(plant));

        assertThrows(ValidationException.class, () ->
            scheduleService.createSchedule(userId, req));
    }

    @Test
    void createSchedule_CustomIntervalDaysNonPositive_ThrowsValidationException() {
        LocalDate todayVn = LocalDate.now(VN_ZONE);
        CreateScheduleRequest req = new CreateScheduleRequest();
        req.setUserPlantId(plantId);
        req.setTaskType(TaskType.WATERING);
        req.setFrequency(Frequency.CUSTOM);
        req.setIntervalDays(0);
        req.setStartDate(todayVn);

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userPlantRepository.findById(plantId)).thenReturn(Optional.of(plant));

        assertThrows(ValidationException.class, () ->
            scheduleService.createSchedule(userId, req));
    }

    @Test
    void createSchedule_CustomWithInterval_Success() {
        LocalDate todayVn = LocalDate.now(VN_ZONE);
        CreateScheduleRequest req = new CreateScheduleRequest();
        req.setUserPlantId(plantId);
        req.setTaskType(TaskType.WATERING);
        req.setFrequency(Frequency.CUSTOM);
        req.setIntervalDays(3);
        req.setStartDate(todayVn);

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userPlantRepository.findById(plantId)).thenReturn(Optional.of(plant));
        when(careScheduleRepository.save(any(CareSchedule.class))).thenAnswer(i -> {
            CareSchedule s = i.getArgument(0);
            s.setId(UUID.randomUUID());
            return s;
        });

        CareScheduleResponse res = scheduleService.createSchedule(userId, req);

        assertNotNull(res);
        assertEquals(Frequency.CUSTOM, res.getFrequency());
        assertEquals(3, res.getIntervalDays());
    }

    @Test
    void createSchedule_StartDateInPast_ThrowsValidationException() {
        LocalDate pastDate = LocalDate.now(VN_ZONE).minusDays(1);
        CreateScheduleRequest req = new CreateScheduleRequest();
        req.setUserPlantId(plantId);
        req.setTaskType(TaskType.WATERING);
        req.setFrequency(Frequency.DAILY);
        req.setStartDate(pastDate);

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userPlantRepository.findById(plantId)).thenReturn(Optional.of(plant));

        assertThrows(ValidationException.class, () ->
            scheduleService.createSchedule(userId, req));
    }

    @Test
    void createSchedule_EndDateBeforeStartDate_ThrowsValidationException() {
        LocalDate todayVn = LocalDate.now(VN_ZONE);
        CreateScheduleRequest req = new CreateScheduleRequest();
        req.setUserPlantId(plantId);
        req.setTaskType(TaskType.WATERING);
        req.setFrequency(Frequency.DAILY);
        req.setStartDate(todayVn.plusDays(5));
        req.setEndDate(todayVn.plusDays(2));

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userPlantRepository.findById(plantId)).thenReturn(Optional.of(plant));

        assertThrows(ValidationException.class, () ->
            scheduleService.createSchedule(userId, req));
    }

    @Test
    void createSchedule_NotPlantOwner_ThrowsForbidden() {
        User otherUser = new User();
        otherUser.setId(UUID.randomUUID());
        plant.setOwner(otherUser);

        LocalDate todayVn = LocalDate.now(VN_ZONE);
        CreateScheduleRequest req = new CreateScheduleRequest();
        req.setUserPlantId(plantId);
        req.setStartDate(todayVn);

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userPlantRepository.findById(plantId)).thenReturn(Optional.of(plant));

        assertThrows(ForbiddenException.class, () ->
            scheduleService.createSchedule(userId, req));
    }

    @Test
    void getTodaySchedules_ReturnsDueAndOverdueSchedules() {
        CareSchedule s = new CareSchedule();
        s.setId(UUID.randomUUID());
        s.setUserPlant(plant);
        s.setOwner(user);
        s.setTaskType(TaskType.WATERING);
        s.setFrequency(Frequency.DAILY);
        s.setNextScheduledAt(OffsetDateTime.now().minusHours(2));
        s.setStatus(ScheduleStatus.ACTIVE);

        when(careScheduleRepository.findByOwnerIdAndStatusAndNextScheduledAtLessThanEqualOrderByNextScheduledAtAsc(
            eq(userId), eq(ScheduleStatus.ACTIVE), any(OffsetDateTime.class)
        )).thenReturn(List.of(s));

        List<TodayScheduleItemResponse> list = scheduleService.getTodaySchedules(userId);

        assertEquals(1, list.size());
        assertTrue(list.get(0).isOverdue());
    }

    @Test
    void updateSchedule_Success() {
        UUID scheduleId = UUID.randomUUID();
        CareSchedule s = new CareSchedule();
        s.setId(scheduleId);
        s.setUserPlant(plant);
        s.setOwner(user);
        s.setTaskType(TaskType.WATERING);
        s.setFrequency(Frequency.DAILY);
        s.setStartDate(LocalDate.now(VN_ZONE));
        s.setNextScheduledAt(OffsetDateTime.now().plusDays(1));
        s.setStatus(ScheduleStatus.ACTIVE);

        UpdateScheduleRequest req = new UpdateScheduleRequest();
        req.setTaskLabel("Nhãn mới");
        req.setFrequency(Frequency.WEEKLY);

        when(careScheduleRepository.findByIdWithPessimisticLock(scheduleId)).thenReturn(Optional.of(s));
        when(careScheduleRepository.save(any(CareSchedule.class))).thenAnswer(i -> i.getArgument(0));

        CareScheduleResponse res = scheduleService.updateSchedule(scheduleId, userId, req);

        assertNotNull(res);
        assertEquals("Nhãn mới", res.getTaskLabel());
        assertEquals(Frequency.WEEKLY, res.getFrequency());
        assertNull(res.getIntervalDays());
    }

    @Test
    void updateSchedule_FrequencyNull_ThrowsValidationException() {
        UUID scheduleId = UUID.randomUUID();
        CareSchedule s = new CareSchedule();
        s.setId(scheduleId);
        s.setUserPlant(plant);
        s.setOwner(user);

        UpdateScheduleRequest req = new UpdateScheduleRequest();
        req.setFrequency(null);

        when(careScheduleRepository.findByIdWithPessimisticLock(scheduleId)).thenReturn(Optional.of(s));

        assertThrows(ValidationException.class, () ->
            scheduleService.updateSchedule(scheduleId, userId, req));
    }

    @Test
    void updateSchedule_NonCustomWithIntervalDays_ThrowsValidationException() {
        UUID scheduleId = UUID.randomUUID();
        CareSchedule s = new CareSchedule();
        s.setId(scheduleId);
        s.setUserPlant(plant);
        s.setOwner(user);
        s.setFrequency(Frequency.DAILY);

        UpdateScheduleRequest req = new UpdateScheduleRequest();
        req.setIntervalDays(5);

        when(careScheduleRepository.findByIdWithPessimisticLock(scheduleId)).thenReturn(Optional.of(s));

        assertThrows(ValidationException.class, () ->
            scheduleService.updateSchedule(scheduleId, userId, req));
    }

    @Test
    void deleteSchedule_DetachesCareLogsAndDeletes() {
        UUID scheduleId = UUID.randomUUID();
        CareSchedule s = new CareSchedule();
        s.setId(scheduleId);
        s.setUserPlant(plant);
        s.setOwner(user);

        when(careScheduleRepository.findByIdWithPessimisticLock(scheduleId)).thenReturn(Optional.of(s));

        scheduleService.deleteSchedule(scheduleId, userId);

        verify(careLogRepository, times(1)).detachSchedule(scheduleId);
        verify(careScheduleRepository, times(1)).delete(s);
    }

    @Test
    void completeSchedule_Once_SetsCompleted() {
        UUID scheduleId = UUID.randomUUID();
        CareSchedule s = new CareSchedule();
        s.setId(scheduleId);
        s.setUserPlant(plant);
        s.setOwner(user);
        s.setTaskType(TaskType.WATERING);
        s.setFrequency(Frequency.ONCE);
        s.setNextScheduledAt(OffsetDateTime.now().minusMinutes(5));
        s.setStatus(ScheduleStatus.ACTIVE);

        when(careScheduleRepository.findByIdWithPessimisticLock(scheduleId)).thenReturn(Optional.of(s));
        when(careLogRepository.save(any(CareLog.class))).thenAnswer(i -> {
            CareLog l = i.getArgument(0);
            l.setId(UUID.randomUUID());
            return l;
        });
        when(careScheduleRepository.save(any(CareSchedule.class))).thenAnswer(i -> i.getArgument(0));

        CompleteScheduleResponse res = scheduleService.completeSchedule(scheduleId, userId, null);

        assertNotNull(res);
        assertEquals("COMPLETED", res.getScheduleStatus());
    }

    @Test
    void completeSchedule_NotActive_ThrowsConflictException() {
        UUID scheduleId = UUID.randomUUID();
        CareSchedule s = new CareSchedule();
        s.setId(scheduleId);
        s.setUserPlant(plant);
        s.setOwner(user);
        s.setStatus(ScheduleStatus.PAUSED);

        when(careScheduleRepository.findByIdWithPessimisticLock(scheduleId)).thenReturn(Optional.of(s));

        assertThrows(ConflictException.class, () ->
            scheduleService.completeSchedule(scheduleId, userId, null));
    }

    @Test
    void completeSchedule_NotDueYet_ThrowsConflictException() {
        UUID scheduleId = UUID.randomUUID();
        CareSchedule s = new CareSchedule();
        s.setId(scheduleId);
        s.setUserPlant(plant);
        s.setOwner(user);
        s.setStatus(ScheduleStatus.ACTIVE);
        s.setNextScheduledAt(OffsetDateTime.now().plusDays(2)); // not due yet

        when(careScheduleRepository.findByIdWithPessimisticLock(scheduleId)).thenReturn(Optional.of(s));

        assertThrows(ConflictException.class, () ->
            scheduleService.completeSchedule(scheduleId, userId, null));
    }

    @Test
    void completeSchedule_Recurring_AdvancesNextScheduledAt() {
        UUID scheduleId = UUID.randomUUID();
        CareSchedule s = new CareSchedule();
        s.setId(scheduleId);
        s.setUserPlant(plant);
        s.setOwner(user);
        s.setTaskType(TaskType.WATERING);
        s.setFrequency(Frequency.DAILY);
        s.setNextScheduledAt(OffsetDateTime.now().minusDays(2)); // overdue by 2 days
        s.setStatus(ScheduleStatus.ACTIVE);

        when(careScheduleRepository.findByIdWithPessimisticLock(scheduleId)).thenReturn(Optional.of(s));
        when(careLogRepository.save(any(CareLog.class))).thenAnswer(i -> {
            CareLog l = i.getArgument(0);
            l.setId(UUID.randomUUID());
            return l;
        });
        when(careScheduleRepository.save(any(CareSchedule.class))).thenAnswer(i -> i.getArgument(0));

        CompleteScheduleResponse res = scheduleService.completeSchedule(scheduleId, userId, null);

        assertNotNull(res);
        assertEquals("ACTIVE", res.getScheduleStatus());
        assertTrue(res.getNextScheduledAt().isAfter(OffsetDateTime.now()));
    }

    @Test
    void completeSchedule_ExceedsEndDate_SetsCompleted() {
        UUID scheduleId = UUID.randomUUID();
        CareSchedule s = new CareSchedule();
        s.setId(scheduleId);
        s.setUserPlant(plant);
        s.setOwner(user);
        s.setTaskType(TaskType.WATERING);
        s.setFrequency(Frequency.DAILY);
        s.setNextScheduledAt(OffsetDateTime.now().minusHours(1));
        s.setEndDate(LocalDate.now(VN_ZONE).minusDays(1)); // endDate has passed relative to next run, ensuring completion
        s.setStatus(ScheduleStatus.ACTIVE);

        when(careScheduleRepository.findByIdWithPessimisticLock(scheduleId)).thenReturn(Optional.of(s));
        when(careLogRepository.save(any(CareLog.class))).thenAnswer(i -> {
            CareLog l = i.getArgument(0);
            l.setId(UUID.randomUUID());
            return l;
        });
        when(careScheduleRepository.save(any(CareSchedule.class))).thenAnswer(i -> i.getArgument(0));

        CompleteScheduleResponse res = scheduleService.completeSchedule(scheduleId, userId, null);

        assertNotNull(res);
        assertEquals("COMPLETED", res.getScheduleStatus());
    }

    @Test
    void skipSchedule_NotActive_ThrowsConflictException() {
        UUID scheduleId = UUID.randomUUID();
        CareSchedule s = new CareSchedule();
        s.setId(scheduleId);
        s.setUserPlant(plant);
        s.setOwner(user);
        s.setStatus(ScheduleStatus.CANCELLED);

        when(careScheduleRepository.findByIdWithPessimisticLock(scheduleId)).thenReturn(Optional.of(s));

        assertThrows(ConflictException.class, () ->
            scheduleService.skipSchedule(scheduleId, userId, null));
    }

    @Test
    void skipSchedule_NotDueYet_ThrowsConflictException() {
        UUID scheduleId = UUID.randomUUID();
        CareSchedule s = new CareSchedule();
        s.setId(scheduleId);
        s.setUserPlant(plant);
        s.setOwner(user);
        s.setStatus(ScheduleStatus.ACTIVE);
        s.setNextScheduledAt(OffsetDateTime.now().plusHours(3)); // in future

        when(careScheduleRepository.findByIdWithPessimisticLock(scheduleId)).thenReturn(Optional.of(s));

        assertThrows(ConflictException.class, () ->
            scheduleService.skipSchedule(scheduleId, userId, null));
    }

    @Test
    void skipSchedule_CreatesSkippedCareLogAndAdvances() {
        UUID scheduleId = UUID.randomUUID();
        CareSchedule s = new CareSchedule();
        s.setId(scheduleId);
        s.setUserPlant(plant);
        s.setOwner(user);
        s.setTaskType(TaskType.PRUNING);
        s.setFrequency(Frequency.WEEKLY);
        s.setNextScheduledAt(OffsetDateTime.now().minusHours(1));
        s.setStatus(ScheduleStatus.ACTIVE);

        when(careScheduleRepository.findByIdWithPessimisticLock(scheduleId)).thenReturn(Optional.of(s));
        when(careLogRepository.save(any(CareLog.class))).thenAnswer(i -> {
            CareLog l = i.getArgument(0);
            l.setId(UUID.randomUUID());
            assertEquals(CareLogStatus.SKIPPED, l.getStatus());
            return l;
        });
        when(careScheduleRepository.save(any(CareSchedule.class))).thenAnswer(i -> i.getArgument(0));

        SkipCareRequest skipReq = new SkipCareRequest();
        skipReq.setNote("Không có nhà");

        CompleteScheduleResponse res = scheduleService.skipSchedule(scheduleId, userId, skipReq);

        assertNotNull(res);
        assertEquals("ACTIVE", res.getScheduleStatus());
        assertTrue(res.getNextScheduledAt().isAfter(OffsetDateTime.now()));
    }
}
