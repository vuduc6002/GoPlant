import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../features/auth/AuthProvider';
import { useUserProfile } from '../features/auth/authHooks';
import type { AuthContextValue } from '../features/auth/authTypes';
import * as tokenStorage from '../services/api/tokenStorage';
import * as authService from '../features/auth/authService';
import { StorageError } from '../services/api/tokenStorage';
import { queryClient } from '../services/query/queryClient';
import { queryKeys } from '../services/query/queryKeys';
import { AppApiError } from '../services/api/apiError';
import type { AuthSession, UserProfileDto } from '../services/api/apiTypes';

describe('Auth Flow, Session Recovery & Cache Isolation', () => {
  const mockUser = {
    id: 'usr_test_1',
    fullName: 'Lê Văn C',
    email: 'levanc@example.com',
    roles: ['ROLE_USER'],
  };

  const mockSession: AuthSession = {
    accessToken: 'test-jwt-token-abc',
    tokenType: 'Bearer',
    expiresIn: 3600,
    user: mockUser,
    savedAt: Date.now(),
  };

  const mockProfile: UserProfileDto = {
    id: 'usr_test_1',
    fullName: 'Lê Văn C',
    email: 'levanc@example.com',
    phoneNumber: '0901234567',
    recoveryEmail: null,
    preferredDevice: 'MOBILE',
    status: 'ACTIVE',
    avatarUrl: null,
    roles: ['ROLE_USER'],
    createdAt: '2026-01-01T00:00:00Z',
  };

  let root: ReturnType<typeof createRoot> | null = null;
  let container: HTMLDivElement | null = null;
  let auth: AuthContextValue | null = null;
  let renderedProfile: UserProfileDto | undefined = undefined;

  function Consumer() {
    auth = useAuth();
    const { data: profile } = useUserProfile();
    renderedProfile = profile;
    return (
      <div>
        <span id="status">{auth.status}</span>
        <span id="profile">{profile ? profile.fullName : 'No Profile'}</span>
      </div>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    auth = null;
    renderedProfile = undefined;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    if (container) {
      container.remove();
      container = null;
    }
    queryClient.clear();
  });

  async function mountProvider(waitMs = 60) {
    act(() => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Consumer />
          </AuthProvider>
        </QueryClientProvider>
      );
    });
    // Allow initial loadSession async operations to complete
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    });
  }

  describe('Startup Session Restore', () => {
    it('transitions to unauthenticated when no session is found', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(null);

      await mountProvider();

      expect(auth!.status).toBe('unauthenticated');
      expect(auth!.user).toBeNull();
      expect(auth!.profile).toBeNull();
      expect(auth!.storageError).toBeNull();
    });

    it('transitions to authenticated and populates React Query cache when valid session exists', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession);
      vi.spyOn(authService, 'getMeApi').mockResolvedValue(mockProfile);

      await mountProvider();

      expect(auth!.status).toBe('authenticated');
      expect(auth!.user?.id).toBe('usr_test_1');
      expect(auth!.profile?.fullName).toBe('Lê Văn C');

      // Verify profile is cached in React Query with correct key
      const cachedProfile = queryClient.getQueryData(queryKeys.user.me);
      expect(cachedProfile).toEqual(mockProfile);
    });

    it('transitions to storage-error when SecureStore read fails, WITHOUT deleting session data or faking login', async () => {
      const readError = new StorageError({
        code: 'READ_FAILED',
        operation: 'read',
        message: 'Lỗi đọc SecureStore tạm thời',
      });
      vi.spyOn(tokenStorage, 'getSession').mockRejectedValue(readError);
      const clearSpy = vi.spyOn(tokenStorage, 'clearSession');

      await mountProvider();

      expect(auth!.status).toBe('storage-error');
      expect(auth!.storageError).toBeDefined();
      expect(auth!.storageError?.code).toBe('READ_FAILED');

      // Must NOT treat as unauthenticated
      expect(auth!.status).not.toBe('unauthenticated');
      // Must NOT delete session on read failure
      expect(clearSpy).not.toHaveBeenCalled();
    });

    it('allows retry after storage-error and transitions to authenticated when retry succeeds', async () => {
      const readError = new StorageError({
        code: 'READ_FAILED',
        operation: 'read',
        message: 'Lỗi đọc SecureStore tạm thời',
      });

      const getSessionSpy = vi
        .spyOn(tokenStorage, 'getSession')
        .mockRejectedValueOnce(readError) // First attempt fails
        .mockResolvedValueOnce(mockSession); // Second attempt succeeds

      vi.spyOn(authService, 'getMeApi').mockResolvedValue(mockProfile);

      await mountProvider();
      expect(auth!.status).toBe('storage-error');

      // Retry loading session
      await act(async () => {
        await auth!.retryLoadSession();
        await new Promise((resolve) => setTimeout(resolve, 60));
      });

      expect(getSessionSpy).toHaveBeenCalledTimes(2);
      expect(auth!.status).toBe('authenticated');
      expect(auth!.storageError).toBeNull();
      expect(auth!.user?.id).toBe('usr_test_1');
    });

    it('retains stored session for offline access when backend is unreachable on startup', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession);
      vi.spyOn(authService, 'getMeApi').mockRejectedValue(
        new AppApiError({
          message: 'Network error',
          code: 'NETWORK_ERROR',
          isNetworkError: true,
        })
      );

      await mountProvider();

      // User remains authenticated offline using stored session
      expect(auth!.status).toBe('authenticated');
      expect(auth!.user?.id).toBe('usr_test_1');
    });

    it('logs out and purges session when backend returns 401 on startup token verification', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession);
      vi.spyOn(authService, 'getMeApi').mockRejectedValue(
        new AppApiError({
          message: 'Token expired',
          code: 'UNAUTHORIZED',
          statusCode: 401,
        })
      );
      const clearSpy = vi.spyOn(tokenStorage, 'clearSession').mockResolvedValue();

      await mountProvider();

      expect(clearSpy).toHaveBeenCalled();
      expect(auth!.status).toBe('unauthenticated');
      expect(auth!.user).toBeNull();
    });
  });

  describe('Login, Single Profile Fetch & Cache Isolation', () => {
    it('executes exactly ONE getMeApi call upon login via useUserProfile and populates cache', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(null);
      const saveSpy = vi.spyOn(tokenStorage, 'saveSession').mockResolvedValue();
      const getMeSpy = vi.spyOn(authService, 'getMeApi').mockResolvedValue(mockProfile);
      vi.spyOn(authService, 'loginApi').mockResolvedValue({
        accessToken: 'new-token-login',
        tokenType: 'Bearer',
        expiresIn: 3600,
        user: mockUser,
      });

      await mountProvider();
      expect(auth!.status).toBe('unauthenticated');
      expect(getMeSpy).not.toHaveBeenCalled();

      // Login
      await act(async () => {
        await auth!.login({ account: '0901234567', password: 'Password123@' });
      });

      // Allow React Query useUserProfile to fetch and commit component re-render
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 120));
      });

      // Saved session
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'new-token-login',
          user: mockUser,
        })
      );

      // Authenticated state
      expect(auth!.status).toBe('authenticated');
      expect(auth!.user?.fullName).toBe('Lê Văn C');

      // getMeApi was called EXACTLY ONCE via React Query
      expect(getMeSpy).toHaveBeenCalledTimes(1);

      // Rendered consumer received the profile
      expect(renderedProfile?.fullName).toBe('Lê Văn C');

      // Profile is cached in queryClient
      const cached = queryClient.getQueryData(queryKeys.user.me);
      expect(cached).toEqual(mockProfile);
    });

    it('does not transition to authenticated when saveSession fails', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(null);
      vi.spyOn(authService, 'loginApi').mockResolvedValue({
        accessToken: 'token-fail-save',
        tokenType: 'Bearer',
        expiresIn: 3600,
        user: mockUser,
      });
      vi.spyOn(tokenStorage, 'saveSession').mockRejectedValue(
        new StorageError({
          code: 'WRITE_FAILED',
          operation: 'write',
          message: 'Không thể ghi vào SecureStore',
        })
      );

      await mountProvider();
      expect(auth!.status).toBe('unauthenticated');

      let loginError: unknown = null;
      await act(async () => {
        try {
          await auth!.login({ account: '0901234567', password: 'Password123@' });
        } catch (err) {
          loginError = err;
        }
        await new Promise((resolve) => setTimeout(resolve, 60));
      });

      expect(loginError).toBeInstanceOf(StorageError);
      // Status must NOT be authenticated
      expect(auth!.status).toBe('unauthenticated');
    });

    it('isolates cache between accounts: cancels queries and purges cache on logout and before login', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession);
      vi.spyOn(authService, 'getMeApi').mockResolvedValue(mockProfile);
      vi.spyOn(tokenStorage, 'clearSession').mockResolvedValue();

      await mountProvider();
      expect(auth!.status).toBe('authenticated');

      // User 1 has data in cache
      queryClient.setQueryData(['test', 'data'], { accountSecret: 'User1Data' });
      expect(queryClient.getQueryData(['test', 'data'])).toEqual({ accountSecret: 'User1Data' });

      // User 1 logs out
      await act(async () => {
        await auth!.logout();
        await new Promise((resolve) => setTimeout(resolve, 60));
      });

      // Cache is completely cleared
      expect(queryClient.getQueryData(['test', 'data'])).toBeUndefined();
      expect(queryClient.getQueryData(queryKeys.user.me)).toBeUndefined();
      expect(auth!.status).toBe('unauthenticated');
    });
  });

  describe('Logout Failure, Storage Cleanup Error & Retry Mechanism', () => {
    it('sets storage-cleanup-error when clearSession fails and does NOT transition to unauthenticated', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession);
      vi.spyOn(authService, 'getMeApi').mockResolvedValue(mockProfile);
      vi.spyOn(tokenStorage, 'clearSession').mockRejectedValue(
        new StorageError({
          code: 'DELETE_FAILED',
          operation: 'delete',
          message: 'SecureStore delete failed',
        })
      );

      await mountProvider();
      expect(auth!.status).toBe('authenticated');

      let logoutError: unknown = null;
      await act(async () => {
        try {
          await auth!.logout();
        } catch (err) {
          logoutError = err;
        }
        await new Promise((resolve) => setTimeout(resolve, 60));
      });

      expect(logoutError).toBeInstanceOf(StorageError);
      expect((logoutError as StorageError).code).toBe('DELETE_FAILED');

      // Status must be storage-cleanup-error, NOT unauthenticated
      expect(auth!.status).toBe('storage-cleanup-error');
      expect(auth!.storageError?.code).toBe('DELETE_FAILED');

      // State is reset so user cannot access protected data
      expect(auth!.user).toBeNull();
      expect(auth!.profile).toBeNull();
      // Cache was cleared immediately
      expect(queryClient.getQueryData(queryKeys.user.me)).toBeUndefined();
    });

    it('allows retryClearSession to clear session and transition to unauthenticated on success', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession);
      vi.spyOn(authService, 'getMeApi').mockResolvedValue(mockProfile);

      const clearSessionSpy = vi
        .spyOn(tokenStorage, 'clearSession')
        .mockRejectedValueOnce(
          new StorageError({
            code: 'DELETE_FAILED',
            operation: 'delete',
            message: 'SecureStore delete failed initially',
          })
        )
        .mockResolvedValueOnce(undefined); // Second try succeeds

      const getSessionSpy = vi.spyOn(tokenStorage, 'getSession');

      await mountProvider();
      expect(auth!.status).toBe('authenticated');

      // Initial logout fails to delete
      await act(async () => {
        try {
          await auth!.logout();
        } catch {
          // Handled
        }
        await new Promise((resolve) => setTimeout(resolve, 60));
      });

      expect(auth!.status).toBe('storage-cleanup-error');
      expect(auth!.storageError?.code).toBe('DELETE_FAILED');

      // Call retryClearSession
      await act(async () => {
        await auth!.retryClearSession();
        await new Promise((resolve) => setTimeout(resolve, 60));
      });

      // Now successfully transitioned to unauthenticated
      expect(auth!.status).toBe('unauthenticated');
      expect(auth!.storageError).toBeNull();
      expect(clearSessionSpy).toHaveBeenCalledTimes(2);

      // Crucial: retryClearSession must NOT call getSession or loadSession
      expect(getSessionSpy).toHaveBeenCalledTimes(1); // Only the initial mount call
    });

    it('keeps storage-cleanup-error if retryClearSession fails again', async () => {
      vi.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession);
      vi.spyOn(authService, 'getMeApi').mockResolvedValue(mockProfile);

      vi.spyOn(tokenStorage, 'clearSession').mockRejectedValue(
        new StorageError({
          code: 'DELETE_FAILED',
          operation: 'delete',
          message: 'Persistent delete error',
        })
      );

      await mountProvider();

      // Logout fails
      await act(async () => {
        try {
          await auth!.logout();
        } catch {
          // Handled
        }
        await new Promise((resolve) => setTimeout(resolve, 60));
      });

      expect(auth!.status).toBe('storage-cleanup-error');

      // Retry fails again
      let retryError: unknown = null;
      await act(async () => {
        try {
          await auth!.retryClearSession();
        } catch (err) {
          retryError = err;
        }
        await new Promise((resolve) => setTimeout(resolve, 60));
      });

      expect(retryError).toBeInstanceOf(StorageError);
      expect(auth!.status).toBe('storage-cleanup-error');
      expect(auth!.storageError?.code).toBe('DELETE_FAILED');
    });
  });
});
