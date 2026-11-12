export type CameraStatus = 'ONLINE' | 'OFFLINE' | 'ERROR';

export interface CameraDto {
  id: string;
  gardenId: string;
  name: string;
  locationDesc: string | null;
  status: CameraStatus;
  connectionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCameraRequestDto {
  name: string;
  locationDesc?: string;
  connectionNote?: string;
}

export interface UpdateCameraRequestDto {
  name?: string;
  locationDesc?: string;
  status?: CameraStatus;
  connectionNote?: string;
}

export const CAMERA_STATUS_OPTIONS: {
  value: CameraStatus;
  label: string;
  tone: 'mint' | 'plain' | 'danger';
}[] = [
  { value: 'ONLINE', label: 'Đã ghi nhận Online', tone: 'mint' },
  { value: 'OFFLINE', label: 'Đã ghi nhận Offline', tone: 'plain' },
  { value: 'ERROR', label: 'Đã ghi nhận lỗi', tone: 'danger' },
];

export function getCameraStatusMeta(status?: string | null): {
  label: string;
  tone: 'mint' | 'plain' | 'danger';
} {
  switch (status) {
    case 'ONLINE':
      return { label: 'Đã ghi nhận Online', tone: 'mint' };
    case 'ERROR':
      return { label: 'Đã ghi nhận lỗi', tone: 'danger' };
    case 'OFFLINE':
    default:
      return { label: 'Đã ghi nhận Offline', tone: 'plain' };
  }
}

export const CAMERA_MANUAL_STATUS_DISCLAIMER =
  'Trạng thái được ghi nhận thủ công, chưa phải kết quả kiểm tra kết nối hoặc luồng video thực tế.';

export const CAMERA_SECURITY_HELPER_NOTE =
  'Không nhập mật khẩu, token hoặc thông tin đăng nhập vào ghi chú kết nối.';

export const CAMERA_MONITORING_CTA_TITLE = 'Quản lý thông tin camera theo từng khu vườn';

export const CAMERA_MONITORING_CTA_SUBTITLE =
  'Chỉ quản lý metadata, chưa hỗ trợ xem video trực tiếp';
