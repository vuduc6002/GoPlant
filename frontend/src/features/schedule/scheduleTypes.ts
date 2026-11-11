export type TaskType =
  | 'WATERING'
  | 'FERTILIZING'
  | 'PRUNING'
  | 'PEST_CHECK'
  | 'MISTING'
  | 'JOURNAL';

export type Frequency =
  | 'ONCE'
  | 'DAILY'
  | 'EVERY_OTHER_DAY'
  | 'WEEKLY'
  | 'CUSTOM';

export type ScheduleStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export interface TaskTypeOptionMeta {
  value: TaskType;
  label: string;
  shortDesc: string;
  icon: string;
}

export const TASK_TYPE_OPTIONS: TaskTypeOptionMeta[] = [
  {
    value: 'WATERING',
    label: 'Tưới nước',
    shortDesc: 'Cung cấp độ ẩm định kỳ cho đất và rễ.',
    icon: '◔',
  },
  {
    value: 'FERTILIZING',
    label: 'Bón phân',
    shortDesc: 'Bổ sung dinh dưỡng theo giai đoạn sinh trưởng.',
    icon: '◈',
  },
  {
    value: 'PRUNING',
    label: 'Cắt tỉa',
    shortDesc: 'Loại bỏ lá già, cành khô và tạo tán.',
    icon: '✂',
  },
  {
    value: 'PEST_CHECK',
    label: 'Kiểm tra sâu bệnh',
    shortDesc: 'Quan sát mặt lá, thân và gốc cây.',
    icon: '◎',
  },
  {
    value: 'MISTING',
    label: 'Phun sương',
    shortDesc: 'Tăng ẩm bề mặt lá cho cây ưa ẩm.',
    icon: '◌',
  },
  {
    value: 'JOURNAL',
    label: 'Ghi nhận phát triển',
    shortDesc: 'Nhắc theo dõi chiều cao, chồi và ra hoa.',
    icon: '▤',
  },
];

export interface FrequencyOptionMeta {
  value: Frequency;
  label: string;
  description: string;
}

export const FREQUENCY_OPTIONS: FrequencyOptionMeta[] = [
  {
    value: 'ONCE',
    label: 'Một lần',
    description: 'Thực hiện duy nhất 1 lần theo ngày bắt đầu.',
  },
  {
    value: 'DAILY',
    label: 'Mỗi ngày',
    description: 'Lặp lại hàng ngày theo giờ nhắc.',
  },
  {
    value: 'EVERY_OTHER_DAY',
    label: 'Cách ngày',
    description: 'Lặp lại mỗi 2 ngày một lần.',
  },
  {
    value: 'WEEKLY',
    label: 'Hàng tuần',
    description: 'Lặp lại mỗi 7 ngày một lần.',
  },
  {
    value: 'CUSTOM',
    label: 'Tùy chỉnh',
    description: 'Tự nhập số ngày giữa các lần lặp (>= 1 ngày).',
  },
];

export interface ScheduleStatusOptionMeta {
  value: ScheduleStatus;
  label: string;
  tone: 'mint' | 'peach' | 'danger' | 'plain';
}

export const SCHEDULE_STATUS_OPTIONS: ScheduleStatusOptionMeta[] = [
  {
    value: 'ACTIVE',
    label: 'Đang hoạt động',
    tone: 'mint',
  },
  {
    value: 'PAUSED',
    label: 'Tạm ngưng',
    tone: 'peach',
  },
  {
    value: 'COMPLETED',
    label: 'Đã hoàn thành',
    tone: 'plain',
  },
  {
    value: 'CANCELLED',
    label: 'Đã hủy',
    tone: 'danger',
  },
];

const TASK_TYPE_MAP = new Map<TaskType, TaskTypeOptionMeta>(
  TASK_TYPE_OPTIONS.map((item) => [item.value, item])
);

const STATUS_META_MAP = new Map<ScheduleStatus, ScheduleStatusOptionMeta>(
  SCHEDULE_STATUS_OPTIONS.map((item) => [item.value, item])
);

export function getTaskTypeMeta(taskType: TaskType | string | undefined): TaskTypeOptionMeta {
  if (taskType && TASK_TYPE_MAP.has(taskType as TaskType)) {
    return TASK_TYPE_MAP.get(taskType as TaskType)!;
  }
  return {
    value: 'WATERING',
    label: 'Chăm sóc cây',
    shortDesc: 'Công việc chăm sóc định kỳ.',
    icon: '◷',
  };
}

export function getScheduleStatusMeta(
  status: ScheduleStatus | string | undefined
): ScheduleStatusOptionMeta {
  if (status && STATUS_META_MAP.has(status as ScheduleStatus)) {
    return STATUS_META_MAP.get(status as ScheduleStatus)!;
  }
  return {
    value: 'ACTIVE',
    label: 'Không xác định',
    tone: 'plain',
  };
}

export function getFrequencyLabel(
  frequency: Frequency | string | undefined,
  intervalDays?: number | null
): string {
  switch (frequency) {
    case 'ONCE':
      return 'Một lần';
    case 'DAILY':
      return 'Mỗi ngày';
    case 'EVERY_OTHER_DAY':
      return 'Cách ngày (2 ngày/lần)';
    case 'WEEKLY':
      return 'Hàng tuần (7 ngày/lần)';
    case 'CUSTOM':
      return typeof intervalDays === 'number' && intervalDays > 0
        ? `Mỗi ${intervalDays} ngày`
        : 'Chu kỳ tùy chỉnh';
    default:
      return 'Định kỳ';
  }
}

export interface TodayScheduleItemDto {
  scheduleId: string;
  plantId: string;
  plantName: string;
  gardenName: string | null;
  taskType: TaskType;
  taskLabel: string | null;
  nextScheduledAt: string;
  isOverdue: boolean;
  status: ScheduleStatus;
}

export interface CareScheduleDto {
  id: string;
  userPlantId: string;
  plantName: string;
  taskType: TaskType;
  taskLabel: string | null;
  frequency: Frequency;
  intervalDays: number | null;
  reminderTime: string | null;
  startDate: string;
  endDate: string | null;
  nextScheduledAt: string;
  isOverdue: boolean;
  status: ScheduleStatus;
}

export interface CreateScheduleRequestDto {
  userPlantId: string;
  taskType: TaskType;
  taskLabel?: string | null;
  frequency: Frequency;
  intervalDays?: number | null;
  reminderTime?: string | null;
  startDate: string;
  endDate?: string | null;
}

export interface UpdateScheduleRequestDto {
  taskType?: TaskType;
  taskLabel?: string | null;
  frequency?: Frequency;
  intervalDays?: number | null;
  reminderTime?: string | null;
  startDate?: string;
  endDate?: string | null;
  status?: ScheduleStatus;
}

export interface CompleteScheduleRequestDto {
  note?: string;
  imageUrls?: string[];
  performedAt?: string;
}

export interface SkipScheduleRequestDto {
  note?: string;
}

export interface CompleteScheduleResponseDto {
  careLogId: string;
  scheduleStatus: ScheduleStatus | string;
  nextScheduledAt: string | null;
}

export interface PlantScheduleListParams {
  status?: ScheduleStatus | '';
  page?: number;
  size?: number;
}
