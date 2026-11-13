import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL, API_TIMEOUT } from './apiConfig';
import { AppApiError, normalizeApiError, normalizeBackendFailure } from './apiError';
import { getAccessToken, getSession, getSessionGeneration } from './tokenStorage';
import type { AuthSession } from './apiTypes';

export interface ApiUserScopeOptions {
  expectedUserId?: string;
  expectedSessionGeneration?: number;
}

declare module 'axios' {
  export interface AxiosRequestConfig {
    skipAuth?: boolean;
    isPublic?: boolean;
    isTrustedUrl?: boolean;
    expectedUserId?: string;
    expectedSessionGeneration?: number;
  }
}

export interface ApiUrlClassification {
  isTrusted: boolean;
  isPublic: boolean;
  normalizedRoute: string | null;
  reason?:
    | 'empty'
    | 'malformed'
    | 'protocol_relative'
    | 'untrusted_scheme'
    | 'untrusted_origin';
}

const PUBLIC_AUTH_ROUTES = new Set<string>(['/auth/login', '/auth/register']);

type UnauthorizedListener = () => void;
let unauthorizedListener: UnauthorizedListener | null = null;

/**
 * Register a listener to be notified when a protected, trusted endpoint returns genuine HTTP 401.
 * AuthProvider subscribes to this to handle session cleanup and navigation state transition.
 * Returns an unregister function.
 */
export function registerUnauthorizedHandler(handler: UnauthorizedListener): () => void {
  unauthorizedListener = handler;
  return () => {
    if (unauthorizedListener === handler) {
      unauthorizedListener = null;
    }
  };
}

