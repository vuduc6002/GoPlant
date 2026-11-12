import type { HealthStatus } from '@/features/gardens/gardenTypes';
import type { EntryType, JournalHealthStatus } from '@/features/journal/journalTypes';
import { apiClient, type ApiUserScopeOptions } from '@/services/api/apiClient';
import { AppApiError } from '@/services/api/apiError';
import type { ApiResponse } from '@/services/api/apiTypes';
import type {
  AttentionPlantDto,
  CareLogsWindowSummaryDto,
  HealthDistributionDto,
  MonitoringActivityItemDto,
  MonitoringActivitySourceType,
  MonitoringGardenSummaryDto,
  MonitoringJournalObservationDto,
  MonitoringOverviewDto,
  MonitoringSchedulesSummaryDto,
  PlantMonitoringDetailDto,
  SpeciesCareGuideDto,
} from './monitoringTypes';

const VALID_HEALTH_STATUSES = new Set<HealthStatus>([
  'HEALTHY',
  'NEEDS_ATTENTION',
  'CRITICAL',
  'UNKNOWN',
]);

const VALID_JOURNAL_HEALTH_STATUSES = new Set<JournalHealthStatus>([
  'HEALTHY',
  'NEEDS_ATTENTION',
  'CRITICAL',
]);

const VALID_ENTRY_TYPES = new Set<EntryType>([
  'GROWTH',
  'WATERING',
  'FERTILIZING',
  'PEST',
  'OTHER',
]);

const VALID_ACTIVITY_SOURCE_TYPES = new Set<MonitoringActivitySourceType>([
  'CARE_LOG_UNLINKED',
  'CARE_LOG_LINKED',
  'GROWTH_JOURNAL',
]);

function buildScopeConfig(scope?: ApiUserScopeOptions) {
  if (!scope) {
    return undefined;
  }
  return {
    ...(scope.expectedUserId !== undefined ? { expectedUserId: scope.expectedUserId } : {}),
    ...(scope.expectedSessionGeneration !== undefined
      ? { expectedSessionGeneration: scope.expectedSessionGeneration }
      : {}),
  };
}

function toNonNegativeInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function normalizeNullableText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeHealthStatus(value: unknown): HealthStatus {
  if (typeof value === 'string' && VALID_HEALTH_STATUSES.has(value as HealthStatus)) {
    return value as HealthStatus;
  }
  return 'UNKNOWN';
}

function normalizeHealthDistribution(
  raw?: Partial<HealthDistributionDto> | null
): HealthDistributionDto {
  return {
    healthyCount: toNonNegativeInt(raw?.healthyCount),
    needsAttentionCount: toNonNegativeInt(raw?.needsAttentionCount),
    criticalCount: toNonNegativeInt(raw?.criticalCount),
    unknownCount: toNonNegativeInt(raw?.unknownCount),
  };
}

function normalizeSchedulesSummary(
  raw?: Partial<MonitoringSchedulesSummaryDto> | null
): MonitoringSchedulesSummaryDto {
  return {
    activeCount: toNonNegativeInt(raw?.activeCount),
    dueTodayCount: toNonNegativeInt(raw?.dueTodayCount),
    overdueCount: toNonNegativeInt(raw?.overdueCount),
  };
}

function normalizeCareLogsSummary(
  raw?: Partial<CareLogsWindowSummaryDto> | null
): CareLogsWindowSummaryDto {
  return {
    unlinkedCompletedLogs: toNonNegativeInt(raw?.unlinkedCompletedLogs),
    unlinkedSkippedLogs: toNonNegativeInt(raw?.unlinkedSkippedLogs),
    linkedScheduledCompletedLogs: toNonNegativeInt(raw?.linkedScheduledCompletedLogs),
    linkedScheduledSkippedLogs: toNonNegativeInt(raw?.linkedScheduledSkippedLogs),
  };
}

function normalizeAttentionPlant(raw: Partial<AttentionPlantDto>): AttentionPlantDto | null {
  const plantId = normalizeNullableText(raw.plantId);
  if (!plantId) {
    return null;
  }
  return {
    plantId,
    displayName: normalizeNullableText(raw.displayName) ?? 'Cây trồng',
    gardenId: normalizeNullableText(raw.gardenId) ?? '',
    gardenName: normalizeNullableText(raw.gardenName) ?? '',
    speciesName: normalizeNullableText(raw.speciesName) ?? '',
    healthStatus: normalizeHealthStatus(raw.healthStatus),
  };
}

