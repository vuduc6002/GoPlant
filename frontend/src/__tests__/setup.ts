import React from 'react';
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

vi.mock('react-native-svg', () => ({
  __esModule: true,
  default: ({
    children,
    accessibilityLabel,
    viewBox,
  }: {
    children?: React.ReactNode;
    accessibilityLabel?: string;
    viewBox?: string;
  }) =>
    React.createElement(
      'svg',
      {
        'aria-label': accessibilityLabel,
        viewBox,
        'data-testid': 'mock-svg',
      },
      children
    ),
  Svg: ({
    children,
    accessibilityLabel,
    viewBox,
  }: {
    children?: React.ReactNode;
    accessibilityLabel?: string;
    viewBox?: string;
  }) =>
    React.createElement(
      'svg',
      {
        'aria-label': accessibilityLabel,
        viewBox,
        'data-testid': 'mock-svg',
      },
      children
    ),
  Rect: ({
    x,
    y,
    width,
    height,
    fill,
  }: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    fill?: string;
  }) =>
    React.createElement('rect', {
      x,
      y,
      width,
      height,
      fill,
    }),
}));
