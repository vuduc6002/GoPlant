import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { getNextVnMidnightMs, getTodayVnDateString } from './scheduleApi';

export const DEFAULT_SCHEDULE_CLOCK_INTERVAL_MS = 10_000;
const MIN_SCHEDULE_CLOCK_INTERVAL_MS = 1_000;
const MAX_BOUNDARY_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export type ScheduleClockResumeReason = 'appstate' | 'focus' | 'vn-midnight';

export interface UseScheduleClockOptions {
  enabled?: boolean;
  isFocused?: boolean;
  intervalMs?: number;
  transitionIsoTimestamps?: readonly (string | null | undefined)[];
  trackVnMidnight?: boolean;
  onActiveRefresh?: (reason: ScheduleClockResumeReason) => void;
}

export interface UseScheduleClockResult {
  nowMs: number;
  vnDateKey: string;
  isAppActive: boolean;
  isFocused: boolean;
  isClockActive: boolean;
}

const ScreenFocusContext = createContext<boolean>(true);

export function ScreenFocusProvider({
  isFocused,
  children,
}: {
  isFocused: boolean;
  children: ReactNode;
}) {
  return createElement(ScreenFocusContext.Provider, { value: isFocused }, children);
}

export function useScreenFocused(): boolean {
  return useContext(ScreenFocusContext);
}

function readIsAppActive(): boolean {
  const currentState = AppState.currentState;
  return currentState === undefined || currentState === null || currentState === 'active';
}

function findEarliestDeadlineMs(
  timestamps: readonly (string | null | undefined)[] | undefined,
  nowMs: number
): number | null {
  if (!timestamps || timestamps.length === 0) {
    return null;
  }
  let earliest: number | null = null;
  for (const iso of timestamps) {
    if (typeof iso !== 'string' || !iso.trim()) {
      continue;
    }
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms) || ms <= nowMs) {
      continue;
    }
    if (earliest === null || ms < earliest) {
      earliest = ms;
    }
  }
  return earliest;
}

