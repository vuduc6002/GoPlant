import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import {
  deleteMedia,
  getMediaReadUrl,
  uploadMedia,
} from '@/features/media/mediaApi';
import {
  useDeleteMediaMutation,
  useMediaReadUrl,
  useUploadMediaMutation,
} from '@/features/media/mediaHooks';
import type { LocalImageFile, MediaReadUrlResponse } from '@/features/media/mediaTypes';
import {
  assertValidImageFile,
  MAX_MEDIA_FILE_SIZE_BYTES,
  validateLocalImageFile,
} from '@/features/media/mediaValidation';
import { apiClient } from '@/services/api/apiClient';
import { AppApiError } from '@/services/api/apiError';
import type { AuthSession, UserProfileDto } from '@/services/api/apiTypes';
import * as tokenStorage from '@/services/api/tokenStorage';
import { queryKeys } from '@/services/query/queryKeys';

const VALID_UUID_1 = '11111111-1111-1111-1111-111111111111';
const VALID_UUID_2 = '22222222-2222-2222-2222-222222222222';
const VALID_UUID_USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const VALID_UUID_SHARED = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function getFutureIsoString(seconds = 300): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

const mockUserA = {
  id: 'usr_media_a',
  fullName: 'Nguyễn Văn Media A',
  email: 'media.a@goplant.vn',
  roles: ['ROLE_USER'],
};

const mockUserB = {
  id: 'usr_media_b',
  fullName: 'Lê Thị Media B',
  email: 'media.b@goplant.vn',
  roles: ['ROLE_USER'],
};

const profileA: UserProfileDto = {
  id: mockUserA.id,
  fullName: mockUserA.fullName,
  email: mockUserA.email,
  phoneNumber: null,
  recoveryEmail: null,
  preferredDevice: 'MOBILE',
  status: 'ACTIVE',
  avatarUrl: null,
  roles: ['ROLE_USER'],
  createdAt: '2026-01-01T00:00:00Z',
};

const profileB: UserProfileDto = {
  ...profileA,
  id: mockUserB.id,
  fullName: mockUserB.fullName,
  email: mockUserB.email,
};

const sessionA: AuthSession = {
  accessToken: 'jwt-media-token-a',
  tokenType: 'Bearer',
  expiresIn: 3600,
  user: mockUserA,
  savedAt: Date.now(),
};

const sessionB: AuthSession = {
  accessToken: 'jwt-media-token-b',
  tokenType: 'Bearer',
  expiresIn: 3600,
  user: mockUserB,
  savedAt: Date.now(),
};

async function flushAsync(ms = 25) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function waitFor(assertion: () => void, timeoutMs = 1500): Promise<void> {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      assertion();
      return;
    } catch (err) {
      lastError = err;
      await flushAsync(15);
    }
  }
  assertion();
  if (lastError) {
    throw lastError;
  }
}

