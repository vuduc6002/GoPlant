import { Platform } from 'react-native';

/**
 * Resolves the default API Base URL depending on the current runtime platform.
 * - Android Emulator: 10.0.2.2 maps to host machine localhost
 * - Web / iOS Simulator: localhost
 */
function getDefaultBaseUrl(): string {
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8080/api/v1';
  }
  return 'http://localhost:8080/api/v1';
}

function resolveApiBaseUrl(): { url: string; isConfigured: boolean } {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

  if (!envUrl) {
    const fallback = getDefaultBaseUrl();
    if (__DEV__) {
      console.warn(
        `[GoPlant API] EXPO_PUBLIC_API_BASE_URL chưa được thiết lập trong frontend/.env. ` +
        `Đang sử dụng cấu hình mặc định: ${fallback}. ` +
        `Vui lòng tham khảo frontend/.env.example để cấu hình chính xác.`
      );
    }
    return { url: fallback, isConfigured: false };
  }

  // Remove trailing slashes
  let cleanUrl = envUrl.replace(/\/+$/, '');

  // Ensure /api/v1 prefix is preserved
  if (!cleanUrl.endsWith('/api/v1')) {
    if (cleanUrl.endsWith('/api')) {
      cleanUrl = `${cleanUrl}/v1`;
    } else {
      cleanUrl = `${cleanUrl}/api/v1`;
    }
  }

  return { url: cleanUrl, isConfigured: true };
}

const { url: resolvedUrl, isConfigured } = resolveApiBaseUrl();

export const API_BASE_URL = resolvedUrl;
export const isApiBaseUrlConfigured = isConfigured;

const rawTimeout = Number(process.env.EXPO_PUBLIC_API_TIMEOUT);
export const API_TIMEOUT = !isNaN(rawTimeout) && rawTimeout > 0 ? rawTimeout : 15000;
