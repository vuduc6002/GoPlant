import {
  sanitizeImageUrls,
  validateOptionalOffsetDateTime,
} from '@/features/carelog/careLogApi';
import { apiClient, type ApiUserScopeOptions } from '@/services/api/apiClient';
import { AppApiError } from '@/services/api/apiError';
import type {
  ApiResponse,
  PageResponse,
  SimpleMessageResponseDto,
} from '@/services/api/apiTypes';
import type { PlantJournalListQueryKeyParams } from '@/services/query/queryKeys';
import type {
  CreateGrowthJournalRequestDto,
  EntryType,
  GrowthJournalDto,
  JournalHealthStatus,
  PlantJournalListParams,
  UpdateGrowthJournalRequestDto,
} from './journalTypes';

export const DEFAULT_JOURNAL_PAGE = 0;
export const DEFAULT_JOURNAL_SIZE = 20;
export const MIN_JOURNAL_SIZE = 1;
export const MAX_JOURNAL_SIZE = 100;

const MAX_JOURNAL_SCAN_PAGES = 50;

const VALID_ENTRY_TYPES = new Set<EntryType>([
  'GROWTH',
  'WATERING',
  'FERTILIZING',
  'PEST',
  'OTHER',
]);

const VALID_JOURNAL_HEALTH_STATUSES = new Set<JournalHealthStatus>([
  'HEALTHY',
  'NEEDS_ATTENTION',
  'CRITICAL',
]);

export function normalizeJournalPageParam(page?: number): number {
  if (typeof page !== 'number' || !Number.isFinite(page)) {
    return DEFAULT_JOURNAL_PAGE;
  }
  return Math.max(0, Math.trunc(page));
}

export function normalizeJournalSizeParam(size?: number): number {
  if (typeof size !== 'number' || !Number.isFinite(size)) {
    return DEFAULT_JOURNAL_SIZE;
  }
  return Math.min(MAX_JOURNAL_SIZE, Math.max(MIN_JOURNAL_SIZE, Math.trunc(size)));
}

export function normalizePlantJournalListParams(
  params?: PlantJournalListParams
): PlantJournalListQueryKeyParams {
  return {
    page: normalizeJournalPageParam(params?.page),
    size: normalizeJournalSizeParam(params?.size),
  };
}

export function assertValidJournalId(journalId: string): string {
  const cleanId = typeof journalId === 'string' ? journalId.trim() : '';
  if (!cleanId || cleanId.includes('/') || cleanId.includes('..')) {
    throw new AppApiError({
      message: 'Mã nhật ký phát triển không hợp lệ.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'journalId',
    });
  }
  return cleanId;
}

export function assertValidJournalPlantId(plantId: string): string {
  const cleanId = typeof plantId === 'string' ? plantId.trim() : '';
  if (!cleanId || cleanId.includes('/') || cleanId.includes('..')) {
    throw new AppApiError({
      message: 'Vui lòng chọn cây trồng thực tế cho nhật ký phát triển.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'userPlantId',
    });
  }
  return cleanId;
}

export function validateEntryType(entryType: EntryType | string | undefined | null): EntryType {
  if (typeof entryType !== 'string' || !VALID_ENTRY_TYPES.has(entryType as EntryType)) {
    throw new AppApiError({
      message: 'Loại ghi nhận nhật ký không hợp lệ.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'entryType',
    });
  }
  return entryType as EntryType;
}

export function validateJournalHealthStatus(
  healthStatus: JournalHealthStatus | string | undefined | null
): JournalHealthStatus {
  if (
    typeof healthStatus !== 'string' ||
    !VALID_JOURNAL_HEALTH_STATUSES.has(healthStatus as JournalHealthStatus)
  ) {
    throw new AppApiError({
      message:
        'Tình trạng sức khỏe nhật ký chỉ chấp nhận HEALTHY, NEEDS_ATTENTION hoặc CRITICAL.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'healthStatus',
    });
  }
  return healthStatus as JournalHealthStatus;
}

