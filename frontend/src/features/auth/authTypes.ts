import type {
  AuthUserSummary,
  LoginRequestDto,
  LoginResponseDto,
  RegisterRequestDto,
  RegisterResponseDto,
  UserProfileDto,
} from '@/services/api/apiTypes';

export type AuthStatus = 'initializing' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUserSummary | null;
  profile: UserProfileDto | null;
  isLoading: boolean;
  login: (request: LoginRequestDto) => Promise<LoginResponseDto>;
  register: (request: RegisterRequestDto) => Promise<RegisterResponseDto>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<UserProfileDto | null>;
}
