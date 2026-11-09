import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { AuthSession } from './apiTypes';

export const SESSION_STORAGE_KEY = 'goplant_auth_session';

export type StorageErrorCode =
  | 'STORAGE_UNAVAILABLE'
  | 'READ_FAILED'
  | 'WRITE_FAILED'
  | 'DELETE_FAILED';

export type StorageOperation = 'check_availability' | 'read' | 'write' | 'delete';

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  readonly operation: StorageOperation;
  readonly cause?: unknown;

  constructor(params: {
    code: StorageErrorCode;
    operation: StorageOperation;
    message: string;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = 'StorageError';
    this.code = params.code;
    this.operation = params.operation;
    this.cause = params.cause;
  }

  get isStorageUnavailable(): boolean {
    return this.code === 'STORAGE_UNAVAILABLE';
  }
}

/**
 * In-memory session store strictly for Web demo execution.
 * Web does not provide hardware-backed SecureStore, and localStorage
 * is deliberately avoided to prevent persistent JWT exposure to XSS.
 * This session is transient and automatically discarded on page refresh.
 */
let webMemorySession: AuthSession | null = null;

/**
 * Testing helper to reset in-memory web session between test runs.
 */
export function _resetWebMemorySession(): void {
  webMemorySession = null;
}

/**
 * Validates that an object conforms strictly to the AuthSession schema.
 */
export function isValidSession(data: unknown): data is AuthSession {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const s = data as Record<string, unknown>;

  if (typeof s.accessToken !== 'string' || !s.accessToken.trim()) {
    return false;
  }
  if (typeof s.tokenType !== 'string' || !s.tokenType.trim()) {
    return false;
  }
  if (!s.user || typeof s.user !== 'object') {
    return false;
  }

  const u = s.user as Record<string, unknown>;
  if (typeof u.id !== 'string' || !u.id.trim()) {
    return false;
  }
  if (typeof u.fullName !== 'string' || !u.fullName.trim()) {
    return false;
  }
  if (!Array.isArray(u.roles)) {
    return false;
  }
  if (u.email !== null && typeof u.email !== 'string' && u.email !== undefined) {
    return false;
  }

  return true;
}

async function assertNativeSecureStoreAvailable(): Promise<void> {
  try {
    const isAvailable = await SecureStore.isAvailableAsync();
    if (!isAvailable) {
      throw new StorageError({
        code: 'STORAGE_UNAVAILABLE',
        operation: 'check_availability',
        message: 'Thiết bị không hỗ trợ lưu trữ bảo mật SecureStore. Phiên đăng nhập không thể lưu an toàn.',
      });
    }
  } catch (err) {
    if (err instanceof StorageError) throw err;
    throw new StorageError({
      code: 'STORAGE_UNAVAILABLE',
      operation: 'check_availability',
      message:
        'Không thể kiểm tra tính khả dụng của SecureStore trên thiết bị: ' +
        (err instanceof Error ? err.message : String(err)),
      cause: err,
    });
  }
}

/**
 * Persists an authenticated user session.
 * - On Native (Android/iOS): Saves to hardware-backed SecureStore.
 * - On Web: Stores in RAM (in-memory) only. localStorage is never used.
 * Throws StorageError if saving fails.
 */
export async function saveSession(session: AuthSession): Promise<void> {
  if (!isValidSession(session)) {
    throw new StorageError({
      code: 'WRITE_FAILED',
      operation: 'write',
      message: 'Dữ liệu phiên làm việc không hợp lệ để lưu trữ.',
    });
  }

  if (Platform.OS === 'web') {
    webMemorySession = { ...session };
    return;
  }

  await assertNativeSecureStoreAvailable();

  try {
    const payload = JSON.stringify(session);
    await SecureStore.setItemAsync(SESSION_STORAGE_KEY, payload, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  } catch (err) {
    throw new StorageError({
      code: 'WRITE_FAILED',
      operation: 'write',
      message:
        'Lưu trữ phiên đăng nhập vào SecureStore thất bại: ' +
        (err instanceof Error ? err.message : String(err)),
      cause: err,
    });
  }
}

/**
 * Retrieves the stored session.
 * - If data is corrupted (invalid JSON or invalid schema), deletes corrupt data and returns null.
 * - If SecureStore encounters an I/O or security error, throws StorageError without deleting data.
 * - On Web, returns in-memory session.
 */
export async function getSession(): Promise<AuthSession | null> {
  if (Platform.OS === 'web') {
    return webMemorySession ? { ...webMemorySession } : null;
  }

  await assertNativeSecureStoreAvailable();

  let raw: string | null = null;
  try {
    raw = await SecureStore.getItemAsync(SESSION_STORAGE_KEY);
  } catch (err) {
    // I/O or hardware failure: DO NOT delete user data, throw typed error to caller
    throw new StorageError({
      code: 'READ_FAILED',
      operation: 'read',
      message:
        'Không thể đọc phiên làm việc từ SecureStore: ' +
        (err instanceof Error ? err.message : String(err)),
      cause: err,
    });
  }

  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isValidSession(parsed)) {
      // JSON is structurally corrupt or does not match schema; safe to clean up
      await safeDeleteCorruptSession();
      return null;
    }
    return parsed;
  } catch {
    // Malformed JSON syntax; clean up corrupt key
    await safeDeleteCorruptSession();
    return null;
  }
}

async function safeDeleteCorruptSession(): Promise<void> {
  try {
    if (Platform.OS !== 'web') {
      await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
    }
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Fast helper to obtain the current access token for Authorization headers.
 * Does NOT swallow StorageError: allows StorageError to propagate to caller.
 */
export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  return session ? session.accessToken : null;
}

/**
 * Completely clears the stored session upon logout or 401 unrecoverable error.
 */
export async function clearSession(): Promise<void> {
  if (Platform.OS === 'web') {
    webMemorySession = null;
    return;
  }

  try {
    await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
  } catch (err) {
    throw new StorageError({
      code: 'DELETE_FAILED',
      operation: 'delete',
      message:
        'Xóa phiên đăng nhập khỏi SecureStore thất bại: ' +
        (err instanceof Error ? err.message : String(err)),
      cause: err,
    });
  }
}
