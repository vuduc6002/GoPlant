import {
  getTaskTypeMeta,
  TASK_TYPE_OPTIONS,
  type TaskType,
  type TaskTypeOptionMeta,
} from '@/features/schedule/scheduleTypes';

export { getTaskTypeMeta, TASK_TYPE_OPTIONS, type TaskType, type TaskTypeOptionMeta };

export type CareLogStatus = 'COMPLETED' | 'SKIPPED';

export interface CareLogStatusMeta {
  value: CareLogStatus;
  label: string;
  tone: 'mint' | 'plain';
}

const CARE_LOG_STATUS_MAP = new Map<CareLogStatus, CareLogStatusMeta>([
  [
    'COMPLETED',
    {
      value: 'COMPLETED',
      label: 'Hoàn thành',
      tone: 'mint',
    },
  ],
  [
    'SKIPPED',
    {
      value: 'SKIPPED',
      label: 'Đã bỏ qua',
      tone: 'plain',
    },
  ],
]);

export function getCareLogStatusMeta(status: CareLogStatus | string | undefined): CareLogStatusMeta {
  if (status && CARE_LOG_STATUS_MAP.has(status as CareLogStatus)) {
    return CARE_LOG_STATUS_MAP.get(status as CareLogStatus)!;
  }
  return {
    value: 'COMPLETED',
    label: 'Hoàn thành',
    tone: 'mint',
  };
}

export interface CareLogDto {
  id: string;
  userPlantId: string;
  taskType: TaskType;
  status: CareLogStatus;
  note: string | null;
  imageUrls: string[];
  performedAt: string;
  createdAt: string | null;
}

export interface PlantCareLogListParams {
  page?: number;
  size?: number;
}

export interface CreateCareLogRequestDto {
  userPlantId: string;
  taskType: TaskType;
  note?: string;
  imageUrls?: string[];
  performedAt?: string;
}
