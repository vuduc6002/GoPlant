import { useMutation, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query/queryKeys';
import { getMeApi } from './authService';
import { useAuth } from './AuthProvider';
import type {
  LoginRequestDto,
  LoginResponseDto,
  RegisterRequestDto,
  RegisterResponseDto,
  UserProfileDto,
} from '@/services/api/apiTypes';
import { AppApiError } from '@/services/api/apiError';



/**
 * React Query hook to fetch and cache user profile.
 * Only active when the user is authenticated.
 */
export function useUserProfile() {
  const { status } = useAuth();

  return useQuery<UserProfileDto, AppApiError>({
    queryKey: queryKeys.user.me,
    queryFn: getMeApi,
    enabled: status === 'authenticated',
  });
}

/**
 * Mutation hook for login backed by TanStack React Query.
 */
export function useLoginMutation() {
  const { login } = useAuth();

  return useMutation<LoginResponseDto, AppApiError, LoginRequestDto>({
    mutationFn: (data: LoginRequestDto) => login(data),
  });
}

/**
 * Mutation hook for register backed by TanStack React Query.
 */
export function useRegisterMutation() {
  const { register } = useAuth();

  return useMutation<RegisterResponseDto, AppApiError, RegisterRequestDto>({
    mutationFn: (data: RegisterRequestDto) => register(data),
  });
}
