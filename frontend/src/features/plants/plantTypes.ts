import type { HealthStatus } from '@/features/gardens/gardenTypes';

export type { HealthStatus };

export type PlantSortField = 'displayName' | 'createdAt' | 'plantedAt' | 'healthStatus';

export interface PlantSortOption {
  value: string;
  label: string;
}

export interface HealthStatusOption {
  value: HealthStatus;
  label: string;
}

export const HEALTH_STATUS_OPTIONS: HealthStatusOption[] = [
  { value: 'HEALTHY', label: 'Khỏe mạnh' },
  { value: 'NEEDS_ATTENTION', label: 'Cần chú ý' },
  { value: 'CRITICAL', label: 'Nguy cấp' },
  { value: 'UNKNOWN', label: 'Chưa đánh giá' },
];

export const PLANT_SORT_OPTIONS: PlantSortOption[] = [
  { value: 'createdAt,desc', label: 'Mới nhất' },
  { value: 'createdAt,asc', label: 'Cũ nhất' },
  { value: 'displayName,asc', label: 'Tên A → Z' },
  { value: 'displayName,desc', label: 'Tên Z → A' },
  { value: 'plantedAt,desc', label: 'Ngày trồng mới' },
  { value: 'healthStatus,asc', label: 'Tình trạng' },
];

export interface UserPlantSummaryDto {
  id: string;
  displayName: string;
  speciesName: string | null;
  scientificName: string | null;
  category: string | null;
  gardenName: string | null;
  healthStatus: HealthStatus;
  imageUrl: string | null;
  createdAt: string;
}

export interface UserPlantSpeciesSummaryDto {
  id: string;
  commonName: string;
  scientificName: string;
  category: string;
  difficulty: string | null;
  thumbnailUrl: string | null;
}

export interface UserPlantGardenSummaryDto {
  id: string;
  name: string;
}

export interface UserPlantDetailDto {
  id: string;
  displayName: string;
  location: string | null;
  plantedAt: string | null;
  note: string | null;
  healthStatus: HealthStatus;
  plantCode: string | null;
  imageUrl: string | null;
  species: UserPlantSpeciesSummaryDto | null;
  garden: UserPlantGardenSummaryDto | null;
  createdAt: string;
}

export interface UserPlantListParams {
  keyword?: string;
  gardenId?: string;
  healthStatus?: HealthStatus;
  page?: number;
  size?: number;
  sort?: string;
}

export interface CreateUserPlantRequestDto {
  speciesId: string;
  displayName: string;
  location?: string;
  plantedAt?: string;
  note?: string;
  imageUrl?: string;
}

export interface UpdateUserPlantRequestDto {
  displayName?: string;
  location?: string;
  plantedAt?: string;
  note?: string;
  healthStatus?: HealthStatus;
  imageUrl?: string;
}
