import type { HealthStatus } from '@/features/gardens/gardenTypes';
import type { EntryType, JournalHealthStatus } from '@/features/journal/journalTypes';

export type MonitoringActivitySourceType =
  | 'CARE_LOG_UNLINKED'
  | 'CARE_LOG_LINKED'
  | 'GROWTH_JOURNAL';

export interface HealthDistributionDto {
  healthyCount: number;
  needsAttentionCount: number;
  criticalCount: number;
  unknownCount: number;
}

export interface MonitoringSchedulesSummaryDto {
  activeCount: number;
  dueTodayCount: number;
  overdueCount: number;
}

export interface CareLogsWindowSummaryDto {
  unlinkedCompletedLogs: number;
  unlinkedSkippedLogs: number;
  linkedScheduledCompletedLogs: number;
  linkedScheduledSkippedLogs: number;
}

export interface AttentionPlantDto {
  plantId: string;
  displayName: string;
  gardenId: string;
  gardenName: string;
  speciesName: string;
  healthStatus: HealthStatus;
}

export interface MonitoringGardenSummaryDto {
  gardenId: string;
  name: string;
  plantCount: number;
  attentionCount: number;
}

export interface MonitoringOverviewDto {
  gardensCount: number;
  plantsCount: number;
  healthDistribution: HealthDistributionDto;
  schedulesSummary: MonitoringSchedulesSummaryDto;
  careLogsSummary7d: CareLogsWindowSummaryDto;
  careLogsSummary30d: CareLogsWindowSummaryDto;
  attentionPlants: AttentionPlantDto[];
  gardensSummary: MonitoringGardenSummaryDto[];
  sensorConnected: boolean;
  generatedAt: string;
}

export interface MonitoringPlantGardenDto {
  id: string;
  name: string;
}

export interface MonitoringPlantSpeciesDto {
  id: string;
  commonName: string;
  scientificName: string;
  category: string;
}

export interface MonitoringActivityItemDto {
  id: string;
  sourceType: MonitoringActivitySourceType;
  title: string;
  taskType: string | null;
  status: string | null;
  entryType: EntryType | null;
  healthStatus: JournalHealthStatus | null;
  notePreview: string | null;
  occurredAt: string;
}

export interface MonitoringJournalObservationDto {
  journalId: string;
  recordedAt: string;
  entryType: EntryType;
  healthStatus: JournalHealthStatus;
  notePreview: string | null;
}

export interface SpeciesCareGuideDto {
  lightRequirement: string | null;
  waterRequirement: string | null;
  wateringFrequency: string | null;
  temperatureRange: string | null;
  humidityRange: string | null;
  soilPh: string | null;
  usageAndCaution: string | null;
}

export interface PlantMonitoringDetailDto {
  plantId: string;
  displayName: string;
  garden: MonitoringPlantGardenDto | null;
  species: MonitoringPlantSpeciesDto | null;
  currentHealthStatus: HealthStatus;
  plantedAt: string | null;
  ageDays: number | null;
  schedulesSummary: MonitoringSchedulesSummaryDto;
  careLogsSummary30d: CareLogsWindowSummaryDto;
  recentActivityTimeline: MonitoringActivityItemDto[];
  recentJournalObservations: MonitoringJournalObservationDto[];
  speciesCareGuide: SpeciesCareGuideDto;
  sensorConnected: boolean;
  generatedAt: string;
}

export const MONITORING_PROFILE_HEALTH_LABEL = 'Trạng thái được lưu trong hồ sơ cây';
export const MONITORING_DEFAULT_HEALTHY_NOTE =
  'Cây mới tạo mặc định có trạng thái Khỏe; hãy cập nhật nếu tình trạng thực tế khác.';
export const MONITORING_JOURNAL_HEALTH_NOTE =
  'Trạng thái được lưu trong nhật ký (có thể là giá trị mặc định khi tạo).';
export const MONITORING_CARE_LOG_PROVENANCE_NOTE =
  'Nhóm "Không/chưa gắn lịch" gồm cả log ghi thủ công và log từng gắn lịch nhưng lịch đã bị xóa (schedule_id được đặt về NULL), nên không dùng để khẳng định tỷ lệ tuân thủ lịch.';
export const MONITORING_SENSOR_DISCONNECTED_TEXT = 'Chưa kết nối cảm biến IoT';
export const MONITORING_SPECIES_GUIDE_TITLE = 'Hướng dẫn chăm sóc tham khảo theo loài';

export interface MonitoringActivitySourceMeta {
  value: MonitoringActivitySourceType;
  label: string;
  tone: 'mint' | 'peach' | 'plain';
}

export function getMonitoringActivitySourceMeta(
  sourceType?: MonitoringActivitySourceType | string | null
): MonitoringActivitySourceMeta {
  switch (sourceType) {
    case 'CARE_LOG_LINKED':
      return {
        value: 'CARE_LOG_LINKED',
        label: 'Theo lịch hiện còn',
        tone: 'mint',
      };
    case 'GROWTH_JOURNAL':
      return {
        value: 'GROWTH_JOURNAL',
        label: 'Nhật ký phát triển',
        tone: 'peach',
      };
    case 'CARE_LOG_UNLINKED':
    default:
      return {
        value: 'CARE_LOG_UNLINKED',
        label: 'Không/chưa gắn lịch',
        tone: 'plain',
      };
  }
}

export const SPECIES_CARE_GUIDE_FIELDS: {
  key: keyof SpeciesCareGuideDto;
  label: string;
}[] = [
  { key: 'lightRequirement', label: 'Nhu cầu ánh sáng' },
  { key: 'waterRequirement', label: 'Nhu cầu nước' },
  { key: 'wateringFrequency', label: 'Tần suất tưới tham khảo' },
  { key: 'temperatureRange', label: 'Khoảng nhiệt độ tham khảo' },
  { key: 'humidityRange', label: 'Khoảng độ ẩm tham khảo' },
  { key: 'soilPh', label: 'Độ pH đất tham khảo' },
  { key: 'usageAndCaution', label: 'Công dụng & lưu ý' },
];