function normalizeGardenSummary(
  raw: Partial<MonitoringGardenSummaryDto>
): MonitoringGardenSummaryDto | null {
  const gardenId = normalizeNullableText(raw.gardenId);
  if (!gardenId) {
    return null;
  }
  return {
    gardenId,
    name: normalizeNullableText(raw.name) ?? 'Khu vườn',
    plantCount: toNonNegativeInt(raw.plantCount),
    attentionCount: toNonNegativeInt(raw.attentionCount),
  };
}

function normalizeActivityItem(
  raw: Partial<MonitoringActivityItemDto>
): MonitoringActivityItemDto | null {
  const id = normalizeNullableText(raw.id);
  if (!id) {
    return null;
  }
  const sourceType: MonitoringActivitySourceType =
    typeof raw.sourceType === 'string' &&
    VALID_ACTIVITY_SOURCE_TYPES.has(raw.sourceType as MonitoringActivitySourceType)
      ? (raw.sourceType as MonitoringActivitySourceType)
      : 'CARE_LOG_UNLINKED';

  const entryType =
    typeof raw.entryType === 'string' && VALID_ENTRY_TYPES.has(raw.entryType as EntryType)
      ? (raw.entryType as EntryType)
      : null;

  const healthStatus =
    typeof raw.healthStatus === 'string' &&
    VALID_JOURNAL_HEALTH_STATUSES.has(raw.healthStatus as JournalHealthStatus)
      ? (raw.healthStatus as JournalHealthStatus)
      : null;

  return {
    id,
    sourceType,
    title: normalizeNullableText(raw.title) ?? 'Hoạt động chăm sóc',
    taskType: normalizeNullableText(raw.taskType),
    status: normalizeNullableText(raw.status),
    entryType,
    healthStatus,
    notePreview: normalizeNullableText(raw.notePreview),
    occurredAt: normalizeNullableText(raw.occurredAt) ?? '',
  };
}

function normalizeJournalObservation(
  raw: Partial<MonitoringJournalObservationDto>
): MonitoringJournalObservationDto | null {
  const journalId = normalizeNullableText(raw.journalId);
  if (!journalId) {
    return null;
  }
  const entryType: EntryType =
    typeof raw.entryType === 'string' && VALID_ENTRY_TYPES.has(raw.entryType as EntryType)
      ? (raw.entryType as EntryType)
      : 'OTHER';
  const healthStatus: JournalHealthStatus =
    typeof raw.healthStatus === 'string' &&
    VALID_JOURNAL_HEALTH_STATUSES.has(raw.healthStatus as JournalHealthStatus)
      ? (raw.healthStatus as JournalHealthStatus)
      : 'HEALTHY';

  return {
    journalId,
    recordedAt: normalizeNullableText(raw.recordedAt) ?? '',
    entryType,
    healthStatus,
    notePreview: normalizeNullableText(raw.notePreview),
  };
}

function normalizeSpeciesCareGuide(raw?: Partial<SpeciesCareGuideDto> | null): SpeciesCareGuideDto {
  return {
    lightRequirement: normalizeNullableText(raw?.lightRequirement),
    waterRequirement: normalizeNullableText(raw?.waterRequirement),
    wateringFrequency: normalizeNullableText(raw?.wateringFrequency),
    temperatureRange: normalizeNullableText(raw?.temperatureRange),
    humidityRange: normalizeNullableText(raw?.humidityRange),
    soilPh: normalizeNullableText(raw?.soilPh),
    usageAndCaution: normalizeNullableText(raw?.usageAndCaution),
  };
}

export function assertValidMonitoringPlantId(plantId: string): string {
  const cleanId = typeof plantId === 'string' ? plantId.trim() : '';
  if (!cleanId) {
    throw new AppApiError({
      message: 'Mã cây trồng không hợp lệ.',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'plantId',
    });
  }
  return cleanId;
}

