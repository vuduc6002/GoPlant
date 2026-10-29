import type { OwnedPlant, PlantProfile } from './PlantDataStore';

export type PlantFilterState = Record<string, string[]>;
export type FilterPlant = PlantProfile & Partial<OwnedPlant> & { isFavorite?: boolean };

export const vietnameseAlphabet = ['Tất cả', 'A', 'Ă', 'Â', 'B', 'C', 'D', 'Đ', 'E', 'Ê', 'G', 'H', 'I', 'K', 'L', 'M', 'N', 'O', 'Ô', 'Ơ', 'P', 'Q', 'R', 'S', 'T', 'U', 'Ư', 'V', 'X', 'Y'];

export const ownedFilterGroups = [
  { key: 'category', title: 'Loại cây trồng', options: ['Cây cảnh', 'Rau', 'Cây ăn quả', 'Hoa', 'Cây gia vị', 'Cây dược liệu', 'Khác'] },
  { key: 'location', title: 'Vị trí trồng hiện tại', options: ['Trong nhà', 'Ban công', 'Sân thượng', 'Sân vườn', 'Ngoài sân', 'Nhà kính', 'Khác', 'Chưa xác định'] },
  { key: 'health', title: 'Tình trạng sức khỏe cây', options: ['Khỏe mạnh', 'Có bất thường', 'Suy yếu', 'Chưa đánh giá'] },
  { key: 'care', title: 'Trạng thái chăm sóc', options: ['Sắp đến hạn', 'Đến hạn', 'Quá hạn', 'Đã hoàn thành', 'Không có lịch chăm sóc'] },
];

export const catalogFilterGroups = [
  { key: 'category', title: 'Loại cây trồng', options: ['Cây cảnh', 'Rau', 'Cây ăn quả', 'Hoa', 'Cây gia vị', 'Cây dược liệu', 'Khác'] },
  { key: 'difficulty', title: 'Độ khó chăm sóc', options: ['Dễ', 'Trung bình', 'Khó', 'Chưa có dữ liệu'] },
  { key: 'light', title: 'Nhu cầu ánh sáng', options: ['Nắng trực tiếp', 'Ánh sáng gián tiếp mạnh', 'Ánh sáng gián tiếp vừa', 'Ánh sáng yếu', 'Chưa có dữ liệu'] },
  { key: 'water', title: 'Nhu cầu tưới nước', options: ['Ít nước', 'Nước trung bình', 'Nhiều nước', 'Ưa ẩm', 'Chưa có dữ liệu'] },
  { key: 'environment', title: 'Môi trường', options: ['Trong nhà', 'Ngoài trời', 'Cả trong nhà và ngoài trời', 'Chưa có dữ liệu'] },
  { key: 'matureSize', title: 'Kích thước trưởng thành', options: ['Rất nhỏ', 'Nhỏ', 'Trung bình', 'Lớn', 'Rất lớn', 'Chưa có dữ liệu'] },
  { key: 'favorite', title: 'Cây yêu thích', options: ['Tất cả cây', 'Chỉ cây yêu thích'] },
  { key: 'space', title: 'Không gian trồng phù hợp', options: ['Bệ cửa sổ', 'Bàn làm việc / kệ', 'Ban công', 'Sân thượng', 'Sân vườn', 'Không gian nhỏ', 'Không gian rộng', 'Khác / Chưa xác định'] },
  { key: 'temperature', title: 'Nhiệt độ phù hợp', options: ['Mát mẻ', 'Nhiệt đới ẩm', 'Chịu lạnh', 'Chưa có dữ liệu'] },
  { key: 'humidity', title: 'Độ ẩm không khí', options: ['Độ ẩm thấp', 'Độ ẩm trung bình', 'Độ ẩm cao', 'Chưa có dữ liệu'] },
  { key: 'medium', title: 'Loại đất / giá thể', options: ['Đất thịt màu mỡ', 'Giá thể thoát nước tốt', 'Đất cát thoát nhanh', 'Chưa có dữ liệu'] },
  { key: 'drainage', title: 'Nhu cầu thoát nước', options: ['Thoát nước nhanh', 'Thoát nước tiêu chuẩn', 'Chịu úng nhẹ', 'Chưa có dữ liệu'] },
  { key: 'soilPh', title: 'Độ pH đất', options: ['Chua nhẹ', 'Trung tính', 'Chưa có dữ liệu'] },
  { key: 'sunTolerance', title: 'Khả năng chịu nắng', options: ['Chịu nắng trực tiếp', 'Ưa nắng bán phần', 'Ưa bóng / ánh sáng gián tiếp', 'Chưa có dữ liệu'] },
];

export function normalizeVietnamese(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLocaleUpperCase();
}

export function matchesPlantFilters(plant: FilterPlant, filters: PlantFilterState) {
  return Object.entries(filters).every(([key, selected]) => {
    if (!selected.length || key === 'favorite' && selected.includes('Tất cả cây')) return true;
    if (key === 'letter') {
      const first = normalizeVietnamese(plant.name ?? '').charAt(0);
      return selected.some((letter) => normalizeVietnamese(letter) === first);
    }
    if (key === 'favorite') return selected.includes('Chỉ cây yêu thích') ? Boolean(plant.isFavorite) : true;
    const value = key === 'health' ? 'Chưa đánh giá' : key === 'care' ? 'Không có lịch chăm sóc' : plant[key as keyof FilterPlant];
    const label = typeof value === 'string' && value.trim() ? value : 'Chưa có dữ liệu';
    return selected.includes(label);
  });
}
