import { useMutation, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query/queryKeys';
import { getMeApi, loginApi, registerApi } from './authService';
import { useAuth } from './AuthProvider';
import type {
  LoginRequestDto,
  LoginResponseDto,
  RegisterRequestDto,
  RegisterResponseDto,
  UserProfileDto,
} from '@/services/api/apiTypes';

export { useAuth };

/**
 * React Query hook to fetch and cache user profile
 */
export function useUserProfile() {
  const { status } = useAuth();

  return useQuery<UserProfileDto>({
    queryKey: queryKeys.user.me,
    queryFn: getMeApi,
    enabled: status === 'authenticated',
  });
}

/**
 * Mutation hook for login
 */
export function useLoginMutation() {
  const { login } = useAuth();

  return useMutation<LoginResponseDto, Error, LoginRequestDto>({
    mutationFn: (data: LoginRequestDto) => login(data),
  });
}

/**
 * Mutation hook for register
 */
export function useRegisterMutation() {
  const { register } = useAuth();

  return useMutation<RegisterResponseDto, Error, RegisterRequestDto>({
    mutationFn: (data: RegisterRequestDto) => register(data),
  });
}
