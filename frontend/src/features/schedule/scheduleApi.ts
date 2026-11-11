import { apiClient, type ApiUserScopeOptions } from '@/services/api/apiClient';
import { AppApiError } from '@/services/api/apiError';
import type {
  ApiResponse,
  PageResponse,
  SimpleMessageResponseDto,
} from '@/services/api/apiTypes';
import type { PlantScheduleListQueryKeyParams } from '@/services/query/queryKeys';
import type {
  CareScheduleDto,
  CompleteScheduleRequestDto,
  CompleteScheduleResponseDto,
  CreateScheduleRequestDto,
  Frequency,
  PlantScheduleListParams,
  ScheduleStatus,
  SkipScheduleRequestDto,
  TaskType,
  TodayScheduleItemDto,
  UpdateScheduleRequestDto,
} from './scheduleTypes';

export const DEFAULT_SCHEDULE_PAGE = 0;
export const DEFAULT_SCHEDULE_SIZE = 20;
export const MIN_SCHEDULE_SIZE = 1;
export const MAX_SCHEDULE_SIZE = 100;
export const TASK_LABEL_MAX_LENGTH = 200;
export const DEFAULT_REMINDER_TIME = '08:00:00';
export const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';

const VALID_TASK_TYPES = new Set<TaskType>([
  'WATERING',
  'FERTILIZING',
  'PRUNING',
  'PEST_CHECK',
  'MISTING',
  'JOURNAL',
]);

const VALID_FREQUENCIES = new Set<Frequency>([
  'ONCE',
  'DAILY',
  'EVERY_OTHER_DAY',
  'WEEKLY',
  'CUSTOM',
]);

const VALID_SCHEDULE_STATUSES = new Set<ScheduleStatus>([
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
]);

const ISO_LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

interface VnDateParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

function getVnDateParts(date: Date = new Date()): VnDateParts {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: VN_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(date);
    const map: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
    for (const part of parts) {
      map[part.type] = part.value;
    }
    const rawHour = map.hour ?? '00';
    return {
      year: map.year ?? '1970',
      month: map.month ?? '01',
      day: map.day ?? '01',
      hour: rawHour === '24' ? '00' : rawHour,
      minute: map.minute ?? '00',
      second: map.second ?? '00',
    };
  } catch {
    const vnMs = date.getTime() + 7 * 60 * 60 * 1000;
    const vnDate = new Date(vnMs);
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      year: String(vnDate.getUTCFullYear()),
      month: pad(vnDate.getUTCMonth() + 1),
      day: pad(vnDate.getUTCDate()),
      hour: pad(vnDate.getUTCHours()),
      minute: pad(vnDate.getUTCMinutes()),
      second: pad(vnDate.getUTCSeconds()),
    };
  }
}

