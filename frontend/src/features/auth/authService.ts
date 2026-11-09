import { apiClient } from '@/services/api/apiClient';
import type {
  ApiResponse,
  LoginRequestDto,
  LoginResponseDto,
  RegisterRequestDto,
  RegisterResponseDto,
  UserProfileDto,
} from '@/services/api/apiTypes';

export async function loginApi(request: LoginRequestDto): Promise<LoginResponseDto> {
  const response = await apiClient.post<ApiResponse<LoginResponseDto>>('/auth/login', request);
  if (!response.data?.data) {
    throw new Error('Dữ liệu phản hồi từ máy chủ không hợp lệ.');
  }
  return response.data.data;
}

export async function registerApi(request: RegisterRequestDto): Promise<RegisterResponseDto> {
  const response = await apiClient.post<ApiResponse<RegisterResponseDto>>('/auth/register', request);
  if (!response.data?.data) {
    throw new Error('Dữ liệu phản hồi từ máy chủ không hợp lệ.');
  }
  return response.data.data;
}

export async function getMeApi(): Promise<UserProfileDto> {
  const response = await apiClient.get<ApiResponse<UserProfileDto>>('/users/me');
  if (!response.data?.data) {
    throw new Error('Không thể tải thông tin hồ sơ người dùng.');
  }
  return response.data.data;
}
