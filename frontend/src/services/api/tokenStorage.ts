import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { AuthSession } from './apiTypes';

const SESSION_STORAGE_KEY = 'goplant_auth_session';

// In-memory fallback if neither SecureStore nor localStorage is available
let memoryStorage: string | null = null;

async function isSecureStoreAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

async function writeRaw(key: string, value: string): Promise<void> {
  const available = await isSecureStoreAvailable();
  if (available) {
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
    return;
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(key, value);
    return;
  }

  memoryStorage = value;
}

async function readRaw(key: string): Promise<string | null> {
  const available = await isSecureStoreAvailable();
  if (available) {
    return await SecureStore.getItemAsync(key);
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem(key);
  }

  return memoryStorage;
}

async function deleteRaw(key: string): Promise<void> {
  const available = await isSecureStoreAvailable();
  if (available) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore if item does not exist
    }
    return;
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(key);
    return;
  }

  memoryStorage = null;
}

/**
 * Persists an authenticated user session.
 * Throws an error if saving fails so login cannot be falsely marked successful.
 */
export async function saveSession(session: AuthSession): Promise<void> {
  if (!session || !session.accessToken || !session.user) {
    throw new Error('Dữ liệu phiên làm việc không hợp lệ để lưu trữ.');
  }

  const payload = JSON.stringify(session);
  await writeRaw(SESSION_STORAGE_KEY, payload);
}

/**
 * Retrieves the stored session.
 * If data is corrupted, automatically clears the corrupt entry and returns null.
 */
export async function getSession(): Promise<AuthSession | null> {
  try {
    const raw = await readRaw(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed || typeof parsed !== 'object' || !parsed.accessToken || !parsed.user) {
      // Data is malformed; clean up corrupt state
      await deleteRaw(SESSION_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    // Malformed JSON or storage read error
    await deleteRaw(SESSION_STORAGE_KEY);
    return null;
  }
}

/**
 * Fast helper to obtain the current access token for Authorization headers.
 */
export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  return session ? session.accessToken : null;
}

/**
 * Completely clears the stored session upon logout or 401 unrecoverable error.
 */
export async function clearSession(): Promise<void> {
  await deleteRaw(SESSION_STORAGE_KEY);
}
