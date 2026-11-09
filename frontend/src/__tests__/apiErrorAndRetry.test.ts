import { describe, it, expect } from 'vitest';
import {
  AppApiError,
  normalizeApiError,
  normalizeBackendFailure,
} from '../services/api/apiError';
import { StorageError } from '../services/api/tokenStorage';
import { shouldRetry } from '../services/query/queryClient';
import type { ApiResponse } from '../services/api/apiTypes';

describe('API Error Normalization & TanStack Query Retry Policy', () => {
  describe('normalizeApiError', () => {
    it('preserves existing AppApiError instances intact', () => {
      const err = new AppApiError({
        message: 'Lỗi tùy chỉnh',
        code: 'CUSTOM_CODE',
        statusCode: 418,
      });
      const normalized = normalizeApiError(err);
      expect(normalized).toBe(err);
      expect(normalized.statusCode).toBe(418);
      expect(normalized.code).toBe('CUSTOM_CODE');
    });

    it('normalizes StorageError correctly with isStorageError flag and no HTTP status', () => {
      const storageErr = new StorageError({
        code: 'READ_FAILED',
        operation: 'read',
        message: 'Lỗi đọc SecureStore',
      });
      const normalized = normalizeApiError(storageErr);

      expect(normalized).toBeInstanceOf(AppApiError);
      expect(normalized.code).toBe('READ_FAILED');
      expect(normalized.message).toBe('Lỗi đọc SecureStore');
      expect(normalized.isStorageError).toBe(true);
      expect(normalized.statusCode).toBeUndefined();
      expect(normalized.isAuthError).toBe(false);
      expect(normalized.isNetworkError).toBe(false);
    });

    it('normalizes STORAGE_UNAVAILABLE correctly', () => {
      const storageErr = new StorageError({
        code: 'STORAGE_UNAVAILABLE',
        operation: 'check_availability',
        message: 'SecureStore không khả dụng',
      });
      const normalized = normalizeApiError(storageErr);

      expect(normalized.code).toBe('STORAGE_UNAVAILABLE');
      expect(normalized.isStorageError).toBe(true);
      expect(normalized.statusCode).toBeUndefined();
    });

    it('normalizes backend failure envelope without losing code, message, or field', () => {
      const envelope: ApiResponse<unknown> = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Họ tên không được để trống',
          field: 'fullName',
        },
        timestamp: '2026-11-10T12:00:00Z',
      };

      const normalized = normalizeBackendFailure(envelope, 400);

      expect(normalized).toBeInstanceOf(AppApiError);
      expect(normalized.statusCode).toBe(400);
      expect(normalized.code).toBe('VALIDATION_ERROR');
      expect(normalized.field).toBe('fullName');
      expect(normalized.message).toBe('Họ tên không được để trống');
      expect(normalized.timestamp).toBe('2026-11-10T12:00:00Z');
      expect(normalized.isValidationError).toBe(true);
      expect(normalized.isAuthError).toBe(false);
    });

    it('normalizes HTTP 401 response with isAuthError flag', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 401,
          data: {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Token hết hạn' },
          },
        },
      };

      const normalized = normalizeApiError(axiosError);

      expect(normalized.statusCode).toBe(401);
      expect(normalized.code).toBe('UNAUTHORIZED');
      expect(normalized.isAuthError).toBe(true);
      expect(normalized.isForbiddenError).toBe(false);
    });

    it('normalizes HTTP 403 response with isForbiddenError flag', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 403,
          data: {
            success: false,
            error: { code: 'FORBIDDEN', message: 'Không có quyền truy cập' },
          },
        },
      };

      const normalized = normalizeApiError(axiosError);

      expect(normalized.statusCode).toBe(403);
      expect(normalized.code).toBe('FORBIDDEN');
      expect(normalized.isForbiddenError).toBe(true);
    });

    it('normalizes HTTP 409 conflict response with isConflictError flag', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 409,
          data: {
            success: false,
            error: { code: 'CONFLICT', message: 'Tài khoản đã tồn tại' },
          },
        },
      };

      const normalized = normalizeApiError(axiosError);

      expect(normalized.statusCode).toBe(409);
      expect(normalized.code).toBe('CONFLICT');
      expect(normalized.isConflictError).toBe(true);
    });

    it('normalizes timeout errors with isTimeoutError and isNetworkError flags', () => {
      const axiosError = {
        isAxiosError: true,
        code: 'ECONNABORTED',
        message: 'timeout of 10000ms exceeded',
      };

      const normalized = normalizeApiError(axiosError);

      expect(normalized.code).toBe('TIMEOUT_ERROR');
      expect(normalized.isTimeoutError).toBe(true);
      expect(normalized.isNetworkError).toBe(true);
    });

    it('normalizes network disconnect errors with isNetworkError flag', () => {
      const axiosError = {
        isAxiosError: true,
        message: 'Network Error',
      };

      const normalized = normalizeApiError(axiosError);

      expect(normalized.code).toBe('NETWORK_ERROR');
      expect(normalized.isNetworkError).toBe(true);
    });
  });

  describe('shouldRetry Policy (TanStack React Query)', () => {
    it('retries Network errors up to 2 times', () => {
      const networkError = new AppApiError({
        message: 'Network error',
        code: 'NETWORK_ERROR',
        isNetworkError: true,
      });

      expect(shouldRetry(0, networkError)).toBe(true);
      expect(shouldRetry(1, networkError)).toBe(true);
      expect(shouldRetry(2, networkError)).toBe(false);
    });

    it('retries Timeout errors up to 2 times', () => {
      const timeoutError = new AppApiError({
        message: 'Timeout error',
        code: 'TIMEOUT_ERROR',
        isNetworkError: true,
      });

      expect(shouldRetry(0, timeoutError)).toBe(true);
      expect(shouldRetry(1, timeoutError)).toBe(true);
      expect(shouldRetry(2, timeoutError)).toBe(false);
    });

    it('retries HTTP 5xx server errors up to 2 times', () => {
      const server500 = new AppApiError({ message: 'Internal Server Error', statusCode: 500 });
      const server502 = new AppApiError({ message: 'Bad Gateway', statusCode: 502 });
      const server503 = new AppApiError({ message: 'Service Unavailable', statusCode: 503 });

      expect(shouldRetry(0, server500)).toBe(true);
      expect(shouldRetry(1, server502)).toBe(true);
      expect(shouldRetry(1, server503)).toBe(true);
      expect(shouldRetry(2, server500)).toBe(false);
    });

    it('NEVER retries HTTP 4xx client errors (400, 401, 403, 404, 409)', () => {
      const err400 = new AppApiError({ message: 'Bad Request', statusCode: 400 });
      const err401 = new AppApiError({ message: 'Unauthorized', statusCode: 401 });
      const err403 = new AppApiError({ message: 'Forbidden', statusCode: 403 });
      const err404 = new AppApiError({ message: 'Not Found', statusCode: 404 });
      const err409 = new AppApiError({ message: 'Conflict', statusCode: 409 });

      expect(shouldRetry(0, err400)).toBe(false);
      expect(shouldRetry(0, err401)).toBe(false);
      expect(shouldRetry(0, err403)).toBe(false);
      expect(shouldRetry(0, err404)).toBe(false);
      expect(shouldRetry(0, err409)).toBe(false);
    });

    it('NEVER retries StorageError', () => {
      const storageError = new StorageError({
        code: 'READ_FAILED',
        operation: 'read',
        message: 'SecureStore error',
      });
      const normalizedStorageErr = normalizeApiError(storageError);

      expect(shouldRetry(0, storageError)).toBe(false);
      expect(shouldRetry(0, normalizedStorageErr)).toBe(false);
    });

    it('NEVER retries generic unknown errors or non-error objects', () => {
      expect(shouldRetry(0, new Error('Generic error'))).toBe(false);
      expect(shouldRetry(0, 'string error')).toBe(false);
      expect(shouldRetry(0, null)).toBe(false);
      expect(shouldRetry(0, undefined)).toBe(false);
    });
  });
});
