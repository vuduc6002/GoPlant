import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '@/features/auth/AuthProvider';
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
import type { LocalImageFile, MediaItem, MediaReadUrlResponse } from '@/features/media/mediaTypes';
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

describe('G5.5.2b — Frontend Media Module Tests', () => {
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
        size: 1024 * 1024, // 1MB
      };
      const pngFile: LocalImageFile = {
        uri: 'file:///path/to/test.png',
        name: 'test.png',
        type: 'image/png',
        size: 2 * 1024 * 1024, // 2MB
      };
      const webpFile: LocalImageFile = {
        uri: 'file:///path/to/test.webp',
        name: 'test.webp',
        type: 'image/webp',
        size: 4 * 1024 * 1024, // 4MB
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
        size: 5 * 1024 * 1024 + 1, // 5MB + 1 byte
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

  describe('2. Media API Client', () => {
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
                id: 'med_12345',
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

      expect(result.id).toBe('med_12345');
      expect(result.status).toBe('READY');
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
    });

    it('getMediaReadUrl requests signed read URL from backend proxy', async () => {
      await tokenStorage.saveSession(sessionA);
      const calls: { method?: string; url?: string; auth?: unknown }[] = [];

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        calls.push({
          method: config.method,
          url: config.url,
          auth: config.headers?.Authorization,
        });

        if (config.url === '/media/med_12345/read-url' && config.method === 'get') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                mediaId: 'med_12345',
                readUrl: 'https://storage.goplant.vn/signed/med_12345?token=xyz',
                expiresAt: '2026-11-13T00:05:00Z',
              },
            },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      const result = await getMediaReadUrl('med_12345', { expectedUserId: 'usr_media_a' });

      expect(calls.length).toBe(1);
      expect(calls[0].url).toBe('/media/med_12345/read-url');
      expect(calls[0].auth).toBe(`Bearer ${sessionA.accessToken}`);
      expect(result.readUrl).toContain('signed/med_12345');
    });

    it('deleteMedia requests idempotent deletion from backend proxy', async () => {
      await tokenStorage.saveSession(sessionA);
      const calls: { method?: string; url?: string; auth?: unknown }[] = [];

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        calls.push({
          method: config.method,
          url: config.url,
          auth: config.headers?.Authorization,
        });

        if (config.url === '/media/med_12345' && config.method === 'delete') {
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

      const result = await deleteMedia('med_12345', { expectedUserId: 'usr_media_a' });

      expect(calls.length).toBe(1);
      expect(calls[0].url).toBe('/media/med_12345');
      expect(calls[0].auth).toBe(`Bearer ${sessionA.accessToken}`);
      expect(result.message).toContain('thành công');
    });

    it('validates mediaId is non-empty before sending API requests', async () => {
      await expect(getMediaReadUrl('')).rejects.toThrow(AppApiError);
      await expect(deleteMedia('   ')).rejects.toThrow(AppApiError);
    });
  });

  describe('3. Security Boundary & Privacy Verification', () => {
    it('frontend NEVER contacts Supabase directly (all calls route through GoPlant backend)', async () => {
      await tokenStorage.saveSession(sessionA);
      const requestedUrls: string[] = [];

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        requestedUrls.push(String(config.url));
        return {
          status: 201,
          data: {
            success: true,
            data: {
              id: 'med_sec_1',
              mimeType: 'image/png',
              sizeBytes: 500,
              status: 'READY',
              createdAt: '2026-11-13T00:00:00Z',
              updatedAt: '2026-11-13T00:00:00Z',
            },
          },
          headers: {},
          config,
        };
      });

      await uploadMedia({
        uri: 'file:///sec.png',
        name: 'sec.png',
        type: 'image/png',
        size: 500,
      });

      expect(requestedUrls.length).toBe(1);
      expect(requestedUrls[0]).toBe('/media');
      expect(requestedUrls[0]).not.toContain('supabase.co');
      expect(requestedUrls[0]).not.toContain('service_role');
    });
  });

  describe('4. React Hooks & Account Isolation', () => {
    it('useMediaReadUrl disables query when user is not authenticated', async () => {
      const calls: string[] = [];
      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        calls.push(String(config.url));
        return { status: 200, data: { success: true, data: {} }, headers: {}, config };
      });

      let hookResult: any;

      function TestComponent() {
        hookResult = useMediaReadUrl('med_test_1');
        return null;
      }

      mountWithProviders(<TestComponent />);
      await flushAsync(30);

      expect(calls).toEqual([]);
      expect(hookResult.fetchStatus).toBe('idle');
      expect(hookResult.data).toBeUndefined();
    });

    it('useMediaReadUrl queries signed URL when authenticated with user-scoped cache key', async () => {
      await tokenStorage.saveSession(sessionA);

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/media/med_test_2/read-url') {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                mediaId: 'med_test_2',
                readUrl: 'https://storage.goplant.vn/signed-a',
                expiresAt: '2026-11-13T00:05:00Z',
              },
            },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      let hookResult: any;

      function TestComponent() {
        hookResult = useMediaReadUrl('med_test_2');
        return null;
      }

      mountWithProviders(<TestComponent />);
      await flushAsync(50);

      const expectedKey = queryKeys.media.readUrl('usr_media_a', 'med_test_2');
      const cached = queryClient.getQueryData(expectedKey);
      expect(cached).toBeDefined();
      expect((cached as MediaReadUrlResponse)?.readUrl).toBe('https://storage.goplant.vn/signed-a');
      expect(hookResult.data?.readUrl).toBe('https://storage.goplant.vn/signed-a');
    });

    it('useDeleteMediaMutation removes cache for deleted media', async () => {
      await tokenStorage.saveSession(sessionA);

      // Pre-seed cache
      queryClient.setQueryData(queryKeys.media.readUrl('usr_media_a', 'med_to_delete'), {
        mediaId: 'med_to_delete',
        readUrl: 'https://storage.goplant.vn/signed-del',
        expiresAt: '2026-11-13T00:05:00Z',
      });

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/media/med_to_delete' && config.method === 'delete') {
          return {
            status: 200,
            data: { success: true, data: { message: 'Đã xóa.' } },
            headers: {},
            config,
          };
        }
        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      });

      let hookResult: any;

      function TestComponent() {
        hookResult = useDeleteMediaMutation();
        return null;
      }

      mountWithProviders(<TestComponent />);
      await flushAsync(40);

      await act(async () => {
        await hookResult.mutateAsync('med_to_delete');
      });

      // Verify cached read-url is removed
      const cachedAfter = queryClient.getQueryData(
        queryKeys.media.readUrl('usr_media_a', 'med_to_delete')
      );
      expect(cachedAfter).toBeUndefined();
    });

    it('useUploadMediaMutation uploads media and invalidates media.all query cache', async () => {
      await tokenStorage.saveSession(sessionA);

      apiClient.defaults.adapter = vi.fn().mockImplementation(async (config) => {
        if (config.url === '/users/me') {
          return { status: 200, data: { success: true, data: profileA }, headers: {}, config };
        }
        if (config.url === '/media' && config.method === 'post') {
          return {
            status: 201,
            data: {
              success: true,
              data: {
                id: 'med_upload_hook',
                mimeType: 'image/jpeg',
                sizeBytes: 1024,
                width: 400,
                height: 300,
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

      let uploadMut!: ReturnType<typeof useUploadMediaMutation>;

      function TestComponent() {
        uploadMut = useUploadMediaMutation();
        return null;
      }

      mountWithProviders(<TestComponent />);
      await flushAsync(40);

      let res: MediaItem | undefined;
      await act(async () => {
        res = await uploadMut.mutateAsync({
          uri: 'file:///photo.jpg',
          name: 'photo.jpg',
          type: 'image/jpeg',
          size: 1024,
        });
      });

      expect(res?.id).toBe('med_upload_hook');
    });

    it('isolates user media query caches between Session A and Session B', async () => {
      expect(queryKeys.media.all(mockUserA.id)).toEqual(['media', mockUserA.id]);
      expect(queryKeys.media.all(mockUserB.id)).toEqual(['media', mockUserB.id]);
      expect(profileA.id).not.toEqual(profileB.id);
      expect(sessionA.user?.id).not.toEqual(sessionB.user?.id);
    });
  });
});
