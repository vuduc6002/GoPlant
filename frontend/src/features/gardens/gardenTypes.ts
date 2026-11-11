export type SpaceType = 'BAN_CONG' | 'SAN_THUONG' | 'TRONG_NHA' | 'SAN_VUON' | 'KHAC';

export type HealthStatus = 'HEALTHY' | 'NEEDS_ATTENTION' | 'CRITICAL' | 'UNKNOWN';

export interface SpaceTypeOption {
  value: SpaceType;
  label: string;
}

export const SPACE_TYPE_OPTIONS: SpaceTypeOption[] = [
  { value: 'BAN_CONG', label: 'Ban công' },
  { value: 'SAN_THUONG', label: 'Sân thượng' },
  { value: 'TRONG_NHA', label: 'Trong nhà' },
  { value: 'SAN_VUON', label: 'Sân vườn' },
  { value: 'KHAC', label: 'Khác' },
];

export function getSpaceTypeLabel(spaceType?: SpaceType | string | null): string {
  switch (spaceType) {
    case 'BAN_CONG':
      return 'Ban công';
    case 'SAN_THUONG':
      return 'Sân thượng';
    case 'TRONG_NHA':
      return 'Trong nhà';
    case 'SAN_VUON':
      return 'Sân vườn';
    case 'KHAC':
      return 'Khác';
    default:
      return 'Khác';
  }
}

export function getHealthStatusMeta(status?: HealthStatus | string | null): {
  label: string;
  tone: 'mint' | 'peach' | 'danger' | 'plain';
} {
  switch (status) {
    case 'HEALTHY':
      return { label: 'Khỏe mạnh', tone: 'mint' };
    case 'NEEDS_ATTENTION':
      return { label: 'Cần chú ý', tone: 'peach' };
    case 'CRITICAL':
      return { label: 'Nguy cấp', tone: 'danger' };
    case 'UNKNOWN':
    default:
      return { label: 'Chưa đánh giá', tone: 'plain' };
  }
}

export interface GardenSummaryDto {
  id: string;
  name: string;
  location: string;
  spaceType: SpaceType;
  coverImageUrl: string | null;
  plantCount: number;
  createdAt: string;
}

export interface GardenPlantSummaryDto {
  id: string;
  displayName: string;
  speciesName: string | null;
  scientificName: string | null;
  category: string | null;
  healthStatus: HealthStatus;
  imageUrl: string | null;
}

export interface GardenDetailDto {
  id: string;
  name: string;
  location: string;
  spaceType: SpaceType;
  description: string | null;
  coverImageUrl: string | null;
  plants: GardenPlantSummaryDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateGardenRequestDto {
  name: string;
  location: string;
  spaceType: SpaceType;
  description?: string;
  coverImageUrl?: string;
}

export interface UpdateGardenRequestDto {
  name?: string;
  location?: string;
  spaceType?: SpaceType;
  description?: string;
  coverImageUrl?: string;
}
