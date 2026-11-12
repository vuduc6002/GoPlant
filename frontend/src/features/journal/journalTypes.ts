export type EntryType = 'GROWTH' | 'WATERING' | 'FERTILIZING' | 'PEST' | 'OTHER';

export type JournalHealthStatus = 'HEALTHY' | 'NEEDS_ATTENTION' | 'CRITICAL';

export interface EntryTypeMeta {
  value: EntryType;
  label: string;
  description: string;
  icon: string;
}

export const ENTRY_TYPE_OPTIONS: EntryTypeMeta[] = [
  {
    value: 'GROWTH',
    label: 'Sinh trưởng',
    description: 'Theo dõi chồi mới, chiều cao, ra hoa hoặc kết trái.',
    icon: '♧',
  },
  {
    value: 'WATERING',
    label: 'Tưới nước',
    description: 'Ghi nhận độ ẩm đất, phản ứng lá sau khi tưới.',
    icon: '◔',
  },
  {
    value: 'FERTILIZING',
    label: 'Bón phân',
    description: 'Ghi nhận loại phân, liều lượng và phản ứng của cây.',
    icon: '◈',
  },
  {
    value: 'PEST',
    label: 'Sâu bệnh',
    description: 'Theo dõi đốm lá, nấm, rệp sáp hoặc biện pháp xử lý.',
    icon: '◎',
  },
  {
    value: 'OTHER',
    label: 'Khác',
    description: 'Thay chậu, chuyển vị trí nắng hoặc ghi chú chung.',
    icon: '▤',
  },
];

export interface JournalHealthStatusMeta {
  value: JournalHealthStatus;
  label: string;
  tone: 'mint' | 'peach' | 'danger';
}

export const JOURNAL_HEALTH_STATUS_OPTIONS: JournalHealthStatusMeta[] = [
  {
    value: 'HEALTHY',
    label: 'Khỏe mạnh',
    tone: 'mint',
  },
  {
    value: 'NEEDS_ATTENTION',
    label: 'Cần theo dõi',
    tone: 'peach',
  },
  {
    value: 'CRITICAL',
    label: 'Nguy cấp / Cần can thiệp',
    tone: 'danger',
  },
];

const ENTRY_TYPE_MAP = new Map<EntryType, EntryTypeMeta>(
  ENTRY_TYPE_OPTIONS.map((item) => [item.value, item])
);

const JOURNAL_HEALTH_MAP = new Map<JournalHealthStatus, JournalHealthStatusMeta>(
  JOURNAL_HEALTH_STATUS_OPTIONS.map((item) => [item.value, item])
);

export function getEntryTypeMeta(entryType: EntryType | string | undefined): EntryTypeMeta {
  if (entryType && ENTRY_TYPE_MAP.has(entryType as EntryType)) {
    return ENTRY_TYPE_MAP.get(entryType as EntryType)!;
  }
  return {
    value: 'GROWTH',
    label: 'Sinh trưởng',
    description: 'Theo dõi phát triển của cây.',
    icon: '♧',
  };
}

export function getJournalHealthStatusMeta(
  status: JournalHealthStatus | string | undefined
): JournalHealthStatusMeta {
  if (status && JOURNAL_HEALTH_MAP.has(status as JournalHealthStatus)) {
    return JOURNAL_HEALTH_MAP.get(status as JournalHealthStatus)!;
  }
  return {
    value: 'HEALTHY',
    label: 'Khỏe mạnh',
    tone: 'mint',
  };
}

export interface GrowthJournalDto {
  id: string;
  userPlantId: string;
  entryType: EntryType;
  healthStatus: JournalHealthStatus;
  note: string;
  imageUrls: string[];
  recordedAt: string;
  createdAt: string | null;
}

export interface PlantJournalListParams {
  page?: number;
  size?: number;
}

export interface CreateGrowthJournalRequestDto {
  userPlantId: string;
  entryType?: EntryType;
  healthStatus?: JournalHealthStatus;
  note: string;
  imageUrls?: string[];
  recordedAt?: string;
}

export interface UpdateGrowthJournalRequestDto {
  entryType?: EntryType;
  healthStatus?: JournalHealthStatus;
  note?: string;
  imageUrls?: string[];
  recordedAt?: string;
}