export function validateJournalNote(note: string | undefined | null): string {
  const clean = typeof note === 'string' ? note.trim() : '';
  if (!clean) {
    throw new AppApiError({
      message: 'Ghi chú nhật ký không được để trống.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'note',
    });
  }
  return clean;
}

export function buildCreateJournalPayload(
  request: CreateGrowthJournalRequestDto
): CreateGrowthJournalRequestDto {
  const userPlantId = assertValidJournalPlantId(request.userPlantId);
  const entryType =
    request.entryType !== undefined ? validateEntryType(request.entryType) : 'GROWTH';
  const healthStatus =
    request.healthStatus !== undefined
      ? validateJournalHealthStatus(request.healthStatus)
      : 'HEALTHY';
  const note = validateJournalNote(request.note);
  const recordedAt = validateOptionalOffsetDateTime(
    request.recordedAt,
    'recordedAt',
    'Thời điểm ghi nhận'
  );
  const validImageUrls =
    request.imageUrls !== undefined
      ? sanitizeImageUrls(request.imageUrls, { strictValidation: true })
      : [];

  return {
    userPlantId,
    entryType,
    healthStatus,
    note,
    ...(validImageUrls.length > 0 ? { imageUrls: validImageUrls } : {}),
    ...(recordedAt !== undefined ? { recordedAt } : {}),
  };
}

export function buildUpdateJournalPayload(
  request: UpdateGrowthJournalRequestDto
): UpdateGrowthJournalRequestDto {
  const hasKey = (key: keyof UpdateGrowthJournalRequestDto) =>
    Object.prototype.hasOwnProperty.call(request, key);

  const payload: UpdateGrowthJournalRequestDto = {};

  if (hasKey('entryType') && request.entryType !== undefined && request.entryType !== null) {
    payload.entryType = validateEntryType(request.entryType);
  }

  if (
    hasKey('healthStatus') &&
    request.healthStatus !== undefined &&
    request.healthStatus !== null
  ) {
    payload.healthStatus = validateJournalHealthStatus(request.healthStatus);
  }

  if (hasKey('note') && request.note !== undefined) {
    payload.note = validateJournalNote(request.note);
  }

  if (hasKey('imageUrls') && request.imageUrls !== undefined && request.imageUrls !== null) {
    payload.imageUrls = sanitizeImageUrls(request.imageUrls, { strictValidation: true });
  }

  if (hasKey('recordedAt') && request.recordedAt !== undefined && request.recordedAt !== null) {
    const cleanRaw = typeof request.recordedAt === 'string' ? request.recordedAt.trim() : null;
    if (cleanRaw === null) {
      throw new AppApiError({
        message: 'Thời điểm ghi nhận không đúng định dạng thời gian ISO có múi giờ.',
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        field: 'recordedAt',
      });
    }
    if (cleanRaw.length > 0) {
      payload.recordedAt = validateOptionalOffsetDateTime(
        cleanRaw,
        'recordedAt',
        'Thời điểm ghi nhận'
      );
    }
  }

  return payload;
}

function normalizeEntryTypeValue(value: EntryType | string | undefined): EntryType {
  return typeof value === 'string' && VALID_ENTRY_TYPES.has(value as EntryType)
    ? (value as EntryType)
    : 'GROWTH';
}

function normalizeHealthStatusValue(
  value: JournalHealthStatus | string | undefined
): JournalHealthStatus {
  return typeof value === 'string' &&
    VALID_JOURNAL_HEALTH_STATUSES.has(value as JournalHealthStatus)
    ? (value as JournalHealthStatus)
    : 'HEALTHY';
}

function normalizeGrowthJournal(raw: GrowthJournalDto): GrowthJournalDto {
  return {
    id: raw.id,
    userPlantId: raw.userPlantId,
    entryType: normalizeEntryTypeValue(raw.entryType),
    healthStatus: normalizeHealthStatusValue(raw.healthStatus),
    note: typeof raw.note === 'string' ? raw.note : '',
    imageUrls: sanitizeImageUrls(raw.imageUrls, { strictValidation: false }),
    recordedAt: raw.recordedAt,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : null,
  };
}

