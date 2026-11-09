/**
 * Standard backend response envelope matching com.cmc.plant_care_backend.common.response.ApiResponse
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: ApiErrorDetail;
  timestamp?: string;
}

/**
 * Standard backend error detail matching com.cmc.plant_care_backend.common.response.ErrorDetail
 */
export interface ApiErrorDetail {
  code: string;
  message: string;
  field?: string;
}

/**
 * User summary returned upon successful login
 * Note: email can be null when the user registers with a phone number.
 */
export interface AuthUserSummary {
  id: string;
  fullName: string;
  email: string | null;
  roles: string[];
}

/**
 * Request payload for POST /api/v1/auth/login
 */
export interface LoginRequestDto {
  account: string;
  password: string;
}

/**
 * Response data for POST /api/v1/auth/login
 */
export interface LoginResponseDto {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: AuthUserSummary;
}

export type PreferredDevice = 'MOBILE' | 'PC';

/**
 * Request payload for POST /api/v1/auth/register
 */
export interface RegisterRequestDto {
  fullName: string;
  account: string;
  recoveryEmail?: string;
  password: string;
  preferredDevice?: PreferredDevice;
}

/**
 * Response data for POST /api/v1/auth/register
 */
export interface RegisterResponseDto {
  userId: string;
  fullName: string;
  message: string;
}

/**
 * Response data for GET /api/v1/users/me
 * Note: email can be null when the user registers with a phone number.
 */
export interface UserProfileDto {
  id: string;
  fullName: string;
  email: string | null;
  phoneNumber?: string | null;
  recoveryEmail?: string | null;
  preferredDevice?: PreferredDevice;
  status: string;
  avatarUrl?: string | null;
  roles: string[];
  createdAt?: string;
}

/**
 * Persisted session representation stored in SecureStore
 */
export interface AuthSession {
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
  user: AuthUserSummary;
  savedAt: number;
}