describe('G5.5.2b.2 — Frontend Media Module Hardening Tests', () => {
  const originalAdapter = apiClient.defaults.adapter;
  let queryClient: QueryClient;
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    tokenStorage._resetWebMemorySession();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false },
      },
    });

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
    tokenStorage._resetWebMemorySession();
    queryClient.clear();
    apiClient.defaults.adapter = originalAdapter;
    vi.restoreAllMocks();
  });

  function mountWithProviders(ui: React.ReactElement) {
    act(() => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>{ui}</AuthProvider>
        </QueryClientProvider>
      );
    });
  }

  describe('1. Media Client-Side Validation', () => {
    it('verifies max file size constant is strictly 5MB', () => {
      expect(MAX_MEDIA_FILE_SIZE_BYTES).toBe(5 * 1024 * 1024);
    });

    it('accepts valid JPEG, PNG, and WebP files under 5MB', () => {
      const jpegFile: LocalImageFile = {
        uri: 'file:///path/to/test.jpg',
        name: 'test.jpg',
        type: 'image/jpeg',
        size: 1024 * 1024,
      };
      const pngFile: LocalImageFile = {
        uri: 'file:///path/to/test.png',
        name: 'test.png',
        type: 'image/png',
        size: 2 * 1024 * 1024,
      };
      const webpFile: LocalImageFile = {
        uri: 'file:///path/to/test.webp',
        name: 'test.webp',
        type: 'image/webp',
        size: 4 * 1024 * 1024,
      };

      expect(validateLocalImageFile(jpegFile).valid).toBe(true);
      expect(validateLocalImageFile(pngFile).valid).toBe(true);
      expect(validateLocalImageFile(webpFile).valid).toBe(true);
    });

    it('rejects files larger than 5MB', () => {
      const oversizedFile: LocalImageFile = {
        uri: 'file:///path/to/huge.jpg',
        name: 'huge.jpg',
        type: 'image/jpeg',
        size: 5 * 1024 * 1024 + 1,
      };

      const result = validateLocalImageFile(oversizedFile);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('5MB');
    });

    it('rejects empty or 0-byte files', () => {
      const zeroByteFile: LocalImageFile = {
        uri: 'file:///path/to/empty.jpg',
        name: 'empty.jpg',
        type: 'image/jpeg',
        size: 0,
      };

      const result = validateLocalImageFile(zeroByteFile);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('0 bytes');
    });

    it('rejects unsupported MIME types such as SVG, GIF, PDF', () => {
      const svgFile: LocalImageFile = {
        uri: 'file:///path/to/icon.svg',
        name: 'icon.svg',
        type: 'image/svg+xml',
        size: 1000,
      };
      const gifFile: LocalImageFile = {
        uri: 'file:///path/to/anim.gif',
        name: 'anim.gif',
        type: 'image/gif',
        size: 1000,
      };

      expect(validateLocalImageFile(svgFile).valid).toBe(false);
      expect(validateLocalImageFile(gifFile).valid).toBe(false);
    });

    it('assertValidImageFile throws AppApiError with VALIDATION_ERROR code', () => {
      expect(() =>
        assertValidImageFile({
          uri: '',
          name: 'bad.txt',
          type: 'text/plain',
        })
      ).toThrow(AppApiError);

      try {
        assertValidImageFile({
          uri: 'file:///bad.pdf',
          name: 'bad.pdf',
          type: 'application/pdf',
        });
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppApiError);
        expect(err.code).toBe('VALIDATION_ERROR');
        expect(err.field).toBe('file');
      }
    });
  });

  describe('2. Media API Client & Response Schema Validation', () => {
    it('uploadMedia builds multipart FormData and posts to GoPlant backend', async () => {
      await tokenStorage.saveSession(sessionA);
      const calls: { method?: string; url?: string; auth?: unknown; hasFormData?: boolean }[] = [];

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        calls.push({
          method: config.method,
          url: config.url,
          auth: config.headers?.Authorization,
          hasFormData: config.data instanceof FormData,
        });

        if (config.url === '/media' && config.method === 'post') {
          return {
            status: 201,
            data: {
              success: true,
              data: {
                id: VALID_UUID_1,
                mimeType: 'image/jpeg',
                sizeBytes: 1024,
                width: 800,
                height: 600,
                status: 'READY',
                createdAt: '2026-11-13T00:00:00Z',
                updatedAt: '2026-11-13T00:00:00Z',
              },
            },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      const file: LocalImageFile = {
        uri: 'file:///photo.jpg',
        name: 'photo.jpg',
        type: 'image/jpeg',
        size: 1024,
      };

      const result = await uploadMedia(file, { expectedUserId: 'usr_media_a' });

      expect(calls.length).toBe(1);
      expect(calls[0].url).toBe('/media');
      expect(calls[0].method).toBe('post');
      expect(calls[0].auth).toBe(`Bearer ${sessionA.accessToken}`);
      expect(calls[0].hasFormData).toBe(true);

      expect(result.id).toBe(VALID_UUID_1);
      expect(result.status).toBe('READY');
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
    });

    it('rejects upload response with invalid UUID format', async () => {
      await tokenStorage.saveSession(sessionA);
      apiClient.defaults.adapter = vi.fn().mockResolvedValue({
        status: 201,
        data: {
          success: true,
          data: {
            id: 'not-a-uuid-string',
            mimeType: 'image/jpeg',
            sizeBytes: 1024,
            status: 'READY',
          },
        },
        headers: {},
        config: {},
      });

      await expect(
        uploadMedia({ uri: 'file:///test.jpg', name: 'test.jpg', type: 'image/jpeg', size: 1024 })
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    });

    it('rejects upload response with invalid sizeBytes (non-integer, <= 0 or > 5MB)', async () => {
      await tokenStorage.saveSession(sessionA);
      apiClient.defaults.adapter = vi.fn().mockResolvedValue({
        status: 201,
        data: {
          success: true,
          data: {
            id: VALID_UUID_1,
            mimeType: 'image/jpeg',
            sizeBytes: 10 * 1024 * 1024, // 10MB
            status: 'READY',
          },
        },
        headers: {},
        config: {},
      });

      await expect(
        uploadMedia({ uri: 'file:///test.jpg', name: 'test.jpg', type: 'image/jpeg', size: 1024 })
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    });

    it('getMediaReadUrl requests signed read URL from backend proxy and validates HTTPS & timestamp', async () => {
      await tokenStorage.saveSession(sessionA);
      const futureExpiry = getFutureIsoString(300);

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === `/media/${VALID_UUID_1}/read-url` && config.method === 'get') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                mediaId: VALID_UUID_1,
                readUrl: `https://storage.goplant.vn/signed/${VALID_UUID_1}?token=xyz`,
                expiresAt: futureExpiry,
              },
            },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      const result = await getMediaReadUrl(VALID_UUID_1, { expectedUserId: 'usr_media_a' });
      expect(result.mediaId).toBe(VALID_UUID_1);
      expect(result.readUrl).toContain(`signed/${VALID_UUID_1}`);
      expect(result.expiresAt).toBe(futureExpiry);
    });

    it('getMediaReadUrl rejects non-HTTPS or malformed read URL', async () => {
      await tokenStorage.saveSession(sessionA);
      apiClient.defaults.adapter = vi.fn().mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: {
            mediaId: VALID_UUID_1,
            readUrl: 'http://insecure.storage.goplant.vn/pic.jpg', // Insecure HTTP
            expiresAt: getFutureIsoString(300),
          },
        },
        headers: {},
        config: {},
      });

      await expect(getMediaReadUrl(VALID_UUID_1)).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      });
    });

    it('getMediaReadUrl rejects already expired expiresAt', async () => {
      await tokenStorage.saveSession(sessionA);
      apiClient.defaults.adapter = vi.fn().mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: {
            mediaId: VALID_UUID_1,
            readUrl: 'https://storage.goplant.vn/pic.jpg',
            expiresAt: '2020-01-01T00:00:00Z', // Expired
          },
        },
        headers: {},
        config: {},
      });

      await expect(getMediaReadUrl(VALID_UUID_1)).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      });
    });

    it('deleteMedia requests idempotent deletion from backend proxy', async () => {
      await tokenStorage.saveSession(sessionA);

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === `/media/${VALID_UUID_1}` && config.method === 'delete') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                message: 'Đã xóa tệp tin thành công.',
              },
            },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      const result = await deleteMedia(VALID_UUID_1, { expectedUserId: 'usr_media_a' });
      expect(result.message).toContain('thành công');
    });

    it('validates mediaId is valid UUID before sending API requests', async () => {
      await expect(getMediaReadUrl('')).rejects.toThrow(AppApiError);
      await expect(getMediaReadUrl('invalid-uuid')).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
      await expect(deleteMedia('not-a-uuid')).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('3. Single Session Snapshot & Isolation in React Hooks', () => {
    it('useMediaReadUrl disables query when user is not authenticated', async () => {
      const calls: string[] = [];
      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        calls.push(String(config.url));
        return { status: 200, data: { success: true, data: {} }, headers: {}, config };
      });

      function TestComponent() {
        useMediaReadUrl(VALID_UUID_1);
        return null;
      }

      mountWithProviders(<TestComponent />);
      await flushAsync(30);

      expect(calls).toEqual([]);
      const cached = queryClient.getQueryData(
        queryKeys.media.readUrl('__unauthenticated__', VALID_UUID_1)
      );
      expect(cached).toBeUndefined();
    });

    it('useMediaReadUrl queries signed URL when authenticated with user-scoped cache key', async () => {
      await tokenStorage.saveSession(sessionA);
      const futureExpiry = getFutureIsoString(300);

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === `/media/${VALID_UUID_2}/read-url`) {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                mediaId: VALID_UUID_2,
                readUrl: 'https://storage.goplant.vn/signed-a',
                expiresAt: futureExpiry,
              },
            },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      function TestComponent() {
        useMediaReadUrl(VALID_UUID_2);
        return null;
      }

      mountWithProviders(<TestComponent />);
      await flushAsync(50);

      const expectedKey = queryKeys.media.readUrl('usr_media_a', VALID_UUID_2);
      const cached = queryClient.getQueryData(expectedKey);
      expect(cached).toBeDefined();
      expect((cached as MediaReadUrlResponse)?.readUrl).toBe('https://storage.goplant.vn/signed-a');
    });

    it('useUploadMediaMutation rejects and preserves cache if session changes before response arrives', async () => {
      await tokenStorage.saveSession(sessionA);
      const pendingUploadA = createDeferred<void>();

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        const auth = String(config.headers?.Authorization ?? '');
        const isB = auth === `Bearer ${sessionB.accessToken}`;

        if (config.url === '/auth/login') {
          return { status: 200, data: { success: true, data: sessionB }, headers: {}, config };
        }
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: isB ? profileB : profileA }, headers: {}, config };
        }
        if (config.url === '/media' && config.method === 'post') {
          await pendingUploadA.promise;
          return {
            status: 201,
            data: {
              success: true,
              data: {
                id: VALID_UUID_USER_A,
                mimeType: 'image/jpeg',
                sizeBytes: 2048,
                width: 640,
                height: 480,
                status: 'READY',
                createdAt: '2026-11-13T00:00:00Z',
                updatedAt: '2026-11-13T00:00:00Z',
              },
            },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      let authCtx!: ReturnType<typeof useAuth>;
      let uploadMut!: ReturnType<typeof useUploadMediaMutation>;

      function Harness() {
        authCtx = useAuth();
        uploadMut = useUploadMediaMutation();
        return null;
      }

      mountWithProviders(<Harness />);
      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserA.id);
      });

      // Pre-seed User B's cache with existing data
      const userBInitialCache = [{ id: 'user-b-photo-1' }];
      queryClient.setQueryData(queryKeys.media.all(mockUserB.id), userBInitialCache);

      // Trigger User A upload while request is in flight
      const uploadPromiseA = uploadMut.mutateAsync({
        uri: 'file:///photo_a.jpg',
        name: 'photo_a.jpg',
        type: 'image/jpeg',
        size: 2048,
      });

      await flushAsync(10);

      // Switch to User B before User A's upload resolves
      await act(async () => {
        await authCtx.login({ account: mockUserB.email, password: 'pw' });
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserB.id);
      });

      // Now resolve User A's pending upload
      let rejectedError: any = null;
      await act(async () => {
        pendingUploadA.resolve();
        try {
          await uploadPromiseA;
        } catch (err) {
          rejectedError = err;
        }
        await flushAsync(30);
      });

      // Caller receives rejection with SESSION_USER_MISMATCH
      expect(rejectedError).toBeInstanceOf(AppApiError);
      expect(rejectedError.code).toBe('SESSION_USER_MISMATCH');

      // User B's cache was NOT polluted
      const cachedB = queryClient.getQueryData(queryKeys.media.all(mockUserB.id));
      expect(cachedB).toEqual(userBInitialCache);
    });

    it('useDeleteMediaMutation rejects and preserves cache if session changes before response arrives', async () => {
      await tokenStorage.saveSession(sessionA);
      const pendingDeleteA = createDeferred<void>();

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        const auth = String(config.headers?.Authorization ?? '');
        const isB = auth === `Bearer ${sessionB.accessToken}`;

        if (config.url === '/auth/login') {
          return { status: 200, data: { success: true, data: sessionB }, headers: {}, config };
        }
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: isB ? profileB : profileA }, headers: {}, config };
        }
        if (config.url === `/media/${VALID_UUID_SHARED}` && config.method === 'delete') {
          await pendingDeleteA.promise;
          return {
            status: 200,
            data: { success: true, data: { message: 'Đã xóa thành công' } },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      let authCtx!: ReturnType<typeof useAuth>;
      let deleteMut!: ReturnType<typeof useDeleteMediaMutation>;

      function Harness() {
        authCtx = useAuth();
        deleteMut = useDeleteMediaMutation();
        return null;
      }

      mountWithProviders(<Harness />);
      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserA.id);
      });

      // Pre-seed User B's cache for VALID_UUID_SHARED readUrl
      const userBReadUrlData = {
        mediaId: VALID_UUID_SHARED,
        readUrl: 'https://cdn.example.com/user_b_shared.jpg',
        expiresAt: getFutureIsoString(3600),
      };
      queryClient.setQueryData(
        queryKeys.media.readUrl(mockUserB.id, VALID_UUID_SHARED),
        userBReadUrlData
      );

      // Trigger delete for User A
      const deletePromiseA = deleteMut.mutateAsync(VALID_UUID_SHARED);
      await flushAsync(10);

      // Switch to User B
      await act(async () => {
        await authCtx.login({ account: mockUserB.email, password: 'pw' });
      });

      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserB.id);
      });

      // Resolve User A's delete
      let rejectedError: any = null;
      await act(async () => {
        pendingDeleteA.resolve();
        try {
          await deletePromiseA;
        } catch (err) {
          rejectedError = err;
        }
        await flushAsync(30);
      });

      // Caller receives rejection with SESSION_USER_MISMATCH
      expect(rejectedError).toBeInstanceOf(AppApiError);
      expect(rejectedError.code).toBe('SESSION_USER_MISMATCH');

      // Verify User B's readUrl cache is still preserved and was NOT removed
      const cachedB = queryClient.getQueryData(
        queryKeys.media.readUrl(mockUserB.id, VALID_UUID_SHARED)
      );
      expect(cachedB).toEqual(userBReadUrlData);
    });

    it('rejects mutation when user logs out and logs in again with fresh session generation', async () => {
      await tokenStorage.saveSession(sessionA);
      const pendingUploadA = createDeferred<void>();

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/media' && config.method === 'post') {
          await pendingUploadA.promise;
          return {
            status: 201,
            data: {
              success: true,
              data: {
                id: VALID_UUID_1,
                mimeType: 'image/jpeg',
                sizeBytes: 1024,
                status: 'READY',
              },
            },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      let authCtx!: ReturnType<typeof useAuth>;
      let uploadMut!: ReturnType<typeof useUploadMediaMutation>;

      function Harness() {
        authCtx = useAuth();
        uploadMut = useUploadMediaMutation();
        return null;
      }

      mountWithProviders(<Harness />);
      await waitFor(() => {
        expect(authCtx.user?.id).toBe(mockUserA.id);
      });

      const uploadPromise = uploadMut.mutateAsync({
        uri: 'file:///photo.jpg',
        name: 'photo.jpg',
        type: 'image/jpeg',
        size: 1024,
      });

      await flushAsync(10);

      // Re-save session A with new generation (simulating re-login)
      await act(async () => {
        await tokenStorage.saveSession({
          ...sessionA,
          savedAt: Date.now() + 1000,
        });
      });

      let rejectedError: any = null;
      await act(async () => {
        pendingUploadA.resolve();
        try {
          await uploadPromise;
        } catch (err) {
          rejectedError = err;
        }
        await flushAsync(30);
      });

      expect(rejectedError).toBeInstanceOf(AppApiError);
      expect(rejectedError.code).toBe('SESSION_USER_MISMATCH');
    });
  });
});
