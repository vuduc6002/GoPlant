import type {
  AuthUserSummary,
  LoginRequestDto,
  LoginResponseDto,
  RegisterRequestDto,
  RegisterResponseDto,
  UserProfileDto,
} from '@/services/api/apiTypes';
import type { StorageError } from '@/services/api/tokenStorage';

export type AuthStatus =
  | 'initializing'
  | 'authenticated'
  | 'unauthenticated'
  | 'storage-error';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUserSummary | null;
  profile: UserProfileDto | null;
  storageError: StorageError | null;
  login: (request: LoginRequestDto) => Promise<LoginResponseDto>;
  register: (request: RegisterRequestDto) => Promise<RegisterResponseDto>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<UserProfileDto | null>;
  retryLoadSession: () => Promise<void>;
}