export function getTodayVnDateString(now: Date = new Date()): string {
  const parts = getVnDateParts(now);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getVnDateKeyFromIso(isoUtc?: string | null): string | null {
  if (typeof isoUtc !== 'string' || !isoUtc.trim()) {
    return null;
  }
  const ms = Date.parse(isoUtc);
  if (!Number.isFinite(ms)) {
    return null;
  }
  const parts = getVnDateParts(new Date(ms));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatNextScheduledAtVn(
  isoUtc?: string | null,
  referenceNow: Date = new Date()
): {
  dateKey: string | null;
  date: string;
  time: string;
  isTodayVn: boolean;
  dateTimeLabel: string;
} {
  if (typeof isoUtc !== 'string' || !isoUtc.trim()) {
    return {
      dateKey: null,
      date: '—',
      time: '—',
      isTodayVn: false,
      dateTimeLabel: 'Chưa xác định',
    };
  }
  const ms = Date.parse(isoUtc);
  if (!Number.isFinite(ms)) {
    return {
      dateKey: null,
      date: '—',
      time: '—',
      isTodayVn: false,
      dateTimeLabel: isoUtc,
    };
  }

  const parts = getVnDateParts(new Date(ms));
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  const todayVn = getTodayVnDateString(referenceNow);
  const isTodayVn = dateKey === todayVn;
  const date = `${parts.day}/${parts.month}/${parts.year}`;
  const time = `${parts.hour}:${parts.minute}`;
  const dateTimeLabel = isTodayVn ? `Hôm nay, ${time} (VN)` : `${time} • ${date} (VN)`;

  return {
    dateKey,
    date,
    time,
    isTodayVn,
    dateTimeLabel,
  };
}

export function isScheduleDueNow(
  schedule: {
    status?: ScheduleStatus | string;
    nextScheduledAt?: string | null;
    isOverdue?: boolean;
  },
  nowMs: number = Date.now()
): boolean {
  if (schedule.status !== 'ACTIVE') {
    return false;
  }
  if (schedule.isOverdue === true) {
    return true;
  }
  if (typeof schedule.nextScheduledAt !== 'string' || !schedule.nextScheduledAt.trim()) {
    return false;
  }
  const parsedMs = Date.parse(schedule.nextScheduledAt);
  if (!Number.isFinite(parsedMs)) {
    return false;
  }
  return parsedMs <= nowMs;
}

export function normalizeSchedulePageParam(page?: number): number {
  if (typeof page !== 'number' || !Number.isFinite(page)) {
    return DEFAULT_SCHEDULE_PAGE;
  }
  return Math.max(0, Math.trunc(page));
}

export function normalizeScheduleSizeParam(size?: number): number {
  if (typeof size !== 'number' || !Number.isFinite(size)) {
    return DEFAULT_SCHEDULE_SIZE;
  }
  return Math.min(MAX_SCHEDULE_SIZE, Math.max(MIN_SCHEDULE_SIZE, Math.trunc(size)));
}

export function normalizeScheduleStatusFilter(
  status?: ScheduleStatus | string
): ScheduleStatus | undefined {
  if (typeof status !== 'string') {
    return undefined;
  }
  const clean = status.trim();
  if (!clean || !VALID_SCHEDULE_STATUSES.has(clean as ScheduleStatus)) {
    return undefined;
  }
  return clean as ScheduleStatus;
}

export function normalizePlantScheduleListParams(
  params?: PlantScheduleListParams
): PlantScheduleListQueryKeyParams {
  const status = normalizeScheduleStatusFilter(params?.status);
  return {
    ...(status ? { status } : {}),
    page: normalizeSchedulePageParam(params?.page),
    size: normalizeScheduleSizeParam(params?.size),
  };
}

export function assertValidScheduleId(scheduleId: string): string {
  const cleanId = typeof scheduleId === 'string' ? scheduleId.trim() : '';
  if (!cleanId) {
    throw new AppApiError({
      message: 'Mã lịch chăm sóc không hợp lệ.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'scheduleId',
    });
  }
  return cleanId;
}

export function assertValidSchedulePlantId(plantId: string): string {
  const cleanId = typeof plantId === 'string' ? plantId.trim() : '';
  if (!cleanId) {
    throw new AppApiError({
      message: 'Vui lòng chọn cây trồng thực tế trước khi lập lịch.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'userPlantId',
    });
  }
  return cleanId;
}

export function validateTaskType(taskType: TaskType | string | undefined | null): TaskType {
  if (typeof taskType !== 'string' || !VALID_TASK_TYPES.has(taskType as TaskType)) {
    throw new AppApiError({
      message: 'Loại công việc chăm sóc không hợp lệ.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'taskType',
    });
  }
  return taskType as TaskType;
}

export function validateFrequency(frequency: Frequency | string | undefined | null): Frequency {
  if (typeof frequency !== 'string' || !VALID_FREQUENCIES.has(frequency as Frequency)) {
    throw new AppApiError({
      message: 'Tần suất lặp không hợp lệ.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'frequency',
    });
  }
  return frequency as Frequency;
}

export function validateScheduleStatus(
  status: ScheduleStatus | string | undefined | null
): ScheduleStatus {
  if (typeof status !== 'string' || !VALID_SCHEDULE_STATUSES.has(status as ScheduleStatus)) {
    throw new AppApiError({
      message: 'Trạng thái lịch chăm sóc không hợp lệ.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'status',
    });
  }
  return status as ScheduleStatus;
}

export function validateTaskLabel(taskLabel?: string | null): string | null {
  if (taskLabel === undefined || taskLabel === null) {
    return null;
  }
  const clean = typeof taskLabel === 'string' ? taskLabel.trim() : '';
  if (!clean) {
    return null;
  }
  if (clean.length > TASK_LABEL_MAX_LENGTH) {
    throw new AppApiError({
      message: `Nhãn công việc tối đa ${TASK_LABEL_MAX_LENGTH} ký tự.`,
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'taskLabel',
    });
  }
  return clean;
}

export function validateIntervalDays(
  frequency: Frequency,
  intervalDays?: number | null
): number | null {
  if (frequency === 'CUSTOM') {
    if (
      typeof intervalDays !== 'number' ||
      !Number.isFinite(intervalDays) ||
      !Number.isInteger(intervalDays) ||
      intervalDays <= 0
    ) {
      throw new AppApiError({
        message: 'Chu kỳ tùy chỉnh bắt buộc phải có khoảng cách ngày là số nguyên lớn hơn 0.',
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        field: 'intervalDays',
      });
    }
    return intervalDays;
  }

  if (intervalDays !== undefined && intervalDays !== null) {
    throw new AppApiError({
      message: 'Khoảng cách ngày (intervalDays) chỉ áp dụng cho chu kỳ tùy chỉnh (CUSTOM).',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'intervalDays',
    });
  }

  return null;
}

export function validateReminderTime(
  reminderTime?: string | null
): string | null | undefined {
  if (reminderTime === undefined) {
    return undefined;
  }
  if (reminderTime === null) {
    return null;
  }
  const clean = typeof reminderTime === 'string' ? reminderTime.trim() : '';
  if (!clean) {
    throw new AppApiError({
      message: 'Giờ nhắc không được để trống (chọn đặt lại mặc định nếu muốn dùng 08:00:00).',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'reminderTime',
    });
  }
  const match = LOCAL_TIME_PATTERN.exec(clean);
  if (!match) {
    throw new AppApiError({
      message: 'Giờ nhắc phải theo định dạng HH:mm hoặc HH:mm:ss (ví dụ: 08:00:00).',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'reminderTime',
    });
  }
  const hh = match[1];
  const mm = match[2];
  const ss = match[3] ?? '00';
  return `${hh}:${mm}:${ss}`;
}

export function validateLocalDateString(
  value: string,
  field: 'startDate' | 'endDate',
  label: string
): string {
  const clean = typeof value === 'string' ? value.trim() : '';
  const match = ISO_LOCAL_DATE_PATTERN.exec(clean);
  if (!match) {
    throw new AppApiError({
      message: `${label} phải theo định dạng YYYY-MM-DD (ví dụ: 2026-11-11).`,
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field,
    });
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new AppApiError({
      message: `${label} không tồn tại trên lịch. Vui lòng kiểm tra lại.`,
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field,
    });
  }
  return clean;
}

export function validateCreateStartDate(
  startDate: string,
  todayVn: string = getTodayVnDateString()
): string {
  const clean = typeof startDate === 'string' ? startDate.trim() : '';
  if (!clean) {
    throw new AppApiError({
      message: 'Vui lòng chọn ngày bắt đầu lịch chăm sóc.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'startDate',
    });
  }
  const validDate = validateLocalDateString(clean, 'startDate', 'Ngày bắt đầu');
  if (validDate < todayVn) {
    throw new AppApiError({
      message: 'Ngày bắt đầu không được trong quá khứ (theo ngày Việt Nam).',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'startDate',
    });
  }
  return validDate;
}

export function validateEndDateValue(
  endDate: string | null | undefined,
  effectiveStartDate?: string
): string | null | undefined {
  if (endDate === undefined) {
    return undefined;
  }
  if (endDate === null) {
    return null;
  }
  const clean = typeof endDate === 'string' ? endDate.trim() : '';
  if (!clean) {
    throw new AppApiError({
      message: 'Ngày kết thúc không được để trống (truyền null nếu muốn xóa thời hạn).',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'endDate',
    });
  }
  const validEnd = validateLocalDateString(clean, 'endDate', 'Ngày kết thúc');
  if (effectiveStartDate && validEnd < effectiveStartDate) {
    throw new AppApiError({
      message: 'Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'endDate',
    });
  }
  return validEnd;
}

export function buildCreateSchedulePayload(
  request: CreateScheduleRequestDto,
  todayVn: string = getTodayVnDateString()
): CreateScheduleRequestDto {
  const userPlantId = assertValidSchedulePlantId(request.userPlantId);
  const taskType = validateTaskType(request.taskType);
  const frequency = validateFrequency(request.frequency);
  const intervalDays = validateIntervalDays(frequency, request.intervalDays);
  const taskLabel = validateTaskLabel(request.taskLabel);
  const startDate = validateCreateStartDate(request.startDate, todayVn);
  const endDate = validateEndDateValue(request.endDate, startDate);
  const reminderTime = validateReminderTime(request.reminderTime);

  return {
    userPlantId,
    taskType,
    ...(taskLabel !== null ? { taskLabel } : {}),
    frequency,
    intervalDays,
    ...(reminderTime !== undefined ? { reminderTime } : {}),
    startDate,
    ...(endDate !== undefined && endDate !== null ? { endDate } : {}),
  };
}

export function buildUpdateSchedulePayload(
  request: UpdateScheduleRequestDto
): UpdateScheduleRequestDto {
  const hasKey = (key: keyof UpdateScheduleRequestDto) =>
    Object.prototype.hasOwnProperty.call(request, key) && request[key] !== undefined;

  const payload: UpdateScheduleRequestDto = {};

  if (hasKey('taskType')) {
    payload.taskType = validateTaskType(request.taskType);
  }

  if (hasKey('taskLabel')) {
    payload.taskLabel = validateTaskLabel(request.taskLabel);
  }

  if (hasKey('reminderTime')) {
    payload.reminderTime = validateReminderTime(request.reminderTime);
  }

  if (hasKey('frequency')) {
    const validFrequency = validateFrequency(request.frequency);
    payload.frequency = validFrequency;
    if (validFrequency === 'CUSTOM') {
      payload.intervalDays = validateIntervalDays(validFrequency, request.intervalDays);
    } else {
      if (hasKey('intervalDays')) {
        validateIntervalDays(validFrequency, request.intervalDays);
      }
      payload.intervalDays = null;
    }
  } else if (hasKey('intervalDays')) {
    if (request.intervalDays === null) {
      payload.intervalDays = null;
    } else {
      payload.intervalDays = validateIntervalDays('CUSTOM', request.intervalDays);
    }
  }

  if (hasKey('startDate')) {
    if (request.startDate === null || typeof request.startDate !== 'string' || !request.startDate.trim()) {
      throw new AppApiError({
        message: 'Ngày bắt đầu không được để trống.',
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        field: 'startDate',
      });
    }
    payload.startDate = validateLocalDateString(
      request.startDate,
      'startDate',
      'Ngày bắt đầu'
    );
  }

  if (hasKey('endDate')) {
    payload.endDate = validateEndDateValue(request.endDate, payload.startDate);
  }

  if (hasKey('status')) {
    payload.status = validateScheduleStatus(request.status);
  }

  return payload;
}

function normalizeTaskTypeValue(value: TaskType | string | undefined): TaskType {
  return typeof value === 'string' && VALID_TASK_TYPES.has(value as TaskType)
    ? (value as TaskType)
    : 'WATERING';
}

function normalizeFrequencyValue(value: Frequency | string | undefined): Frequency {
  return typeof value === 'string' && VALID_FREQUENCIES.has(value as Frequency)
    ? (value as Frequency)
    : 'DAILY';
}

function normalizeStatusValue(value: ScheduleStatus | string | undefined): ScheduleStatus {
  return typeof value === 'string' && VALID_SCHEDULE_STATUSES.has(value as ScheduleStatus)
    ? (value as ScheduleStatus)
    : 'ACTIVE';
}

function normalizeTodayScheduleItem(raw: TodayScheduleItemDto): TodayScheduleItemDto {
  return {
    scheduleId: raw.scheduleId,
    plantId: raw.plantId,
    plantName: raw.plantName,
    gardenName: raw.gardenName ?? null,
    taskType: normalizeTaskTypeValue(raw.taskType),
    taskLabel: raw.taskLabel ?? null,
    nextScheduledAt: raw.nextScheduledAt,
    isOverdue: Boolean(raw.isOverdue),
    status: normalizeStatusValue(raw.status),
  };
}

function normalizeCareSchedule(raw: CareScheduleDto): CareScheduleDto {
  return {
    id: raw.id,
    userPlantId: raw.userPlantId,
    plantName: raw.plantName,
    taskType: normalizeTaskTypeValue(raw.taskType),
    taskLabel: raw.taskLabel ?? null,
    frequency: normalizeFrequencyValue(raw.frequency),
    intervalDays: raw.intervalDays ?? null,
    reminderTime: raw.reminderTime ?? null,
    startDate: raw.startDate,
    endDate: raw.endDate ?? null,
    nextScheduledAt: raw.nextScheduledAt,
    isOverdue: Boolean(raw.isOverdue),
    status: normalizeStatusValue(raw.status),
  };
}

function normalizePlantSchedulesPage(
  rawPage: PageResponse<CareScheduleDto> | undefined,
  fallbackPage: number,
  fallbackSize: number
): PageResponse<CareScheduleDto> {
  if (!rawPage || !Array.isArray(rawPage.content)) {
    throw new AppApiError({
      message: 'Dữ liệu danh sách lịch chăm sóc không hợp lệ.',
      code: 'INVALID_RESPONSE',
    });
  }
  return {
    content: rawPage.content.map(normalizeCareSchedule),
    page: typeof rawPage.page === 'number' ? rawPage.page : fallbackPage,
    size: typeof rawPage.size === 'number' ? rawPage.size : fallbackSize,
    totalElements:
      typeof rawPage.totalElements === 'number' ? rawPage.totalElements : rawPage.content.length,
    totalPages: typeof rawPage.totalPages === 'number' ? rawPage.totalPages : 1,
    last: Boolean(rawPage.last),
  };
}

function buildScopeConfig(scope?: ApiUserScopeOptions): ApiUserScopeOptions {
  if (!scope) {
    return {};
  }
  return {
    ...(scope.expectedUserId !== undefined ? { expectedUserId: scope.expectedUserId } : {}),
    ...(scope.expectedSessionGeneration !== undefined
      ? { expectedSessionGeneration: scope.expectedSessionGeneration }
      : {}),
  };
}

export async function getTodaySchedules(
  scope?: ApiUserScopeOptions
): Promise<TodayScheduleItemDto[]> {
  const response = await apiClient.get<ApiResponse<TodayScheduleItemDto[]>>(
    '/schedules/today',
    buildScopeConfig(scope)
  );
  const rawList = response.data?.data;
  if (!Array.isArray(rawList)) {
    throw new AppApiError({
      message: 'Dữ liệu lịch chăm sóc hôm nay không hợp lệ.',
      code: 'INVALID_RESPONSE',
    });
  }
  return rawList.map(normalizeTodayScheduleItem);
}

export async function getPlantSchedules(
  plantId: string,
  params?: PlantScheduleListParams,
  scope?: ApiUserScopeOptions
): Promise<PageResponse<CareScheduleDto>> {
  const cleanPlantId = typeof plantId === 'string' ? plantId.trim() : '';
  if (!cleanPlantId) {
    throw new AppApiError({
      message: 'Mã cây trồng không hợp lệ.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'plantId',
    });
  }

  const normalized = normalizePlantScheduleListParams(params);
  const queryParams: Record<string, string | number> = {
    page: normalized.page,
    size: normalized.size,
  };
  if (normalized.status) {
    queryParams.status = normalized.status;
  }

  const response = await apiClient.get<ApiResponse<PageResponse<CareScheduleDto>>>(
    `/plants/${encodeURIComponent(cleanPlantId)}/schedules`,
    {
      params: queryParams,
      ...buildScopeConfig(scope),
    }
  );

  return normalizePlantSchedulesPage(response.data?.data, normalized.page, normalized.size);
}

export async function createSchedule(
  request: CreateScheduleRequestDto,
  scope?: ApiUserScopeOptions
): Promise<CareScheduleDto> {
  const payload = buildCreateSchedulePayload(request);
  const response = await apiClient.post<ApiResponse<CareScheduleDto>>(
    '/schedules',
    payload,
    buildScopeConfig(scope)
  );
  if (!response.data?.data) {
    throw new AppApiError({
      message: 'Không thể tạo lịch chăm sóc mới.',
      code: 'INVALID_RESPONSE',
    });
  }
  return normalizeCareSchedule(response.data.data);
}

export async function updateSchedule(
  scheduleId: string,
  request: UpdateScheduleRequestDto,
  scope?: ApiUserScopeOptions
): Promise<CareScheduleDto> {
  const cleanScheduleId = assertValidScheduleId(scheduleId);
  const payload = buildUpdateSchedulePayload(request);
  const response = await apiClient.put<ApiResponse<CareScheduleDto>>(
    `/schedules/${encodeURIComponent(cleanScheduleId)}`,
    payload,
    buildScopeConfig(scope)
  );
  if (!response.data?.data) {
    throw new AppApiError({
      message: 'Không thể cập nhật lịch chăm sóc.',
      code: 'INVALID_RESPONSE',
    });
  }
  return normalizeCareSchedule(response.data.data);
}

export async function deleteSchedule(
  scheduleId: string,
  scope?: ApiUserScopeOptions
): Promise<SimpleMessageResponseDto> {
  const cleanScheduleId = assertValidScheduleId(scheduleId);
  const response = await apiClient.delete<ApiResponse<SimpleMessageResponseDto>>(
    `/schedules/${encodeURIComponent(cleanScheduleId)}`,
    buildScopeConfig(scope)
  );
  if (!response.data?.data) {
    return { message: response.data?.message || 'Lịch chăm sóc đã được xóa.' };
  }
  return response.data.data;
}

export async function completeSchedule(
  scheduleId: string,
  request?: CompleteScheduleRequestDto,
  scope?: ApiUserScopeOptions
): Promise<CompleteScheduleResponseDto> {
  const cleanScheduleId = assertValidScheduleId(scheduleId);
  const cleanNote = typeof request?.note === 'string' ? request.note.trim() : '';
  const cleanImages = Array.isArray(request?.imageUrls)
    ? request.imageUrls.filter((u) => typeof u === 'string' && u.trim().length > 0)
    : undefined;
  const cleanPerformedAt =
    typeof request?.performedAt === 'string' && request.performedAt.trim()
      ? request.performedAt.trim()
      : undefined;

  const hasBody =
    Boolean(cleanNote) ||
    (cleanImages !== undefined && cleanImages.length > 0) ||
    Boolean(cleanPerformedAt);

  const payload: CompleteScheduleRequestDto = hasBody
    ? {
        ...(cleanNote ? { note: cleanNote } : {}),
        ...(cleanImages && cleanImages.length > 0 ? { imageUrls: cleanImages } : {}),
        ...(cleanPerformedAt ? { performedAt: cleanPerformedAt } : {}),
      }
    : {};

  const response = await apiClient.post<ApiResponse<CompleteScheduleResponseDto>>(
    `/schedules/${encodeURIComponent(cleanScheduleId)}/complete`,
    payload,
    buildScopeConfig(scope)
  );
  const data = response.data?.data;
  if (!data || !data.careLogId || !data.scheduleStatus) {
    throw new AppApiError({
      message: 'Dữ liệu phản hồi hoàn thành lịch không hợp lệ.',
      code: 'INVALID_RESPONSE',
    });
  }
  return {
    careLogId: data.careLogId,
    scheduleStatus: normalizeStatusValue(data.scheduleStatus),
    nextScheduledAt: data.nextScheduledAt ?? null,
  };
}

export async function skipSchedule(
  scheduleId: string,
  request?: SkipScheduleRequestDto,
  scope?: ApiUserScopeOptions
): Promise<CompleteScheduleResponseDto> {
  const cleanScheduleId = assertValidScheduleId(scheduleId);
  const cleanNote = typeof request?.note === 'string' ? request.note.trim() : '';
  const payload: SkipScheduleRequestDto = cleanNote ? { note: cleanNote } : {};

  const response = await apiClient.post<ApiResponse<CompleteScheduleResponseDto>>(
    `/schedules/${encodeURIComponent(cleanScheduleId)}/skip`,
    payload,
    buildScopeConfig(scope)
  );
  const data = response.data?.data;
  if (!data || !data.careLogId || !data.scheduleStatus) {
    throw new AppApiError({
      message: 'Dữ liệu phản hồi bỏ qua lịch không hợp lệ.',
      code: 'INVALID_RESPONSE',
    });
  }
  return {
    careLogId: data.careLogId,
    scheduleStatus: normalizeStatusValue(data.scheduleStatus),
    nextScheduledAt: data.nextScheduledAt ?? null,
  };
}
