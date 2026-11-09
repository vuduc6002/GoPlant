import { vi } from 'vitest';

// Enable React act() environment
// @ts-expect-error IS_REACT_ACT_ENVIRONMENT is a global flag for React
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn().mockResolvedValue(true),
  getItemAsync: vi.fn().mockResolvedValue(null),
  setItemAsync: vi.fn().mockResolvedValue(undefined),
  deleteItemAsync: vi.fn().mockResolvedValue(undefined),
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
}));
