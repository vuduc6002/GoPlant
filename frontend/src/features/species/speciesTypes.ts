export interface SpeciesSummaryDto {
  id: string;
  commonName: string;
  scientificName: string;
  category: string;
  difficulty: string | null;
  thumbnailUrl: string | null;
  isFavorited: boolean;
}

export interface SpeciesDetailDto {
  id: string;
  commonName: string;
  scientificName: string;
  category: string;
  difficulty: string | null;
  lightRequirement: string | null;
  waterRequirement: string | null;
  environment: string | null;
  spaceRequirement: string | null;
  matureSize: string | null;
  temperatureRange: string | null;
  humidityRange: string | null;
  growingMedium: string | null;
  drainage: string | null;
  soilPh: string | null;
  sunTolerance: string | null;
  origin: string | null;
  overview: string | null;
  morphology: string | null;
  lifespan: string | null;
  floweringSeason: string | null;
  usageAndCaution: string | null;
  growthRate: string | null;
  wateringFrequency: string | null;
  nutrition: string | null;
  thumbnailUrl: string | null;
  isFavorited: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SpeciesSortField =
  | 'commonName'
  | 'scientificName'
  | 'category'
  | 'difficulty'
  | 'createdAt'
  | 'updatedAt';

export interface SpeciesSortOption {
  value: string;
  label: string;
}

export interface SpeciesListParams {
  keyword?: string;
  category?: string;
  page?: number;
  size?: number;
  sort?: string;
}

export interface FavoriteSpeciesParams {
  page?: number;
  size?: number;
}

export const SPECIES_CATEGORY_OPTIONS: string[] = [
  'Tất cả',
  'Cây cảnh',
  'Rau',
  'Cây ăn quả',
  'Hoa',
  'Cây gia vị',
  'Cây dược liệu',
  'Khác',
];

export const SPECIES_SORT_OPTIONS: SpeciesSortOption[] = [
  { value: 'commonName,asc', label: 'Tên A → Z' },
  { value: 'commonName,desc', label: 'Tên Z → A' },
  { value: 'category,asc', label: 'Nhóm cây' },
  { value: 'difficulty,asc', label: 'Độ khó' },
  { value: 'createdAt,desc', label: 'Mới nhất' },
];