export function normalizeMonitoringOverview(raw: MonitoringOverviewDto): MonitoringOverviewDto {
  const rawAttention = Array.isArray(raw.attentionPlants) ? raw.attentionPlants : [];
  const rawGardens = Array.isArray(raw.gardensSummary) ? raw.gardensSummary : [];

  return {
    gardensCount: toNonNegativeInt(raw.gardensCount),
    plantsCount: toNonNegativeInt(raw.plantsCount),
    healthDistribution: normalizeHealthDistribution(raw.healthDistribution),
    schedulesSummary: normalizeSchedulesSummary(raw.schedulesSummary),
    careLogsSummary7d: normalizeCareLogsSummary(raw.careLogsSummary7d),
    careLogsSummary30d: normalizeCareLogsSummary(raw.careLogsSummary30d),
    attentionPlants: rawAttention
      .map((item) => normalizeAttentionPlant(item))
      .filter((item): item is AttentionPlantDto => item !== null),
    gardensSummary: rawGardens
      .map((item) => normalizeGardenSummary(item))
      .filter((item): item is MonitoringGardenSummaryDto => item !== null),
    sensorConnected: raw.sensorConnected === true,
    generatedAt: normalizeNullableText(raw.generatedAt) ?? '',
  };
}

export function normalizePlantMonitoringDetail(
  raw: PlantMonitoringDetailDto
): PlantMonitoringDetailDto {
  const rawTimeline = Array.isArray(raw.recentActivityTimeline)
    ? raw.recentActivityTimeline
    : [];
  const rawJournals = Array.isArray(raw.recentJournalObservations)
    ? raw.recentJournalObservations
    : [];

  const ageDays =
    typeof raw.ageDays === 'number' && Number.isFinite(raw.ageDays)
      ? Math.max(0, Math.trunc(raw.ageDays))
      : null;

  return {
    plantId: normalizeNullableText(raw.plantId) ?? '',
    displayName: normalizeNullableText(raw.displayName) ?? 'Cây trồng',
    garden:
      raw.garden && normalizeNullableText(raw.garden.id)
        ? {
            id: normalizeNullableText(raw.garden.id) ?? '',
            name: normalizeNullableText(raw.garden.name) ?? 'Khu vườn',
          }
        : null,
    species:
      raw.species && normalizeNullableText(raw.species.id)
        ? {
            id: normalizeNullableText(raw.species.id) ?? '',
            commonName: normalizeNullableText(raw.species.commonName) ?? '',
            scientificName: normalizeNullableText(raw.species.scientificName) ?? '',
            category: normalizeNullableText(raw.species.category) ?? '',
          }
        : null,
    currentHealthStatus: normalizeHealthStatus(raw.currentHealthStatus),
    plantedAt: normalizeNullableText(raw.plantedAt),
    ageDays,
    schedulesSummary: normalizeSchedulesSummary(raw.schedulesSummary),
    careLogsSummary30d: normalizeCareLogsSummary(raw.careLogsSummary30d),
    recentActivityTimeline: rawTimeline
      .map((item) => normalizeActivityItem(item))
      .filter((item): item is MonitoringActivityItemDto => item !== null),
    recentJournalObservations: rawJournals
      .map((item) => normalizeJournalObservation(item))
      .filter((item): item is MonitoringJournalObservationDto => item !== null),
    speciesCareGuide: normalizeSpeciesCareGuide(raw.speciesCareGuide),
    sensorConnected: raw.sensorConnected === true,
    generatedAt: normalizeNullableText(raw.generatedAt) ?? '',
  };
}

export async function getMonitoringOverview(
  scope?: ApiUserScopeOptions
): Promise<MonitoringOverviewDto> {
  const response = await apiClient.get<ApiResponse<MonitoringOverviewDto>>(
    '/monitoring/overview',
    buildScopeConfig(scope)
  );
  if (!response.data?.data) {
    throw new AppApiError({
      message: 'Dữ liệu tổng quan theo dõi không hợp lệ.',
      code: 'INVALID_RESPONSE',
    });
  }
  return normalizeMonitoringOverview(response.data.data);
}

export async function getPlantMonitoringDetail(
  plantId: string,
  scope?: ApiUserScopeOptions
): Promise<PlantMonitoringDetailDto> {
  const cleanId = assertValidMonitoringPlantId(plantId);
  const response = await apiClient.get<ApiResponse<PlantMonitoringDetailDto>>(
    `/monitoring/plants/${encodeURIComponent(cleanId)}`,
    buildScopeConfig(scope)
  );
  if (!response.data?.data) {
    throw new AppApiError({
      message: 'Dữ liệu chi tiết theo dõi cây trồng không hợp lệ.',
      code: 'INVALID_RESPONSE',
    });
  }
  return normalizePlantMonitoringDetail(response.data.data);
}
