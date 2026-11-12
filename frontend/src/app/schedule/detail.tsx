import { useIsFocused } from 'expo-router';

import { ScheduleDetailScreen } from '@/features/schedule/ScheduleScreens';
import { ScreenFocusProvider } from '@/features/schedule/useScheduleClock';

export default function ScheduleDetailRouteScreen() {
  const isFocused = useIsFocused();
  return (
    <ScreenFocusProvider isFocused={isFocused}>
      <ScheduleDetailScreen />
    </ScreenFocusProvider>
  );
}