export function useScheduleClock(
  options: UseScheduleClockOptions = {}
): UseScheduleClockResult {
  const {
    enabled = true,
    isFocused: isFocusedOverride,
    intervalMs = DEFAULT_SCHEDULE_CLOCK_INTERVAL_MS,
    transitionIsoTimestamps,
    trackVnMidnight = false,
    onActiveRefresh,
  } = options;

  const contextFocused = useScreenFocused();
  const effectiveFocused = isFocusedOverride ?? contextFocused;
  const safeIntervalMs = Math.max(
    MIN_SCHEDULE_CLOCK_INTERVAL_MS,
    Number.isFinite(intervalMs) ? Math.trunc(intervalMs) : DEFAULT_SCHEDULE_CLOCK_INTERVAL_MS
  );

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [isAppActive, setIsAppActive] = useState<boolean>(() => readIsAppActive());

  const isMountedRef = useRef(true);
  const enabledRef = useRef(enabled);
  const focusedRef = useRef(effectiveFocused);
  const appActiveRef = useRef(isAppActive);
  const trackVnMidnightRef = useRef(trackVnMidnight);
  const onActiveRefreshRef = useRef(onActiveRefresh);
  const lastVnDateKeyRef = useRef<string | null>(null);

  useEffect(() => {
    enabledRef.current = enabled;
    focusedRef.current = effectiveFocused;
    appActiveRef.current = isAppActive;
    trackVnMidnightRef.current = trackVnMidnight;
    onActiveRefreshRef.current = onActiveRefresh;
  }, [enabled, effectiveFocused, isAppActive, trackVnMidnight, onActiveRefresh]);

  const isClockActive = enabled && effectiveFocused && isAppActive;

  useEffect(() => {
    isMountedRef.current = true;
    const initialActive = readIsAppActive();
    appActiveRef.current = initialActive;
    setIsAppActive((prev) => (prev === initialActive ? prev : initialActive));
    lastVnDateKeyRef.current = getTodayVnDateString(new Date(Date.now()));

    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (!isMountedRef.current) {
          return;
        }
        const nextActive = nextState === 'active';
        const prevActive = appActiveRef.current;
        appActiveRef.current = nextActive;
        setIsAppActive((prev) => (prev === nextActive ? prev : nextActive));

        if (!prevActive && nextActive) {
          const currentNow = Date.now();
          setNowMs(currentNow);
          if (enabledRef.current && focusedRef.current) {
            const currentVnDate = getTodayVnDateString(new Date(currentNow));
            const prevVnDate = lastVnDateKeyRef.current;
            lastVnDateKeyRef.current = currentVnDate;
            const reason: ScheduleClockResumeReason =
              prevVnDate && prevVnDate !== currentVnDate ? 'vn-midnight' : 'appstate';
            onActiveRefreshRef.current?.(reason);
          }
        }
      }
    );

    return () => {
      isMountedRef.current = false;
      subscription?.remove?.();
    };
  }, []);

  const wasFocusedRef = useRef(effectiveFocused);
  useEffect(() => {
    const prevFocused = wasFocusedRef.current;
    wasFocusedRef.current = effectiveFocused;
    if (!prevFocused && effectiveFocused && enabled && appActiveRef.current) {
      const currentNow = Date.now();
      setNowMs(currentNow);
      const currentVnDate = getTodayVnDateString(new Date(currentNow));
      const prevVnDate = lastVnDateKeyRef.current;
      lastVnDateKeyRef.current = currentVnDate;
      const reason: ScheduleClockResumeReason =
        prevVnDate && prevVnDate !== currentVnDate ? 'vn-midnight' : 'focus';
      onActiveRefreshRef.current?.(reason);
    }
  }, [effectiveFocused, enabled]);

  const wasEnabledRef = useRef(enabled);
  useEffect(() => {
    const prevEnabled = wasEnabledRef.current;
    wasEnabledRef.current = enabled;
    if (!prevEnabled && enabled) {
      const currentNow = Date.now();
      setNowMs(currentNow);
      lastVnDateKeyRef.current = getTodayVnDateString(new Date(currentNow));
    }
  }, [enabled]);

  useEffect(() => {
    if (!isClockActive) {
      return;
    }

    const syncFromTimer = () => {
      if (
        !isMountedRef.current ||
        !enabledRef.current ||
        !focusedRef.current ||
        !appActiveRef.current
      ) {
        return;
      }
      const currentNow = Date.now();
      setNowMs((prev) => (prev === currentNow ? prev : currentNow));
      const currentVnDate = getTodayVnDateString(new Date(currentNow));
      const prevVnDate = lastVnDateKeyRef.current;
      lastVnDateKeyRef.current = currentVnDate;
      if (trackVnMidnightRef.current && prevVnDate && prevVnDate !== currentVnDate) {
        onActiveRefreshRef.current?.('vn-midnight');
      }
    };

    const intervalId = setInterval(syncFromTimer, safeIntervalMs);
    return () => {
      clearInterval(intervalId);
    };
  }, [isClockActive, safeIntervalMs]);

  const earliestScheduleDeadlineMs = findEarliestDeadlineMs(transitionIsoTimestamps, nowMs);
  const nextVnMidnightMs = trackVnMidnight ? getNextVnMidnightMs(nowMs) : null;
  const nextBoundaryMs =
    earliestScheduleDeadlineMs !== null && nextVnMidnightMs !== null
      ? Math.min(earliestScheduleDeadlineMs, nextVnMidnightMs)
      : (earliestScheduleDeadlineMs ?? nextVnMidnightMs);

  useEffect(() => {
    if (!isClockActive || nextBoundaryMs === null) {
      return;
    }

    const delayMs = nextBoundaryMs - Date.now();
    if (delayMs > MAX_BOUNDARY_TIMEOUT_MS) {
      return;
    }

    const safeDelay = Math.max(0, delayMs);
    const timeoutId = setTimeout(() => {
      if (
        !isMountedRef.current ||
        !enabledRef.current ||
        !focusedRef.current ||
        !appActiveRef.current
      ) {
        return;
      }
      const currentNow = Date.now();
      setNowMs((prev) => (prev === currentNow ? prev : currentNow));
      const currentVnDate = getTodayVnDateString(new Date(currentNow));
      const prevVnDate = lastVnDateKeyRef.current;
      lastVnDateKeyRef.current = currentVnDate;
      if (trackVnMidnightRef.current && prevVnDate && prevVnDate !== currentVnDate) {
        onActiveRefreshRef.current?.('vn-midnight');
      }
    }, safeDelay);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isClockActive, nextBoundaryMs]);

  return {
    nowMs,
    vnDateKey: getTodayVnDateString(new Date(nowMs)),
    isAppActive,
    isFocused: effectiveFocused,
    isClockActive,
  };
}
