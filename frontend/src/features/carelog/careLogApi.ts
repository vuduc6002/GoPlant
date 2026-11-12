import { apiClient, type ApiUserScopeOptions } from '@/services/api/apiClient';
import { AppApiError } from '@/services/api/apiError';
import type { ApiResponse, PageResponse } from '@/services/api/apiTypes';
import type { PlantCareLogListQueryKeyParams } from '@/services/query/queryKeys';
import type {
  CareLogDto,
  CareLogStatus,
  CreateCareLogRequestDto,
  PlantCareLogListParams,
  TaskType,
} from './careLogTypes';

export const DEFAULT_CARE_LOG_PAGE = 0;
export const DEFAULT_CARE_LOG_SIZE = 20;
export const MIN_CARE_LOG_SIZE = 1;
export const MAX_CARE_LOG_SIZE = 100;
export const CARE_VN_TIMEZONE = 'Asia/Ho_Chi_Minh';

const VALID_TASK_TYPES = new Set<TaskType>([
  'WATERING',
  'FERTILIZING',
  'PRUNING',
  'PEST_CHECK',
  'MISTING',
  'JOURNAL',
]);

const VALID_CARE_LOG_STATUSES = new Set<CareLogStatus>(['COMPLETED', 'SKIPPED']);

const OFFSET_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(\.\d{1,9})?)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

