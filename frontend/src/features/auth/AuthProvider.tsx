import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
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
  const [isLoading, setIsLoading] = useState(false);

  const performLogout = useCallback(async () => {
    try {
      await clearSession();
    } catch {
      // Ignore storage clear failure
    }
    clearQueryCache();
    setUser(null);
    setProfile(null);
    setStatus('unauthenticated');
  }, []);

  // Listen for 401s from any API request across the app
  useEffect(() => {
    const unregister = registerUnauthorizedHandler(() => {
      performLogout();
    });
    return unregister;
  }, [performLogout]);

  // Load session from SecureStore on startup
  const loadSession = useCallback(async () => {
    try {
      const session = await getSession();
      if (!session || !session.accessToken || !session.user) {
        setStatus('unauthenticated');
        return;
      }

      setUser(session.user);
      setStatus('authenticated');

      // Verify token validity by fetching user profile
      try {
        const userProfile = await getMeApi();
        setProfile(userProfile);
        queryClient.setQueryData(queryKeys.user.me, userProfile);
        setUser((prev) => ({
          id: userProfile.id,
          fullName: userProfile.fullName,
          email: userProfile.email,
          roles: userProfile.roles,
        }));
      } catch (err) {
        if (err instanceof AppApiError && err.statusCode === 401) {
          await performLogout();
        }
        // If network error, retain cached user so user is not locked out
      }
    } catch {
      await performLogout();
    }
  }, [performLogout]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = useCallback(
    async (request: LoginRequestDto): Promise<LoginResponseDto> => {
      setIsLoading(true);
      try {
        const loginData = await loginApi(request);

        const newSession: AuthSession = {
          accessToken: loginData.accessToken,
          tokenType: loginData.tokenType,
          expiresIn: loginData.expiresIn,
          user: loginData.user,
          savedAt: Date.now(),
        };

        await saveSession(newSession);

        setUser(loginData.user);
        setStatus('authenticated');

        // Refresh profile in background
        getMeApi()
          .then((p) => {
            setProfile(p);
            queryClient.setQueryData(queryKeys.user.me, p);
          })
          .catch(() => {
            // Non-blocking
          });

        return loginData;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const register = useCallback(
    async (request: RegisterRequestDto): Promise<RegisterResponseDto> => {
      setIsLoading(true);
      try {
        return await registerApi(request);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const refreshProfile = useCallback(async (): Promise<UserProfileDto | null> => {
    try {
      const userProfile = await getMeApi();
      setProfile(userProfile);
      queryClient.setQueryData(queryKeys.user.me, userProfile);
      setUser((prev) => ({
        id: userProfile.id,
        fullName: userProfile.fullName,
        email: userProfile.email,
        roles: userProfile.roles,
      }));
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
      isLoading,
      login,
      register,
      logout: performLogout,
      refreshProfile,
    }),
    [status, user, profile, isLoading, login, register, performLogout, refreshProfile]
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
