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
  const isLoggingOutRef = useRef(false);

  const performLogout = useCallback(async () => {
    if (isLoggingOutRef.current) {
      return;
    }
    isLoggingOutRef.current = true;

    try {
      try {
        await clearSession();
      } catch {
        // Storage clearing failure must NOT block state transition to unauthenticated
      }
      await clearQueryCache();
      setUser(null);
      setProfile(null);
      setStatus('unauthenticated');
    } finally {
      isLoggingOutRef.current = false;
    }
  }, []);

  // Listen for 401 Unauthorized signals from protected API calls
  useEffect(() => {
    const unregister = registerUnauthorizedHandler(() => {
      performLogout();
    });
    return unregister;
  }, [performLogout]);

  // Load and verify session from SecureStore on app launch
  const loadSession = useCallback(async () => {
    try {
      let session: AuthSession | null = null;
      try {
        session = await getSession();
      } catch {
        // Storage I/O failure on startup: safely treat as unauthenticated
        setStatus('unauthenticated');
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
          await performLogout();
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
      await saveSession(newSession);

      // Step 4: Update Auth context state
      setUser(loginData.user);
      setStatus('authenticated');

      // Step 5: Prefetch / refresh user profile asynchronously
      getMeApi()
        .then((p) => {
          setProfile(p);
          queryClient.setQueryData(queryKeys.user.me, p);
          setUser({
            id: p.id,
            fullName: p.fullName,
            email: p.email,
            roles: p.roles,
          });
        })
        .catch(() => {
          // Non-blocking background fetch
        });

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
        await performLogout();
      }
      return null;
    }
  }, [performLogout]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      profile,
      login,
      register,
      logout: performLogout,
      refreshProfile,
    }),
    [status, user, profile, login, register, performLogout, refreshProfile]
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