const VN_UI_LOCAL_DATETIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2}) ([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

interface VnDateTimeParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

function getVnDateTimeParts(date: Date): VnDateTimeParts {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: CARE_VN_TIMEZONE,
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

function isValidCalendarYmd(year: number, month: number, day: number): boolean {
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
}

export function formatIsoDateTimeVn(
  isoUtc?: string | null,
  fallback: string = 'Chưa xác định'
): string {
  if (typeof isoUtc !== 'string' || !isoUtc.trim()) {
    return fallback;
  }
  const clean = isoUtc.trim();
  const ms = Date.parse(clean);
  if (!Number.isFinite(ms)) {
    return clean;
  }
  const parts = getVnDateTimeParts(new Date(ms));
  return `${parts.hour}:${parts.minute} • ${parts.day}/${parts.month}/${parts.year} (VN)`;
}

export function formatIsoToVnInputValue(isoUtc?: string | null): string {
  if (typeof isoUtc !== 'string' || !isoUtc.trim()) {
    return '';
  }
  const ms = Date.parse(isoUtc.trim());
  if (!Number.isFinite(ms)) {
    return '';
  }
  const parts = getVnDateTimeParts(new Date(ms));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function validateOptionalOffsetDateTime(
  value: string | undefined | null,
  field: string,
  label: string
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new AppApiError({
      message: `${label} không đúng định dạng thời gian ISO có múi giờ.`,
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field,
    });
  }
  const clean = value.trim();
  if (!clean) {
    return undefined;
  }

  const match = OFFSET_DATE_TIME_PATTERN.exec(clean);
  if (!match) {
    throw new AppApiError({
      message: `${label} bắt buộc phải có múi giờ hợp lệ (ví dụ: 2026-11-12T09:15:00+07:00 hoặc ...Z).`,
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field,
    });
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidCalendarYmd(year, month, day) || !Number.isFinite(Date.parse(clean))) {
    throw new AppApiError({
      message: `${label} không tồn tại trên lịch hoặc thời gian không hợp lệ.`,
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field,
    });
  }

  const hh = match[4];
  const min = match[5];
  const ss = match[6] ?? '00';
  const frac = match[7] ?? '';
  const tz = match[8];
  return `${match[1]}-${match[2]}-${match[3]}T${hh}:${min}:${ss}${frac}${tz}`;
}

export function parseUiDateTimeInputToOffsetIso(
  rawInput: string | undefined | null,
  field: string,
  label: string
): string | undefined {
  if (rawInput === undefined || rawInput === null) {
    return undefined;
  }
  const clean = typeof rawInput === 'string' ? rawInput.trim() : '';
  if (!clean) {
    return undefined;
  }

  const vnLocalMatch = VN_UI_LOCAL_DATETIME_PATTERN.exec(clean);
  if (vnLocalMatch) {
    const year = Number(vnLocalMatch[1]);
    const month = Number(vnLocalMatch[2]);
    const day = Number(vnLocalMatch[3]);
    if (!isValidCalendarYmd(year, month, day)) {
      throw new AppApiError({
        message: `${label} không tồn tại trên lịch. Vui lòng kiểm tra lại.`,
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        field,
      });
    }
    const ss = vnLocalMatch[6] ?? '00';
    return `${vnLocalMatch[1]}-${vnLocalMatch[2]}-${vnLocalMatch[3]}T${vnLocalMatch[4]}:${vnLocalMatch[5]}:${ss}+07:00`;
  }

  return validateOptionalOffsetDateTime(clean, field, label);
}

export function isValidHttpImageUrl(url: unknown): url is string {
  if (typeof url !== 'string') {
    return false;
  }
  const clean = url.trim();
  if (!clean) {
    return false;
  }
  try {
    const parsed = new URL(clean);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      Boolean(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function sanitizeImageUrls(
  urls: readonly string[] | null | undefined,
  options?: { strictValidation?: boolean }
): string[] {
  if (!Array.isArray(urls)) {
    return [];
  }
  const result: string[] = [];
  for (const item of urls) {
    if (typeof item !== 'string') {
      if (options?.strictValidation) {
        throw new AppApiError({
          message: 'Danh sách đường dẫn ảnh phải là chuỗi URL http/https hợp lệ.',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          field: 'imageUrls',
        });
      }
      continue;
    }
    const clean = item.trim();
    if (!clean) {
      continue;
    }
    if (!isValidHttpImageUrl(clean)) {
      if (options?.strictValidation) {
        throw new AppApiError({
          message:
            'Đường dẫn ảnh không hợp lệ (chỉ chấp nhận URL http/https, không hỗ trợ URI cục bộ file:// hoặc content://).',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          field: 'imageUrls',
        });
      }
      continue;
    }
    result.push(clean);
  }
  return result;
}

export function normalizeCareLogPageParam(page?: number): number {
  if (typeof page !== 'number' || !Number.isFinite(page)) {
    return DEFAULT_CARE_LOG_PAGE;
  }
  return Math.max(0, Math.trunc(page));
}

export function normalizeCareLogSizeParam(size?: number): number {
  if (typeof size !== 'number' || !Number.isFinite(size)) {
    return DEFAULT_CARE_LOG_SIZE;
  }
  return Math.min(MAX_CARE_LOG_SIZE, Math.max(MIN_CARE_LOG_SIZE, Math.trunc(size)));
}

export function normalizePlantCareLogListParams(
  params?: PlantCareLogListParams
): PlantCareLogListQueryKeyParams {
  return {
    page: normalizeCareLogPageParam(params?.page),
    size: normalizeCareLogSizeParam(params?.size),
  };
}

export function assertValidCarePlantId(plantId: string): string {
  const cleanId = typeof plantId === 'string' ? plantId.trim() : '';
  if (!cleanId || cleanId.includes('/') || cleanId.includes('..')) {
    throw new AppApiError({
      message: 'Vui lòng chọn cây trồng thực tế trước khi ghi nhận chăm sóc.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'userPlantId',
    });
  }
  return cleanId;
}

export function validateCareTaskType(taskType: TaskType | string | undefined | null): TaskType {
  if (typeof taskType !== 'string' || !VALID_TASK_TYPES.has(taskType as TaskType)) {
    throw new AppApiError({
      message: 'Loại thao tác chăm sóc không hợp lệ.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'taskType',
    });
  }
  return taskType as TaskType;
}

export function buildCreateCareLogPayload(
  request: CreateCareLogRequestDto
): CreateCareLogRequestDto {
  const userPlantId = assertValidCarePlantId(request.userPlantId);
  const taskType = validateCareTaskType(request.taskType);
  const cleanNote = typeof request.note === 'string' ? request.note.trim() : '';
  const performedAt = validateOptionalOffsetDateTime(
    request.performedAt,
    'performedAt',
    'Thời điểm thực hiện'
  );
  const validImageUrls =
    request.imageUrls !== undefined
      ? sanitizeImageUrls(request.imageUrls, { strictValidation: true })
      : [];

  return {
    userPlantId,
    taskType,
    ...(cleanNote ? { note: cleanNote } : {}),
    ...(validImageUrls.length > 0 ? { imageUrls: validImageUrls } : {}),
    ...(performedAt !== undefined ? { performedAt } : {}),
  };
}

function normalizeTaskTypeValue(value: TaskType | string | undefined): TaskType {
  return typeof value === 'string' && VALID_TASK_TYPES.has(value as TaskType)
    ? (value as TaskType)
    : 'WATERING';
}

function normalizeCareLogStatusValue(value: CareLogStatus | string | undefined): CareLogStatus {
  return typeof value === 'string' && VALID_CARE_LOG_STATUSES.has(value as CareLogStatus)
    ? (value as CareLogStatus)
    : 'COMPLETED';
}

function normalizeCareLog(raw: CareLogDto): CareLogDto {
  return {
    id: raw.id,
    userPlantId: raw.userPlantId,
    taskType: normalizeTaskTypeValue(raw.taskType),
    status: normalizeCareLogStatusValue(raw.status),
    note: typeof raw.note === 'string' && raw.note.trim() ? raw.note : null,
    imageUrls: sanitizeImageUrls(raw.imageUrls, { strictValidation: false }),
    performedAt: raw.performedAt,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : null,
  };
}

function normalizePlantCareLogsPage(
  rawPage: PageResponse<CareLogDto> | undefined,
  fallbackPage: number,
  fallbackSize: number
): PageResponse<CareLogDto> {
  if (!rawPage || !Array.isArray(rawPage.content)) {
    throw new AppApiError({
      message: 'Dữ liệu lịch sử chăm sóc không hợp lệ.',
      code: 'INVALID_RESPONSE',
    });
  }
  return {
    content: rawPage.content.map(normalizeCareLog),
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

export async function getPlantCareLogs(
  plantId: string,
  params?: PlantCareLogListParams,
  scope?: ApiUserScopeOptions
): Promise<PageResponse<CareLogDto>> {
  const cleanPlantId = assertValidCarePlantId(plantId);
  const normalized = normalizePlantCareLogListParams(params);

  const response = await apiClient.get<ApiResponse<PageResponse<CareLogDto>>>(
    `/plants/${encodeURIComponent(cleanPlantId)}/care-logs`,
    {
      params: {
        page: normalized.page,
        size: normalized.size,
      },
      ...buildScopeConfig(scope),
    }
  );

  return normalizePlantCareLogsPage(response.data?.data, normalized.page, normalized.size);
}

export async function createCareLog(
  request: CreateCareLogRequestDto,
  scope?: ApiUserScopeOptions
): Promise<CareLogDto> {
  const payload = buildCreateCareLogPayload(request);
  const response = await apiClient.post<ApiResponse<CareLogDto>>(
    '/care-logs',
    payload,
    buildScopeConfig(scope)
  );
  if (!response.data?.data) {
    throw new AppApiError({
      message: 'Không thể lưu ghi nhận chăm sóc mới.',
      code: 'INVALID_RESPONSE',
    });
  }
  return normalizeCareLog(response.data.data);
}
