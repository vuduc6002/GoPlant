import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  apiClient,
  registerUnauthorizedHandler,
  isPublicEndpoint,
  isTrustedApiUrl,
  classifyApiUrl,
  resolveEffectiveBaseURL,
  isTrustedBaseURL,
} from '../services/api/apiClient';
import * as tokenStorage from '../services/api/tokenStorage';
import { StorageError } from '../services/api/tokenStorage';
import { AppApiError } from '../services/api/apiError';

describe('apiClient & Authentication Interceptors', () => {
  const originalAdapter = apiClient.defaults.adapter;
  const originalDefaultBaseURL = apiClient.defaults.baseURL;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
    apiClient.defaults.baseURL = originalDefaultBaseURL;
  });

  describe('URL Trust Boundary & Route Classification (isTrustedApiUrl / isPublicEndpoint)', () => {
    it('identifies relative public routes /auth/login and /auth/register as trusted and public', () => {
      expect(isTrustedApiUrl('/auth/login')).toBe(true);
      expect(isPublicEndpoint('/auth/login')).toBe(true);

      expect(isTrustedApiUrl('/auth/register')).toBe(true);
      expect(isPublicEndpoint('/auth/register')).toBe(true);

      expect(isPublicEndpoint('/auth/login/')).toBe(true);
      expect(isPublicEndpoint('/auth/register/')).toBe(true);
      expect(isPublicEndpoint('/api/v1/auth/login')).toBe(true);
      expect(isPublicEndpoint('/api/v1/auth/register')).toBe(true);
    });

    it('accepts absolute same-origin public URLs matching backend origin (localhost:8080)', () => {
      expect(isTrustedApiUrl('http://localhost:8080/api/v1/auth/login')).toBe(true);
      expect(isPublicEndpoint('http://localhost:8080/api/v1/auth/login')).toBe(true);

      expect(isTrustedApiUrl('http://localhost:8080/api/v1/auth/register')).toBe(true);
      expect(isPublicEndpoint('http://localhost:8080/api/v1/auth/register')).toBe(true);

      expect(isPublicEndpoint('http://localhost:8080/api/v1/auth/login?source=mobile')).toBe(true);

      // Custom configured backend origin works cleanly when API_BASE_URL matches that origin
      const customBase = 'https://api.goplant.vn/api/v1';
      expect(
        isTrustedApiUrl('https://api.goplant.vn/api/v1/auth/login?source=mobile', customBase)
      ).toBe(true);
      expect(
        isPublicEndpoint('https://api.goplant.vn/api/v1/auth/login?source=mobile', customBase)
      ).toBe(true);
    });

    it('classifies same-origin protected routes and non-matching routes as trusted but protected (non-public)', () => {
      expect(isTrustedApiUrl('http://localhost:8080/api/v1/users/me')).toBe(true);
      expect(isPublicEndpoint('http://localhost:8080/api/v1/users/me')).toBe(false);

      expect(isTrustedApiUrl('http://localhost:8080/api/v1/plants')).toBe(true);
      expect(isPublicEndpoint('http://localhost:8080/api/v1/plants')).toBe(false);

      expect(isTrustedApiUrl('/users/me')).toBe(true);
      expect(isPublicEndpoint('/users/me')).toBe(false);

      expect(isTrustedApiUrl('/auth/login-extra')).toBe(true);
      expect(isPublicEndpoint('/auth/login-extra')).toBe(false);

      expect(isTrustedApiUrl('/api/v1/auth/login-extra')).toBe(true);
      expect(isPublicEndpoint('/api/v1/auth/login-extra')).toBe(false);

      expect(isTrustedApiUrl('/not-auth/login')).toBe(true);
      expect(isPublicEndpoint('/not-auth/login')).toBe(false);

      expect(isTrustedApiUrl('/api/v1/auth/register-partner')).toBe(true);
      expect(isPublicEndpoint('/api/v1/auth/register-partner')).toBe(false);

      // Dot-segment normalization prevents path traversal from fooling route match
      expect(isTrustedApiUrl('/auth/login/../users/me')).toBe(true);
      expect(isPublicEndpoint('/auth/login/../users/me')).toBe(false);
    });

    it('rejects URLs where public route appears only in query string as protected', () => {
      expect(isTrustedApiUrl('/plants?redirect=/auth/login')).toBe(true);
      expect(isPublicEndpoint('/plants?redirect=/auth/login')).toBe(false);
      expect(isPublicEndpoint('/users/me?ref=/auth/register')).toBe(false);
    });

    it('rejects external origin URLs completely (neither trusted nor public)', () => {
      expect(isTrustedApiUrl('https://evil.com/auth/login')).toBe(false);
      expect(isPublicEndpoint('https://evil.com/auth/login')).toBe(false);

      expect(isTrustedApiUrl('https://evil.com/api/v1/auth/register')).toBe(false);
      expect(isPublicEndpoint('https://evil.com/api/v1/auth/register')).toBe(false);

      expect(isTrustedApiUrl('https://evil.com/users/me')).toBe(false);
      expect(isTrustedApiUrl('https://api.goplant.vn/api/v1/auth/login')).toBe(false);

      // Scheme or port mismatch against http://localhost:8080 must also fail origin check
      expect(isTrustedApiUrl('http://localhost:9090/auth/login')).toBe(false);
      expect(isTrustedApiUrl('https://localhost:8080/auth/login')).toBe(false);
    });

    it('rejects protocol-relative URLs safely', () => {
      expect(classifyApiUrl('//evil.com/auth/login').reason).toBe('protocol_relative');
      expect(isTrustedApiUrl('//evil.com/auth/login')).toBe(false);
      expect(isPublicEndpoint('//evil.com/auth/login')).toBe(false);

      expect(isTrustedApiUrl('///evil.com/auth/login')).toBe(false);
      expect(isTrustedApiUrl('//localhost:8080/auth/login')).toBe(false);
    });

    it('rejects malformed URLs and dangerous schemes safely', () => {
      const invalidInputs: (string | undefined)[] = [
        undefined,
        '',
        '   ',
        '?redirect=/auth/login',
        '#hash',
        'http://',
        'https://',
        'http://local host/auth/login',
        'http://user:pass@localhost:8080/auth/login',
        'http:evil.com/auth/login',
        'http//evil.com/auth/login',
        'javascript:alert(1)',
        'ftp://localhost:8080/auth/login',
        'localhost:8080/auth/login',
        '/\\evil.com/auth/login',
        '\\evil.com/auth/login',
        '/auth\n/login',
      ];

      for (const badUrl of invalidInputs) {
        expect(isTrustedApiUrl(badUrl)).toBe(false);
        expect(isPublicEndpoint(badUrl)).toBe(false);
      }
    });
  });

  describe('Request Interceptor (Trusted Boundary & Token Injection)', () => {
    it('does not read access token for relative /auth/login and preserves baseURL prefix /api/v1', async () => {
      const getAccessTokenSpy = vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue('existing-jwt');

      let capturedConfig: Record<string, unknown> | undefined;
      const mockAdapter = vi.fn().mockImplementation((config) => {
        capturedConfig = config as unknown as Record<string, unknown>;
        return Promise.resolve({
          status: 200,
          data: { success: true, data: { accessToken: 'new-token' } },
          headers: {},
          config,
        });
      });
      apiClient.defaults.adapter = mockAdapter;

      await apiClient.post('/auth/login', { account: 'test', password: '123' });

      expect(getAccessTokenSpy).not.toHaveBeenCalled();
      expect(mockAdapter).toHaveBeenCalledTimes(1);
      expect(capturedConfig?.baseURL).toBe('http://localhost:8080/api/v1');
      expect(capturedConfig?.url).toBe('/auth/login');
      const headers = capturedConfig?.headers as Record<string, unknown> | undefined;
      expect(headers?.Authorization).toBeUndefined();
    });

    it('does not read stale token for same-origin absolute login/register endpoints', async () => {
      const getAccessTokenSpy = vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue('stale-jwt');

      const mockAdapter = vi.fn().mockResolvedValue({
        status: 200,
        data: { success: true, data: { accessToken: 'fresh-token' } },
        headers: {},
        config: {},
      });
      apiClient.defaults.adapter = mockAdapter;

      await apiClient.post('http://localhost:8080/api/v1/auth/login', {
        account: 'test',
        password: '123',
      });
      await apiClient.post('http://localhost:8080/api/v1/auth/register', {
        fullName: 'Test User',
        account: 'test@example.com',
        password: 'Password123@',
      });

      expect(getAccessTokenSpy).not.toHaveBeenCalled();
      expect(mockAdapter).toHaveBeenCalledTimes(2);
    });

    it('does not attempt to read token when skipAuth is explicitly set to true on a trusted route', async () => {
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
      expect(mockAdapter).toHaveBeenCalledTimes(1);
    });

    it('attaches Authorization header for trusted protected routes (relative, false-positive names, and same-origin absolute)', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue('valid-jwt-token-999');

      const capturedAuthHeaders: (string | undefined)[] = [];
      const mockAdapter = vi.fn().mockImplementation((config) => {
        capturedAuthHeaders.push(config.headers?.Authorization as string | undefined);
        return Promise.resolve({
          status: 200,
          data: { success: true, data: { id: 'usr_001' } },
          headers: {},
          config,
        });
      });
      apiClient.defaults.adapter = mockAdapter;

      await apiClient.get('/users/me');
      await apiClient.get('http://localhost:8080/api/v1/users/me');
      await apiClient.get('/auth/login-extra');
      await apiClient.get('/not-auth/login');

      expect(mockAdapter).toHaveBeenCalledTimes(4);
      expect(capturedAuthHeaders).toEqual([
        'Bearer valid-jwt-token-999',
        'Bearer valid-jwt-token-999',
        'Bearer valid-jwt-token-999',
        'Bearer valid-jwt-token-999',
      ]);
    });

    it('blocks external origin requests BEFORE reading SecureStore, attaching JWT, or calling network', async () => {
      const getAccessTokenSpy = vi
        .spyOn(tokenStorage, 'getAccessToken')
        .mockResolvedValue('super-secret-jwt');

      const mockAdapter = vi.fn();
      apiClient.defaults.adapter = mockAdapter;

      const unauthorizedSpy = vi.fn();
      const unregister = registerUnauthorizedHandler(unauthorizedSpy);

      const externalUrls = [
        'https://evil.com/auth/login',
        'https://evil.com/api/v1/auth/register',
        'https://evil.com/users/me',
      ];

      for (const externalUrl of externalUrls) {
        let caughtError: AppApiError | null = null;
        try {
          await apiClient.get(externalUrl);
        } catch (err) {
          caughtError = err as AppApiError;
        }

        expect(caughtError).toBeInstanceOf(AppApiError);
        expect(caughtError?.code).toBe('UNTRUSTED_API_URL');
      }

      // External request with skipAuth: true must also be blocked
      await expect(
        apiClient.get('https://evil.com/auth/login', { skipAuth: true })
      ).rejects.toMatchObject({ code: 'UNTRUSTED_API_URL' });

      expect(getAccessTokenSpy).not.toHaveBeenCalled();
      expect(mockAdapter).not.toHaveBeenCalled();
      expect(unauthorizedSpy).not.toHaveBeenCalled();
      unregister();
    });

    it('blocks protocol-relative URLs (//evil.com/...) and malformed URLs BEFORE reading token or calling network', async () => {
      const getAccessTokenSpy = vi
        .spyOn(tokenStorage, 'getAccessToken')
        .mockResolvedValue('super-secret-jwt');

      const mockAdapter = vi.fn();
      apiClient.defaults.adapter = mockAdapter;

      const dangerousUrls = [
        '//evil.com/auth/login',
        '//evil.com/users/me',
        'http://',
        'javascript:alert(1)',
        'http:evil.com/auth/login',
        '',
      ];

      for (const badUrl of dangerousUrls) {
        await expect(apiClient.get(badUrl)).rejects.toMatchObject({
          code: 'UNTRUSTED_API_URL',
        });
      }

      expect(getAccessTokenSpy).not.toHaveBeenCalled();
      expect(mockAdapter).not.toHaveBeenCalled();
    });

    it('blocks per-request untrusted baseURL override before token read or network call', async () => {
      const getAccessTokenSpy = vi
        .spyOn(tokenStorage, 'getAccessToken')
        .mockResolvedValue('super-secret-jwt');
      const mockAdapter = vi.fn();
      apiClient.defaults.adapter = mockAdapter;

      await expect(
        apiClient.get('/users/me', { baseURL: 'https://evil.com/api/v1' })
      ).rejects.toMatchObject({ code: 'UNTRUSTED_API_URL' });

      expect(getAccessTokenSpy).not.toHaveBeenCalled();
      expect(mockAdapter).not.toHaveBeenCalled();
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
      const unregister = registerUnauthorizedHandler(unauthorizedSpy);

      await expect(apiClient.get('/users/me')).rejects.toThrow(AppApiError);

      // Verify the HTTP request was aborted before hitting network
      expect(mockAdapter).not.toHaveBeenCalled();

      // Verify StorageError did NOT trigger unauthorized listener (no fake 401)
      expect(unauthorizedSpy).not.toHaveBeenCalled();
      unregister();
    });

    it('halts protected request with UNAUTHENTICATED error when token is null', async () => {
      vi.spyOn(tokenStorage, 'getAccessToken').mockResolvedValue(null);

      const mockAdapter = vi.fn();
      apiClient.defaults.adapter = mockAdapter;

      const unauthorizedSpy = vi.fn();
      const unregister = registerUnauthorizedHandler(unauthorizedSpy);

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
      unregister();
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

    it('never triggers unauthorized listener if an external or protocol-relative 401 reaches response interceptor', async () => {
      const unauthorizedSpy = vi.fn();
      const unregister = registerUnauthorizedHandler(unauthorizedSpy);

      const responseHandlers = (
        apiClient.interceptors.response as unknown as {
          handlers: { rejected?: (error: unknown) => Promise<unknown> }[];
        }
      ).handlers;
      const rejectedHandler = responseHandlers[0]?.rejected;
      expect(rejectedHandler).toBeDefined();

      const external401 = {
        isAxiosError: true,
        response: {
          status: 401,
          data: {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'External 401' },
          },
        },
        config: { url: 'https://evil.com/users/me' },
      };

      await expect(rejectedHandler!(external401)).rejects.toBeInstanceOf(AppApiError);
      expect(unauthorizedSpy).not.toHaveBeenCalled();

      const protocolRelative401 = {
        isAxiosError: true,
        response: { status: 401 },
        config: { url: '//evil.com/users/me' },
      };

      await expect(rejectedHandler!(protocolRelative401)).rejects.toBeInstanceOf(AppApiError);
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

  describe('Effective BaseURL Override Guard (G5.2.1.1.4)', () => {
    it('resolveEffectiveBaseURL & isTrustedBaseURL enforce strict fallback and origin rules', () => {
      const defaultBase = 'http://localhost:8080/api/v1';

      // Falls back ONLY when requestBaseURL is strictly undefined
      expect(resolveEffectiveBaseURL(undefined, defaultBase)).toBe(defaultBase);
      expect(isTrustedBaseURL(resolveEffectiveBaseURL(undefined, defaultBase))).toBe(true);

      // Explicit same-origin overrides (including custom path prefix)
      expect(resolveEffectiveBaseURL('http://localhost:8080/gateway/api/v1', defaultBase)).toBe(
        'http://localhost:8080/gateway/api/v1'
      );
      expect(
        isTrustedBaseURL(
          resolveEffectiveBaseURL('http://localhost:8080/gateway/api/v1', defaultBase)
        )
      ).toBe(true);

      // Explicit invalid values MUST NOT fallback to defaultBase
      expect(resolveEffectiveBaseURL('', defaultBase)).toBeNull();
      expect(resolveEffectiveBaseURL('   ', defaultBase)).toBeNull();
      expect(resolveEffectiveBaseURL(null, defaultBase)).toBeNull();
      expect(resolveEffectiveBaseURL(123, defaultBase)).toBeNull();
      expect(resolveEffectiveBaseURL('//evil.com', defaultBase)).toBeNull();
      expect(resolveEffectiveBaseURL('not-a-valid-url', defaultBase)).toBeNull();
      expect(resolveEffectiveBaseURL('http://user:pass@localhost:8080/api/v1', defaultBase)).toBeNull();

      // Scheme or port mismatch must be untrusted even with same hostname
      expect(isTrustedBaseURL('https://localhost:8080/api/v1')).toBe(false);
      expect(isTrustedBaseURL('http://localhost:9090/api/v1')).toBe(false);
      expect(isTrustedBaseURL('https://evil.com')).toBe(false);
      expect(isTrustedBaseURL(null)).toBe(false);
    });

    it('Nhóm A: allows instance default baseURL and valid same-origin baseURL overrides with prefixes', async () => {
      const getAccessTokenSpy = vi
        .spyOn(tokenStorage, 'getAccessToken')
        .mockResolvedValue('valid-jwt-base-test');

      const captured: { baseURL?: string; url?: string; auth?: string }[] = [];
      const mockAdapter = vi.fn().mockImplementation((config) => {
        captured.push({
          baseURL: config.baseURL,
          url: config.url,
          auth: config.headers?.Authorization as string | undefined,
        });
        return Promise.resolve({
          status: 200,
          data: { success: true, data: { ok: true } },
          headers: {},
          config,
        });
      });
      apiClient.defaults.adapter = mockAdapter;

      // Default instance baseURL - public
      await apiClient.post('/auth/login', { account: 'u1', password: 'pw' });
      expect(getAccessTokenSpy).not.toHaveBeenCalled();

      // Explicit same-origin baseURL - public
      await apiClient.post(
        '/auth/register',
        { fullName: 'User', account: 'u@example.com', password: 'pw' },
        { baseURL: 'http://localhost:8080/api/v1' }
      );
      expect(getAccessTokenSpy).not.toHaveBeenCalled();

      // Default instance baseURL - protected
      await apiClient.get('/users/me');

      // Explicit same-origin custom prefix baseURL - protected
      await apiClient.get('/users/me', { baseURL: 'http://localhost:8080/custom/api/v1' });

      expect(getAccessTokenSpy).toHaveBeenCalledTimes(2);
      expect(mockAdapter).toHaveBeenCalledTimes(4);
      expect(captured).toEqual([
        { baseURL: 'http://localhost:8080/api/v1', url: '/auth/login', auth: undefined },
        { baseURL: 'http://localhost:8080/api/v1', url: '/auth/register', auth: undefined },
        {
          baseURL: 'http://localhost:8080/api/v1',
          url: '/users/me',
          auth: 'Bearer valid-jwt-base-test',
        },
        {
          baseURL: 'http://localhost:8080/custom/api/v1',
          url: '/users/me',
          auth: 'Bearer valid-jwt-base-test',
        },
      ]);
    });

    it('Nhóm B: blocks empty, whitespace, null, external, protocol-relative, and scheme/port-mismatched baseURL overrides before reading token or sending network request', async () => {
      const getAccessTokenSpy = vi
        .spyOn(tokenStorage, 'getAccessToken')
        .mockResolvedValue('secret-jwt-must-not-leak');

      const mockAdapter = vi.fn();
      apiClient.defaults.adapter = mockAdapter;

      const unauthorizedSpy = vi.fn();
      const unregister = registerUnauthorizedHandler(unauthorizedSpy);

      const invalidBaseURLs: unknown[] = [
        '',
        '   ',
        null,
        'https://evil.com',
        '//evil.com',
        'https://localhost:8080/api/v1',
        'http://localhost:9090/api/v1',
        'http://user:pass@localhost:8080/api/v1',
        '/api/v1',
      ];

      for (const badBase of invalidBaseURLs) {
        const protectedHeaders: Record<string, string> = {};
        // Protected endpoint must be rejected
        await expect(
          apiClient.get('/users/me', {
            baseURL: badBase as string,
            headers: protectedHeaders,
          })
        ).rejects.toMatchObject({ code: 'UNTRUSTED_API_URL' });
        expect(protectedHeaders.Authorization).toBeUndefined();

        // Public route with invalid baseURL override must also be rejected
        await expect(
          apiClient.post('/auth/login', { account: 'a', password: 'b' }, { baseURL: badBase as string })
        ).rejects.toMatchObject({ code: 'UNTRUSTED_API_URL' });

        // Even with skipAuth: true, invalid baseURL override must be rejected
        await expect(
          apiClient.get('/health', { baseURL: badBase as string, skipAuth: true })
        ).rejects.toMatchObject({ code: 'UNTRUSTED_API_URL' });
      }

      // Also verify mutated empty/undefined defaults.baseURL cannot slip through
      apiClient.defaults.baseURL = '';
      await expect(apiClient.get('/users/me')).rejects.toMatchObject({
        code: 'UNTRUSTED_API_URL',
      });

      apiClient.defaults.baseURL = undefined;
      await expect(apiClient.get('/users/me')).rejects.toMatchObject({
        code: 'UNTRUSTED_API_URL',
      });

      expect(getAccessTokenSpy).not.toHaveBeenCalled();
      expect(mockAdapter).not.toHaveBeenCalled();
      expect(unauthorizedSpy).not.toHaveBeenCalled();
      unregister();
    });

    it('Nhóm C: Response Interceptor rejects false 401 triggers when config baseURL is empty, null, whitespace, external, protocol-relative, or missing default baseURL', async () => {
      const unauthorizedSpy = vi.fn();
      const unregister = registerUnauthorizedHandler(unauthorizedSpy);

      const responseHandlers = (
        apiClient.interceptors.response as unknown as {
          handlers: { rejected?: (error: unknown) => Promise<unknown> }[];
        }
      ).handlers;
      const rejectedHandler = responseHandlers[0]?.rejected;
      expect(rejectedHandler).toBeDefined();

      const build401 = (config: Record<string, unknown>) => ({
        isAxiosError: true,
        response: {
          status: 401,
          data: {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
          },
        },
        config,
      });

      const untrusted401Configs: Record<string, unknown>[] = [
        { url: '/users/me', baseURL: '' },
        { url: '/users/me', baseURL: '   ' },
        { url: '/users/me', baseURL: null },
        { url: '/users/me', baseURL: 'https://evil.com' },
        { url: '/users/me', baseURL: '//evil.com' },
        { url: '/users/me', baseURL: 'https://localhost:8080/api/v1' },
        { url: '/auth/login', baseURL: 'http://localhost:8080/api/v1' },
        { url: '/users/me', skipAuth: true, baseURL: 'http://localhost:8080/api/v1' },
      ];

      for (const cfg of untrusted401Configs) {
        let err: AppApiError | null = null;
        try {
          await rejectedHandler!(build401(cfg));
        } catch (caught) {
          err = caught as AppApiError;
        }
        expect(err).toBeInstanceOf(AppApiError);
        expect(err?.statusCode).toBe(401);
        expect(unauthorizedSpy).not.toHaveBeenCalled();
      }

      // Missing baseURL on both config and instance defaults MUST NOT automatically assume trusted
      apiClient.defaults.baseURL = undefined;
      await expect(rejectedHandler!(build401({ url: '/users/me' }))).rejects.toMatchObject({
        statusCode: 401,
      });
      expect(unauthorizedSpy).not.toHaveBeenCalled();

      // Restore valid default baseURL: genuine 401 on protected endpoint SHOULD trigger unauthorized listener
      apiClient.defaults.baseURL = originalDefaultBaseURL;
      await expect(rejectedHandler!(build401({ url: '/users/me' }))).rejects.toMatchObject({
        statusCode: 401,
      });
      expect(unauthorizedSpy).toHaveBeenCalledTimes(1);

      // Explicit same-origin valid baseURL + protected endpoint ALSO triggers unauthorized listener
      await expect(
        rejectedHandler!(
          build401({ url: '/users/me', baseURL: 'http://localhost:8080/api/v1' })
        )
      ).rejects.toMatchObject({ statusCode: 401 });
      expect(unauthorizedSpy).toHaveBeenCalledTimes(2);

      unregister();
    });
  });
});