function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function parseHttpBaseUrl(baseUrl: string): URL | null {
  try {
    const parsed = new URL(baseUrl);
    if (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.hostname &&
      parsed.origin &&
      parsed.origin !== 'null' &&
      !parsed.username &&
      !parsed.password
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeRouteFromPathname(pathname: string, trustedBasePathname: string): string {
  let normalized = pathname.startsWith('/') ? pathname : '/' + pathname;

  const cleanBasePath =
    trustedBasePathname && trustedBasePathname !== '/'
      ? trustedBasePathname.replace(/\/+$/, '')
      : '';

  if (cleanBasePath && normalized === cleanBasePath) {
    normalized = '/';
  } else if (cleanBasePath && normalized.startsWith(cleanBasePath + '/')) {
    normalized = normalized.substring(cleanBasePath.length);
  } else if (normalized.startsWith('/api/v1/')) {
    normalized = normalized.substring('/api/v1'.length);
  } else if (normalized === '/api/v1') {
    normalized = '/';
  } else if (normalized.startsWith('/api/')) {
    normalized = normalized.substring('/api'.length);
  } else if (normalized === '/api') {
    normalized = '/';
  }

  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * Single source of truth for classifying API request URLs against the trusted backend origin (API_BASE_URL).
 * Distinguishes:
 * - Relative API paths (e.g. /auth/login, /api/v1/auth/login) -> trusted, classified by route
 * - Absolute URLs with matching HTTP/HTTPS origin as API_BASE_URL -> trusted, classified by route
 * - External origins, protocol-relative URLs (//evil.com), non-HTTP(S) schemes, or malformed URLs -> untrusted (rejected)
 */
export function classifyApiUrl(
  url?: string,
  trustedBaseUrl: string = API_BASE_URL
): ApiUrlClassification {
  if (typeof url !== 'string') {
    return { isTrusted: false, isPublic: false, normalizedRoute: null, reason: 'empty' };
  }

  if (hasControlCharacters(url)) {
    return { isTrusted: false, isPublic: false, normalizedRoute: null, reason: 'malformed' };
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return { isTrusted: false, isPublic: false, normalizedRoute: null, reason: 'empty' };
  }

  // Explicitly block protocol-relative URLs (e.g. //evil.com/auth/login)
  if (trimmed.startsWith('//')) {
    return {
      isTrusted: false,
      isPublic: false,
      normalizedRoute: null,
      reason: 'protocol_relative',
    };
  }

  const queryIdx = trimmed.indexOf('?');
  const hashIdx = trimmed.indexOf('#');
  const cutIdx =
    queryIdx === -1 ? hashIdx : hashIdx === -1 ? queryIdx : Math.min(queryIdx, hashIdx);
  const pathAndAuthorityPart = cutIdx === -1 ? trimmed : trimmed.slice(0, cutIdx);

  if (!pathAndAuthorityPart) {
    return { isTrusted: false, isPublic: false, normalizedRoute: null, reason: 'malformed' };
  }

  // Reject raw whitespace or backslashes inside scheme/authority/path
  if (/[\s\\]/.test(pathAndAuthorityPart)) {
    return { isTrusted: false, isPublic: false, normalizedRoute: null, reason: 'malformed' };
  }

  const trustedBase = parseHttpBaseUrl(trustedBaseUrl);
  if (!trustedBase) {
    return { isTrusted: false, isPublic: false, normalizedRoute: null, reason: 'malformed' };
  }

  // Case 1: Absolute http:// or https:// URL
  if (/^https?:\/\//i.test(trimmed)) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return { isTrusted: false, isPublic: false, normalizedRoute: null, reason: 'malformed' };
    }

    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      !parsed.hostname ||
      !parsed.origin ||
      parsed.origin === 'null'
    ) {
      return { isTrusted: false, isPublic: false, normalizedRoute: null, reason: 'malformed' };
    }

    if (parsed.username || parsed.password) {
      return { isTrusted: false, isPublic: false, normalizedRoute: null, reason: 'malformed' };
    }

    if (parsed.origin !== trustedBase.origin) {
      return {
        isTrusted: false,
        isPublic: false,
        normalizedRoute: null,
        reason: 'untrusted_origin',
      };
    }

    const normalizedRoute = normalizeRouteFromPathname(parsed.pathname, trustedBase.pathname);
    return {
      isTrusted: true,
      isPublic: PUBLIC_AUTH_ROUTES.has(normalizedRoute),
      normalizedRoute,
    };
  }

  // Case 2: Reject malformed protocols missing ':' (e.g. http//evil.com) or explicit non-HTTP(S) schemes / host:port
  if (/^https?\/\//i.test(pathAndAuthorityPart)) {
    return { isTrusted: false, isPublic: false, normalizedRoute: null, reason: 'malformed' };
  }

  if (pathAndAuthorityPart.includes('://') || /^[^/]*:/.test(pathAndAuthorityPart)) {
    return {
      isTrusted: false,
      isPublic: false,
      normalizedRoute: null,
      reason: 'untrusted_scheme',
    };
  }

  // Case 3: Relative path resolved safely against the trusted backend origin
  const relativeWithLeadingSlash = trimmed.startsWith('/') ? trimmed : '/' + trimmed;
  let resolved: URL;
  try {
    resolved = new URL(relativeWithLeadingSlash, trustedBase.origin);
  } catch {
    return { isTrusted: false, isPublic: false, normalizedRoute: null, reason: 'malformed' };
  }

  if (resolved.origin !== trustedBase.origin) {
    return {
      isTrusted: false,
      isPublic: false,
      normalizedRoute: null,
      reason: 'untrusted_origin',
    };
  }

  const normalizedRoute = normalizeRouteFromPathname(resolved.pathname, trustedBase.pathname);
  return {
    isTrusted: true,
    isPublic: PUBLIC_AUTH_ROUTES.has(normalizedRoute),
    normalizedRoute,
  };
}

/**
 * Returns true strictly when url is either a valid relative path or an absolute URL
 * matching the configured backend origin (API_BASE_URL).
 */
export function isTrustedApiUrl(url?: string, trustedBaseUrl: string = API_BASE_URL): boolean {
  return classifyApiUrl(url, trustedBaseUrl).isTrusted;
}

/**
 * Returns true ONLY when url is trusted AND points to an allowed public auth route (/auth/login or /auth/register).
 * External, protocol-relative, and malformed URLs ALWAYS return false.
 */
export function isPublicEndpoint(url?: string, trustedBaseUrl: string = API_BASE_URL): boolean {
  const result = classifyApiUrl(url, trustedBaseUrl);
  return result.isTrusted && result.isPublic;
}

function isSameTrustedOrigin(candidateBaseUrl: string, trustedBaseUrl: string): boolean {
  const candidate = parseHttpBaseUrl(candidateBaseUrl);
  const trusted = parseHttpBaseUrl(trustedBaseUrl);
  return Boolean(candidate && trusted && candidate.origin === trusted.origin);
}

/**
 * Resolves and validates the effective baseURL for a request.
 * Only falls back to defaultBaseURL when requestBaseURL is strictly `undefined`.
 * Explicit empty strings (''), whitespace ('   '), null, non-strings,
 * protocol-relative URLs, credentials, or malformed URLs return null (never fallback).
 */
export function resolveEffectiveBaseURL(
  requestBaseURL: unknown,
  defaultBaseURL: unknown
): string | null {
  const candidate = requestBaseURL === undefined ? defaultBaseURL : requestBaseURL;

  if (typeof candidate !== 'string') {
    return null;
  }

  if (!candidate || hasControlCharacters(candidate) || /\s/.test(candidate)) {
    return null;
  }

  if (candidate.startsWith('//') || candidate.includes('\\')) {
    return null;
  }

  const parsed = parseHttpBaseUrl(candidate);
  if (!parsed) {
    return null;
  }

  return candidate;
}

/**
 * Verifies that an effective baseURL is non-null, valid HTTP/HTTPS,
 * and matches the exact scheme, hostname, and port of API_BASE_URL.
 */
export function isTrustedBaseURL(
  effectiveBaseURL: string | null,
  trustedBaseUrl: string = API_BASE_URL
): boolean {
  if (typeof effectiveBaseURL !== 'string' || !effectiveBaseURL) {
    return false;
  }
  return isSameTrustedOrigin(effectiveBaseURL, trustedBaseUrl);
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

/**
 * Strips manual 'Content-Type: multipart/form-data' so the browser / native networking layer
 * can automatically append the proper boundary parameter (e.g. multipart/form-data; boundary=...).
 * Works on AxiosHeaders instances and plain headers objects.
 */
export function cleanMultipartFormDataHeaders(config: { data?: unknown; headers?: any }): void {
  if (
    config.data &&
    typeof config.data === 'object' &&
    typeof (config.data as { append?: unknown }).append === 'function'
  ) {
    if (config.headers) {
      const rawVal =
        typeof config.headers.get === 'function'
          ? config.headers.get('Content-Type') || config.headers.get('content-type')
          : config.headers['Content-Type'] || config.headers['content-type'];
      const ct = typeof rawVal === 'string' ? rawVal.trim().toLowerCase() : '';
      if (ct === 'multipart/form-data' || ct.startsWith('multipart/form-data;')) {
        if (typeof config.headers.delete === 'function') {
          config.headers.delete('Content-Type');
          config.headers.delete('content-type');
        }
        delete config.headers['Content-Type'];
        delete config.headers['content-type'];
      }
    }
  }
}

// Request Interceptor: Enforce trusted effective baseURL & API URL before reading storage or attaching JWT
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Ensure multipart boundary is properly handled by browser/native adapter whenever data is FormData,
    // BEFORE any early returns (e.g. public endpoints, expectedUserId guarded routes).
    cleanMultipartFormDataHeaders(config);

    const reqMeta = (config as unknown) as Record<string, unknown>;
    const rawRequestBaseUrl = Object.prototype.hasOwnProperty.call(reqMeta, 'baseURL')
      ? reqMeta.baseURL
      : undefined;

    const effectiveBaseUrl = resolveEffectiveBaseURL(
      rawRequestBaseUrl,
      apiClient.defaults.baseURL
    );
    const isBaseTrusted = isTrustedBaseURL(effectiveBaseUrl, API_BASE_URL);
    const inspection = effectiveBaseUrl
      ? classifyApiUrl(config.url, effectiveBaseUrl)
      : { isTrusted: false, isPublic: false, normalizedRoute: null };

    if (!isBaseTrusted || !inspection.isTrusted) {
      reqMeta.isTrustedUrl = false;
      reqMeta.isPublic = false;
      return Promise.reject(
        new AppApiError({
          message: 'Địa chỉ API không hợp lệ hoặc không thuộc máy chủ tin cậy.',
          code: 'UNTRUSTED_API_URL',
        })
      );
    }

    const isPublic = inspection.isPublic || reqMeta.skipAuth === true;

    // Persist trust & auth metadata onto config so Response Interceptor shares the exact decision
    reqMeta.isTrustedUrl = true;
    reqMeta.isPublic = isPublic;

    // Public endpoints do not require token inspection
    if (isPublic) {
      return config;
    }

    // Protected endpoint: verify optional session identity guard and retrieve access token
    const rawExpectedUserId = Object.prototype.hasOwnProperty.call(reqMeta, 'expectedUserId')
      ? reqMeta.expectedUserId
      : undefined;
    const rawExpectedGeneration = Object.prototype.hasOwnProperty.call(
      reqMeta,
      'expectedSessionGeneration'
    )
      ? reqMeta.expectedSessionGeneration
      : undefined;

    const hasExpectedUserId = rawExpectedUserId !== undefined;
    const hasExpectedGeneration = rawExpectedGeneration !== undefined;

    if (hasExpectedUserId) {
      const expectedUserId =
        typeof rawExpectedUserId === 'string' ? rawExpectedUserId.trim() : '';
      if (!expectedUserId) {
        return Promise.reject(
          new AppApiError({
            message: 'Thông tin danh tính phiên làm việc không hợp lệ.',
            code: 'SESSION_USER_MISMATCH',
          })
        );
      }

      if (hasExpectedGeneration) {
        if (
          typeof rawExpectedGeneration !== 'number' ||
          !Number.isFinite(rawExpectedGeneration) ||
          getSessionGeneration() !== rawExpectedGeneration
        ) {
          return Promise.reject(
            new AppApiError({
              message: 'Phiên đăng nhập đã thay đổi, yêu cầu cũ đã bị hủy.',
              code: 'SESSION_USER_MISMATCH',
            })
          );
        }
      }

      let session: AuthSession | null = null;
      try {
        session = await getSession();
      } catch (storageErr) {
        // Storage read failure: halt request immediately, do NOT send request, do NOT fake 401
        return Promise.reject(normalizeApiError(storageErr));
      }

      if (!session || !session.accessToken) {
        return Promise.reject(
          new AppApiError({
            message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
            code: 'UNAUTHENTICATED',
          })
        );
      }

      if (
        session.user?.id !== expectedUserId ||
        (hasExpectedGeneration && getSessionGeneration() !== rawExpectedGeneration)
      ) {
        return Promise.reject(
          new AppApiError({
            message: 'Phiên đăng nhập đã chuyển sang tài khoản khác, thao tác cũ đã bị hủy.',
            code: 'SESSION_USER_MISMATCH',
          })
        );
      }

      if (config.headers) {
        config.headers.Authorization = `Bearer ${session.accessToken}`;
      }

      return config;
    }

    if (hasExpectedGeneration) {
      if (
        typeof rawExpectedGeneration !== 'number' ||
        !Number.isFinite(rawExpectedGeneration) ||
        getSessionGeneration() !== rawExpectedGeneration
      ) {
        return Promise.reject(
          new AppApiError({
            message: 'Phiên đăng nhập đã thay đổi, yêu cầu cũ đã bị hủy.',
            code: 'SESSION_USER_MISMATCH',
          })
        );
      }
    }

    // Unscoped protected endpoint: retrieve access token from secure storage
    let token: string | null = null;
    try {
      token = await getAccessToken();
    } catch (storageErr) {
      // Storage read failure: halt request immediately, do NOT send request, do NOT fake 401
      return Promise.reject(normalizeApiError(storageErr));
    }

    if (!token) {
      // Protected endpoint requested while unauthenticated
      return Promise.reject(
        new AppApiError({
          message: 'Yêu cầu phiên đăng nhập để thực hiện thao tác này.',
          code: 'UNAUTHENTICATED',
        })
      );
    }

    if (hasExpectedGeneration && getSessionGeneration() !== rawExpectedGeneration) {
      return Promise.reject(
        new AppApiError({
          message: 'Phiên đăng nhập đã thay đổi, yêu cầu cũ đã bị hủy.',
          code: 'SESSION_USER_MISMATCH',
        })
      );
    }

    if (config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    cleanMultipartFormDataHeaders(config);

    return config;
  },
  (error) => Promise.reject(normalizeApiError(error))
);

// Response Interceptor: Normalize envelopes and handle genuine backend 401
apiClient.interceptors.response.use(
  (response) => {
    // If backend envelope returned { success: false }, treat as application error
    if (response.data && typeof response.data === 'object' && response.data.success === false) {
      return Promise.reject(normalizeBackendFailure(response.data, response.status));
    }
    return response;
  },
  async (error) => {
    const normalizedError = normalizeApiError(error);

    // Handle genuine HTTP 401 Unauthorized only for trusted, protected backend endpoints
    if (normalizedError.statusCode === 401) {
      const reqConfig = error?.config as (Record<string, unknown> | undefined);
      const requestUrl = typeof reqConfig?.url === 'string' ? reqConfig.url : undefined;
      const rawRequestBaseUrl =
        reqConfig && Object.prototype.hasOwnProperty.call(reqConfig, 'baseURL')
          ? reqConfig.baseURL
          : undefined;

      const effectiveBaseUrl = resolveEffectiveBaseURL(
        rawRequestBaseUrl,
        apiClient.defaults.baseURL
      );
      const isBaseTrusted = isTrustedBaseURL(effectiveBaseUrl, API_BASE_URL);
      const inspection = effectiveBaseUrl
        ? classifyApiUrl(requestUrl, effectiveBaseUrl)
        : { isTrusted: false, isPublic: false, normalizedRoute: null };

      const isTrusted =
        isBaseTrusted && reqConfig?.isTrustedUrl !== false && inspection.isTrusted;
      const isAuthSkipped =
        reqConfig?.isPublic === true || reqConfig?.skipAuth === true || inspection.isPublic;

      if (isTrusted && !isAuthSkipped && unauthorizedListener) {
        const hasExpectedUserId =
          reqConfig !== undefined &&
          Object.prototype.hasOwnProperty.call(reqConfig, 'expectedUserId') &&
          reqConfig.expectedUserId !== undefined;
        const expectedUserId =
          typeof reqConfig?.expectedUserId === 'string' && reqConfig.expectedUserId.trim()
            ? reqConfig.expectedUserId.trim()
            : null;
        const hasExpectedGeneration =
          reqConfig !== undefined &&
          Object.prototype.hasOwnProperty.call(reqConfig, 'expectedSessionGeneration') &&
          reqConfig.expectedSessionGeneration !== undefined;
        const expectedGeneration =
          typeof reqConfig?.expectedSessionGeneration === 'number' &&
          Number.isFinite(reqConfig.expectedSessionGeneration)
            ? reqConfig.expectedSessionGeneration
            : null;

        let matchesCurrentSession = true;
        if (hasExpectedUserId && expectedUserId === null) {
          matchesCurrentSession = false;
        }
        if (hasExpectedGeneration && (expectedGeneration === null || getSessionGeneration() !== expectedGeneration)) {
          matchesCurrentSession = false;
        }
        if (matchesCurrentSession && expectedUserId !== null) {
          const activeSession = await getSession().catch(() => null);
          if (!activeSession || activeSession.user?.id !== expectedUserId) {
            matchesCurrentSession = false;
          }
          if (expectedGeneration !== null && getSessionGeneration() !== expectedGeneration) {
            matchesCurrentSession = false;
          }
        }

        if (matchesCurrentSession) {
          unauthorizedListener();
        }
      }
    }

    return Promise.reject(normalizedError);
  }
);
