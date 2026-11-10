import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  saveSession,
  getSession,
  getAccessToken,
  clearSession,
  isValidSession,
  StorageError,
  SESSION_STORAGE_KEY,
  _resetWebMemorySession,
} from '../services/api/tokenStorage';
import type { AuthSession } from '../services/api/apiTypes';

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
}));

describe('tokenStorage', () => {
  const validSession: AuthSession = {
    accessToken: 'test-jwt-token-12345',
    tokenType: 'Bearer',
    expiresIn: 86400,
    user: {
      id: 'usr_001',
      fullName: 'Nguyễn Văn A',
      email: 'user@example.com',
      roles: ['ROLE_USER'],
    },
    savedAt: 1700000000000,
  };

  const validSessionWithNullEmail: AuthSession = {
    accessToken: 'test-jwt-token-phone',
    tokenType: 'Bearer',
    expiresIn: 86400,
    user: {
      id: 'usr_002',
      fullName: 'Trần Thị B',
      email: null,
      roles: ['ROLE_USER'],
    },
    savedAt: 1700000000000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    _resetWebMemorySession();
    // Default to Native platform for tests unless overridden
    (Platform as { OS: string }).OS = 'android';
    vi.mocked(SecureStore.isAvailableAsync).mockResolvedValue(true);
  });

  describe('Schema Validation (isValidSession)', () => {
    it('accepts valid session with email', () => {
      expect(isValidSession(validSession)).toBe(true);
    });

    it('accepts valid session with null email', () => {
      expect(isValidSession(validSessionWithNullEmail)).toBe(true);
    });

    it('accepts valid session with undefined email', () => {
      const sessionWithoutEmail = {
        ...validSession,
        user: { ...validSession.user, email: undefined },
      };
      expect(isValidSession(sessionWithoutEmail)).toBe(true);
    });

    it('rejects session with missing accessToken or empty accessToken', () => {
      expect(isValidSession({ ...validSession, accessToken: '' })).toBe(false);
      expect(isValidSession({ ...validSession, accessToken: '   ' })).toBe(false);
      expect(isValidSession({ ...validSession, accessToken: undefined })).toBe(false);
    });

    it('rejects session with missing tokenType or empty tokenType', () => {
      expect(isValidSession({ ...validSession, tokenType: '' })).toBe(false);
      expect(isValidSession({ ...validSession, tokenType: undefined })).toBe(false);
    });

    it('rejects session with invalid savedAt (missing, negative, zero, NaN, or non-finite)', () => {
      expect(isValidSession({ ...validSession, savedAt: undefined })).toBe(false);
      expect(isValidSession({ ...validSession, savedAt: -100 })).toBe(false);
      expect(isValidSession({ ...validSession, savedAt: 0 })).toBe(false);
      expect(isValidSession({ ...validSession, savedAt: NaN })).toBe(false);
      expect(isValidSession({ ...validSession, savedAt: Infinity })).toBe(false);
      expect(isValidSession({ ...validSession, savedAt: '1700000000000' as unknown as number })).toBe(false);
    });

    it('rejects session with invalid expiresIn when defined (negative, zero, NaN, or Infinity)', () => {
      expect(isValidSession({ ...validSession, expiresIn: -3600 })).toBe(false);
      expect(isValidSession({ ...validSession, expiresIn: 0 })).toBe(false);
      expect(isValidSession({ ...validSession, expiresIn: NaN })).toBe(false);
      expect(isValidSession({ ...validSession, expiresIn: Infinity })).toBe(false);
      expect(isValidSession({ ...validSession, expiresIn: '86400' as unknown as number })).toBe(false);
    });

    it('accepts session without expiresIn (expiresIn is optional)', () => {
      const { expiresIn: _, ...sessionWithoutExpiresIn } = validSession;
      expect(isValidSession(sessionWithoutExpiresIn)).toBe(true);
    });

    it('rejects session with missing user or missing user fields', () => {
      expect(isValidSession({ ...validSession, user: null })).toBe(false);
      expect(isValidSession({ ...validSession, user: { ...validSession.user, id: '' } })).toBe(false);
      expect(isValidSession({ ...validSession, user: { ...validSession.user, fullName: '' } })).toBe(false);
    });

    it('rejects session if user.roles is not an array or is empty', () => {
      expect(isValidSession({ ...validSession, user: { ...validSession.user, roles: 'NOT_ARRAY' } })).toBe(false);
      expect(isValidSession({ ...validSession, user: { ...validSession.user, roles: [] } })).toBe(false);
    });

    it('rejects session if user.roles contains non-string, empty string, or null elements', () => {
      expect(isValidSession({ ...validSession, user: { ...validSession.user, roles: [123] } })).toBe(false);
      expect(isValidSession({ ...validSession, user: { ...validSession.user, roles: [null] } })).toBe(false);
      expect(isValidSession({ ...validSession, user: { ...validSession.user, roles: [''] } })).toBe(false);
      expect(isValidSession({ ...validSession, user: { ...validSession.user, roles: ['   '] } })).toBe(false);
      expect(isValidSession({ ...validSession, user: { ...validSession.user, roles: [{}] } })).toBe(false);
    });

    it('rejects session if user.email is of invalid type', () => {
      expect(isValidSession({ ...validSession, user: { ...validSession.user, email: 12345 } })).toBe(false);
      expect(isValidSession({ ...validSession, user: { ...validSession.user, email: {} } })).toBe(false);
    });

    it('rejects corrupt non-object data', () => {
      expect(isValidSession(null)).toBe(false);
      expect(isValidSession('string')).toBe(false);
      expect(isValidSession(12345)).toBe(false);
    });
  });

  describe('Native SecureStore - Read, Write, Delete', () => {
    it('saves session successfully to SecureStore on native', async () => {
      vi.mocked(SecureStore.setItemAsync).mockResolvedValue();

      await saveSession(validSession);

      expect(SecureStore.isAvailableAsync).toHaveBeenCalled();
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        SESSION_STORAGE_KEY,
        JSON.stringify(validSession),
        { keychainAccessible: 'AFTER_FIRST_UNLOCK' }
      );
    });

    it('throws StorageError with WRITE_FAILED when saveSession fails', async () => {
      vi.mocked(SecureStore.setItemAsync).mockRejectedValue(new Error('Hardware write error'));

      await expect(saveSession(validSession)).rejects.toThrow(StorageError);
      await expect(saveSession(validSession)).rejects.toMatchObject({
        code: 'WRITE_FAILED',
        operation: 'write',
      });
    });

    it('throws StorageError with WRITE_FAILED when session data is invalid', async () => {
      const invalidData = { accessToken: '' } as unknown as AuthSession;
      await expect(saveSession(invalidData)).rejects.toThrow(StorageError);
      await expect(saveSession(invalidData)).rejects.toMatchObject({
        code: 'WRITE_FAILED',
        operation: 'write',
      });
    });

    it('retrieves valid session from SecureStore', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify(validSession));

      const session = await getSession();

      expect(session).toEqual(validSession);
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith(SESSION_STORAGE_KEY);
    });

    it('returns null when no session is stored', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);

      const session = await getSession();

      expect(session).toBeNull();
    });

    it('throws StorageError with READ_FAILED on I/O error and DOES NOT delete stored data', async () => {
      vi.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error('Secure storage locked'));

      await expect(getSession()).rejects.toThrow(StorageError);
      await expect(getSession()).rejects.toMatchObject({
        code: 'READ_FAILED',
        operation: 'read',
      });

      // MUST NOT delete stored session on transient read failure
      expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    });

    it('cleans up corrupt/malformed JSON and returns null without throwing', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue('MALFORMED_JSON{{{');

      const session = await getSession();

      expect(session).toBeNull();
      // Corrupt payload should be cleaned up
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SESSION_STORAGE_KEY);
    });

    it('cleans up session with invalid schema and returns null', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(
        JSON.stringify({ accessToken: 'valid_token', user: { id: '' } })
      );

      const session = await getSession();

      expect(session).toBeNull();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SESSION_STORAGE_KEY);
    });

    it('deletes session successfully from SecureStore', async () => {
      vi.mocked(SecureStore.deleteItemAsync).mockResolvedValue();

      await clearSession();

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SESSION_STORAGE_KEY);
    });

    it('throws StorageError with DELETE_FAILED when delete fails', async () => {
      vi.mocked(SecureStore.deleteItemAsync).mockRejectedValue(new Error('Hardware delete error'));

      await expect(clearSession()).rejects.toThrow(StorageError);
      await expect(clearSession()).rejects.toMatchObject({
        code: 'DELETE_FAILED',
        operation: 'delete',
      });
    });

    it('throws STORAGE_UNAVAILABLE when SecureStore is not available on device', async () => {
      vi.mocked(SecureStore.isAvailableAsync).mockResolvedValue(false);

      await expect(getSession()).rejects.toThrow(StorageError);
      await expect(getSession()).rejects.toMatchObject({
        code: 'STORAGE_UNAVAILABLE',
        operation: 'check_availability',
        isStorageUnavailable: true,
      });
    });

    it('propagates StorageError from getAccessToken() instead of swallowing it', async () => {
      vi.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error('I/O error'));

      await expect(getAccessToken()).rejects.toThrow(StorageError);
    });

    it('returns token from getAccessToken() when session exists', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify(validSession));

      const token = await getAccessToken();

      expect(token).toBe('test-jwt-token-12345');
    });
  });

  describe('Web Platform - Strict In-Memory RAM Storage', () => {
    beforeEach(() => {
      (Platform as { OS: string }).OS = 'web';
    });

    it('stores and retrieves session purely in RAM on Web', async () => {
      await saveSession(validSession);

      const session = await getSession();
      expect(session).toEqual(validSession);

      // SecureStore should never be called on Web
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
      expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    });

    it('clears session from RAM on Web', async () => {
      await saveSession(validSession);
      await clearSession();

      const session = await getSession();
      expect(session).toBeNull();
      expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    });

    it('supports nullable email in Web RAM storage', async () => {
      await saveSession(validSessionWithNullEmail);

      const session = await getSession();
      expect(session?.user.email).toBeNull();
    });
  });
});