function normalizePlantJournalsPage(
  rawPage: PageResponse<GrowthJournalDto> | undefined,
  fallbackPage: number,
  fallbackSize: number
): PageResponse<GrowthJournalDto> {
  if (!rawPage || !Array.isArray(rawPage.content)) {
    throw new AppApiError({
      message: 'Dữ liệu nhật ký phát triển không hợp lệ.',
      code: 'INVALID_RESPONSE',
    });
  }
  return {
    content: rawPage.content.map(normalizeGrowthJournal),
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

export async function getPlantJournals(
  plantId: string,
  params?: PlantJournalListParams,
  scope?: ApiUserScopeOptions
): Promise<PageResponse<GrowthJournalDto>> {
  const cleanPlantId = assertValidJournalPlantId(plantId);
  const normalized = normalizePlantJournalListParams(params);

  const response = await apiClient.get<ApiResponse<PageResponse<GrowthJournalDto>>>(
    `/plants/${encodeURIComponent(cleanPlantId)}/journals`,
    {
      params: {
        page: normalized.page,
        size: normalized.size,
      },
      ...buildScopeConfig(scope),
    }
  );

  return normalizePlantJournalsPage(response.data?.data, normalized.page, normalized.size);
}

export async function findJournalByIdFromPlantPages(
  plantId: string,
  journalId: string,
  scope?: ApiUserScopeOptions
): Promise<GrowthJournalDto> {
  const cleanPlantId = assertValidJournalPlantId(plantId);
  const cleanJournalId = assertValidJournalId(journalId);

  for (let page = 0; page < MAX_JOURNAL_SCAN_PAGES; page += 1) {
    const pageData = await getPlantJournals(
      cleanPlantId,
      { page, size: DEFAULT_JOURNAL_SIZE },
      scope
    );
    const match = pageData.content.find((item) => item.id === cleanJournalId);
    if (match) {
      return match;
    }
    if (pageData.last || pageData.content.length === 0) {
      break;
    }
    if (pageData.totalPages > 0 && page + 1 >= pageData.totalPages) {
      break;
    }
  }

  throw new AppApiError({
    message: 'Không tìm thấy bản ghi nhật ký phát triển.',
    code: 'JOURNAL_NOT_FOUND',
    statusCode: 404,
  });
}

export async function createJournal(
  request: CreateGrowthJournalRequestDto,
  scope?: ApiUserScopeOptions
): Promise<GrowthJournalDto> {
  const payload = buildCreateJournalPayload(request);
  const response = await apiClient.post<ApiResponse<GrowthJournalDto>>(
    '/journals',
    payload,
    buildScopeConfig(scope)
  );
  if (!response.data?.data) {
    throw new AppApiError({
      message: 'Không thể tạo ghi nhận nhật ký mới.',
      code: 'INVALID_RESPONSE',
    });
  }
  return normalizeGrowthJournal(response.data.data);
}

export async function updateJournal(
  journalId: string,
  request: UpdateGrowthJournalRequestDto,
  scope?: ApiUserScopeOptions
): Promise<GrowthJournalDto> {
  const cleanJournalId = assertValidJournalId(journalId);
  const payload = buildUpdateJournalPayload(request);
  const response = await apiClient.put<ApiResponse<GrowthJournalDto>>(
    `/journals/${encodeURIComponent(cleanJournalId)}`,
    payload,
    buildScopeConfig(scope)
  );
  if (!response.data?.data) {
    throw new AppApiError({
      message: 'Không thể cập nhật nhật ký phát triển.',
      code: 'INVALID_RESPONSE',
    });
  }
  return normalizeGrowthJournal(response.data.data);
}

export async function deleteJournal(
  journalId: string,
  scope?: ApiUserScopeOptions
): Promise<SimpleMessageResponseDto> {
  const cleanJournalId = assertValidJournalId(journalId);
  const response = await apiClient.delete<ApiResponse<SimpleMessageResponseDto>>(
    `/journals/${encodeURIComponent(cleanJournalId)}`,
    buildScopeConfig(scope)
  );
  if (!response.data?.data) {
    return { message: response.data?.message || 'Ghi nhận đã được xóa.' };
  }
  return response.data.data;
}
