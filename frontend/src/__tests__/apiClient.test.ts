import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  apiClient,
  registerUnauthorizedHandler,
  isPublicEndpoint,
} from '../services/api/apiClient';
import * as tokenStorage from '../services/api/tokenStorage';
import { StorageError } from '../services/api/tokenStorage';
import { AppApiError } from '../services/api/apiError';

describe('apiClient & Authentication Interceptors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isPublicEndpoint (Exact Route Matching)', () => {
    it('identifies /auth/login and /auth/register as public', () => {
      expect(isPublicEndpoint('/auth/login')).toBe(true);
      expect(isPublicEndpoint('/auth/register')).toBe(true);
      expect(isPublicEndpoint('/auth/login/')).toBe(true);
      expect(isPublicEndpoint('/auth/register/')).toBe(true);
    });

    it('identifies /api/v1 prefix and full URLs as public', () => {
      expect(isPublicEndpoint('/api/v1/auth/login')).toBe(true);
      expect(isPublicEndpoint('/api/v1/auth/register')).toBe(true);
      expect(isPublicEndpoint('http://localhost:8080/api/v1/auth/login')).toBe(true);
      expect(isPublicEndpoint('http://localhost:8080/api/v1/auth/register')).toBe(true);
      expect(isPublicEndpoint('https://api.goplant.vn/api/v1/auth/login?source=mobile')).toBe(true);
    });

    it('rejects false-positive substrings like /auth/login-extra or /not-auth/login', () => {
      expect(isPublicEndpoint('/auth/login-extra')).toBe(false);
      expect(isPublicEndpoint('/api/v1/auth/login-extra')).toBe(false);
      expect(isPublicEndpoint('/not-auth/login')).toBe(false);
      expect(isPublicEndpoint('/api/v1/auth/register-partner')).toBe(false);
    });

    it('rejects URLs where public route is only in query string', () => {
      expect(isPublicEndpoint('/plants?redirect=/auth/login')).toBe(false);
      expect(isPublicEndpoint('/users/me?ref=/auth/register')).toBe(false);
    });

    it('identifies protected routes as non-public', () => {
      expect(isPublicEndpoint('/users/me')).toBe(false);
      expect(isPublicEndpoint('/plants')).toBe(false);
      expect(isPublicEndpoint('/tasks/today')).toBe(false);
      expect(isPublicEndpoint(undefined)).toBe(false);
      expect(isPublicEndpoint('')).toBe(false);
    });
  });

  describe('Request Interceptor', () => {
    it('does not attempt to read access token for public login/register endpoints', async () => {
      const getAccessTokenSpy = vi.spyOn(tokenStorage, 'getAccessToken');

      const mockAdapter = vi.fn().mockResolvedValue({
        status: 200,
        data: { success: true, data: { accessToken: 'new-token' } },
        headers: {},
        config: {},
      });
      apiClient.defaults.adapter = mockAdapter;

      await apiClient.post('/auth/login', { account: 'test', password: '123' });

      expect(getAccessTokenSpy).not.toHaveBeenCalled();
    });

    it('does not attempt to read token when skipAuth is explicitly set to true', async () => {
      const getAccessTokenSpy = vi.spyOn(tokenStorage, 'getAccessToken');

      const mockAdapter = vi.fn().mockResolvedValue({
        status: 200,
        data: { success: true, data: { status: 'healthy' } },
        headers: {},
        config: {},
      });
      apiClient.defaults.adapter = mockAdapter;

      await apiClient.get('/system/health', { skipAuth: true });

      expect(getAccessTokenSpy).not.toHaveBeenCalled();
    });

    it('attaches Authorization header for protected endpoint when token exists', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue('valid-jwt-token-999');

      let capturedHeaders: Record<string, string> | undefined;
      const mockAdapter = vi.fn().mockImplementation((config) => {
        capturedHeaders = config.headers;
        return Promise.resolve({
          status: 200,
          data: { success: true, data: { id: 'usr_001' } },
          headers: {},
          config,
        });
      });
      apiClient.defaults.adapter = mockAdapter;

      await apiClient.get('/users/me');

      expect(capturedHeaders?.Authorization).toBe('Bearer valid-jwt-token-999');
    });

    it('halts protected request and throws StorageError when reading token fails, without sending HTTP request', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockRejectedValue(
        new StorageError({
          code: 'READ_FAILED',
          operation: 'read',
          message: 'Secure storage read failure',
        })
      );

      const mockAdapter = vi.fn();
      apiClient.defaults.adapter = mockAdapter;

      const unauthorizedSpy = vi.fn();
      registerUnauthorizedHandler(unauthorizedSpy);

      await expect(apiClient.get('/users/me')).rejects.toThrow(AppApiError);

      // Verify the HTTP request was aborted before hitting network
      expect(mockAdapter).not.toHaveBeenCalled();

      // Verify StorageError did NOT trigger unauthorized listener (no fake 401)
      expect(unauthorizedSpy).not.toHaveBeenCalled();
    });

    it('halts protected request with UNAUTHENTICATED error when token is null', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(null);

      const mockAdapter = vi.fn();
      apiClient.defaults.adapter = mockAdapter;

      const unauthorizedSpy = vi.fn();
      registerUnauthorizedHandler(unauthorizedSpy);

      let caughtError: AppApiError | null = null;
      try {
        await apiClient.get('/users/me');
      } catch (err) {
        caughtError = err as AppApiError;
      }

      expect(caughtError).toBeInstanceOf(AppApiError);
      expect(caughtError?.code).toBe('UNAUTHENTICATED');
      expect(caughtError?.statusCode).toBeUndefined();

      // HTTP request was not sent
      expect(mockAdapter).not.toHaveBeenCalled();

      // Unauthorized listener was not triggered
      expect(unauthorizedSpy).not.toHaveBeenCalled();
    });
  });

  describe('Response Interceptor & 401 Unauthorized handling', () => {
    it('triggers unauthorized listener on genuine backend 401 for protected endpoints', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue('expired-token');

      const mockAdapter = vi.fn().mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 401,
          data: {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Token expired' },
          },
        },
        config: { url: '/users/me' },
      });
      apiClient.defaults.adapter = mockAdapter;

      const unauthorizedSpy = vi.fn();
      const unregister = registerUnauthorizedHandler(unauthorizedSpy);

      await expect(apiClient.get('/users/me')).rejects.toThrow(AppApiError);

      expect(unauthorizedSpy).toHaveBeenCalledTimes(1);
      unregister();
    });

    it('does not trigger unauthorized listener when login endpoint returns 401 (invalid credentials)', async () => {
      const mockAdapter = vi.fn().mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 401,
          data: {
            success: false,
            error: { code: 'BAD_CREDENTIALS', message: 'Sai mật khẩu' },
          },
        },
        config: { url: '/auth/login' },
      });
      apiClient.defaults.adapter = mockAdapter;

      const unauthorizedSpy = vi.fn();
      const unregister = registerUnauthorizedHandler(unauthorizedSpy);

      await expect(
        apiClient.post('/auth/login', { account: 'test', password: 'wrong' })
      ).rejects.toThrow(AppApiError);

      expect(unauthorizedSpy).not.toHaveBeenCalled();
      unregister();
    });

    it('does not trigger unauthorized listener when request has skipAuth: true even if status is 401', async () => {
      const mockAdapter = vi.fn().mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 401,
          data: {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'No auth allowed' },
          },
        },
        config: { url: '/public/preview', skipAuth: true, isPublic: true },
      });
      apiClient.defaults.adapter = mockAdapter;

      const unauthorizedSpy = vi.fn();
      const unregister = registerUnauthorizedHandler(unauthorizedSpy);

      await expect(
        apiClient.get('/public/preview', { skipAuth: true })
      ).rejects.toThrow(AppApiError);

      expect(unauthorizedSpy).not.toHaveBeenCalled();
      unregister();
    });

    it('normalizes { success: false, error: ... } envelopes on HTTP 200 into AppApiError', async () => {
      const mockAdapter = vi.fn().mockResolvedValue({
        status: 200,
        data: {
          success: false,
          error: {
            code: 'PLANT_NOT_FOUND',
            message: 'Không tìm thấy thông tin cây trồng',
            field: 'plantId',
          },
          timestamp: '2026-11-10T00:00:00Z',
        },
        headers: {},
        config: { url: '/plants/123' },
      });
      apiClient.defaults.adapter = mockAdapter;

      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue('valid-token');

      let caughtError: AppApiError | null = null;
      try {
        await apiClient.get('/plants/123');
      } catch (err) {
        caughtError = err as AppApiError;
      }

      expect(caughtError).toBeInstanceOf(AppApiError);
      expect(caughtError?.code).toBe('PLANT_NOT_FOUND');
      expect(caughtError?.field).toBe('plantId');
      expect(caughtError?.message).toBe('Không tìm thấy thông tin cây trồng');
    });
  });
});
