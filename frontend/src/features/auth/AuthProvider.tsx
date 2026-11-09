import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  saveSession,
  getSession,
  clearSession,
  StorageError,
} from '@/services/api/tokenStorage';
import { registerUnauthorizedHandler } from '@/services/api/apiClient';
import { queryClient, clearQueryCache } from '@/services/query/queryClient';
import { queryKeys } from '@/services/query/queryKeys';
import { loginApi, registerApi, getMeApi } from './authService';
import type {
  AuthContextValue,
  AuthStatus,
} from './authTypes';
import type {
  AuthSession,
  AuthUserSummary,
  LoginRequestDto,
  LoginResponseDto,
  RegisterRequestDto,
  RegisterResponseDto,
  UserProfileDto,
} from '@/services/api/apiTypes';
import { AppApiError } from '@/services/api/apiError';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('initializing');
  const [user, setUser] = useState<AuthUserSummary | null>(null);
  const [profile, setProfile] = useState<UserProfileDto | null>(null);
  const [storageError, setStorageError] = useState<StorageError | null>(null);
  const isLoggingOutRef = useRef(false);

  const performLogout = useCallback(async (): Promise<void> => {
    if (isLoggingOutRef.current) {
      return;
    }
    isLoggingOutRef.current = true;

    let deleteError: StorageError | null = null;
    try {
      // Step 1: Cancel in-flight queries and clear all user cached data
      await clearQueryCache();
      setUser(null);
      setProfile(null);
      setStorageError(null);

      // Step 2: Clear stored session from SecureStore
      try {
        await clearSession();
      } catch (err) {
        deleteError =
          err instanceof StorageError
            ? err
            : new StorageError({
                code: 'DELETE_FAILED',
                operation: 'delete',
                message: 'Xóa phiên đăng nhập khỏi SecureStore thất bại.',
                cause: err,
              });
        setStorageError(deleteError);
      }
    } finally {
      setStatus('unauthenticated');
      isLoggingOutRef.current = false;
    }

    if (deleteError) {
      throw deleteError;
    }
  }, []);

  // Listen for 401 Unauthorized signals from protected API calls
  useEffect(() => {
    const unregister = registerUnauthorizedHandler(() => {
      performLogout().catch(() => {
        // Handled silently for automated 401 logout
      });
    });
    return unregister;
  }, [performLogout]);

  // Load and verify session from SecureStore on app launch
  const loadSession = useCallback(async (): Promise<void> => {
    setStatus('initializing');
    setStorageError(null);

    try {
      let session: AuthSession | null = null;
      try {
        session = await getSession();
      } catch (err) {
        // SecureStore read failure: DO NOT delete session, DO NOT treat as unauthenticated!
        const stErr =
          err instanceof StorageError
            ? err
            : new StorageError({
                code: 'READ_FAILED',
                operation: 'read',
                message: 'Không thể truy cập dữ liệu phiên đăng nhập trên thiết bị.',
                cause: err,
              });
        setStorageError(stErr);
        setStatus('storage-error');
        return;
      }

      if (!session || !session.accessToken || !session.user) {
        setStatus('unauthenticated');
        return;
      }

      // Session exists in SecureStore: verify token by fetching current user profile
      try {
        const userProfile = await getMeApi();
        setProfile(userProfile);
        queryClient.setQueryData(queryKeys.user.me, userProfile);
        setUser({
          id: userProfile.id,
          fullName: userProfile.fullName,
          email: userProfile.email,
          roles: userProfile.roles,
        });
        setStatus('authenticated');
      } catch (err) {
        if (err instanceof AppApiError && err.statusCode === 401) {
          // Token expired or invalid on backend: purge session
          await performLogout().catch(() => {
            // Handled
          });
        } else {
          // Network error, timeout, or 5xx: retain stored session so user is not locked out offline
          setUser(session.user);
          setStatus('authenticated');
        }
      }
    } catch {
      setStatus('unauthenticated');
    }
  }, [performLogout]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = useCallback(
    async (request: LoginRequestDto): Promise<LoginResponseDto> => {
      // Step 1: Purge any residual query cache from a previous session to prevent data leakage
      await clearQueryCache();

      // Step 2: Call real backend login API
      const loginData = await loginApi(request);

      // Step 3: Persist session to SecureStore (throws StorageError if storage fails)
      const newSession: AuthSession = {
        accessToken: loginData.accessToken,
        tokenType: loginData.tokenType,
        expiresIn: loginData.expiresIn,
        user: loginData.user,
        savedAt: Date.now(),
      };

      // Only transition to authenticated if saveSession succeeds
      await saveSession(newSession);

      // Step 4: Update Auth context state
      setUser(loginData.user);
      setStatus('authenticated');
      setStorageError(null);

      // Note: React Query's useUserProfile in HomeScreen will fetch and cache profile on demand,
      // avoiding duplicate GET /users/me requests during login.

      return loginData;
    },
    []
  );

  const register = useCallback(
    async (request: RegisterRequestDto): Promise<RegisterResponseDto> => {
      return await registerApi(request);
    },
    []
  );

  const refreshProfile = useCallback(async (): Promise<UserProfileDto | null> => {
    try {
      const userProfile = await getMeApi();
      setProfile(userProfile);
      queryClient.setQueryData(queryKeys.user.me, userProfile);
      setUser({
        id: userProfile.id,
        fullName: userProfile.fullName,
        email: userProfile.email,
        roles: userProfile.roles,
      });
      return userProfile;
    } catch (err) {
      if (err instanceof AppApiError && err.statusCode === 401) {
        await performLogout().catch(() => {
          // Handled
        });
      }
      return null;
    }
  }, [performLogout]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      profile,
      storageError,
      login,
      register,
      logout: performLogout,
      refreshProfile,
      retryLoadSession: loadSession,
    }),
    [status, user, profile, storageError, login, register, performLogout, refreshProfile, loadSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
