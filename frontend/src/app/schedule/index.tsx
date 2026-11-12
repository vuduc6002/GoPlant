import { useIsFocused } from 'expo-router';

import { ScheduleScreen } from '@/features/main/MainScreens';
import { ScreenFocusProvider } from '@/features/schedule/useScheduleClock';

export default function ScheduleRouteScreen() {
  const isFocused = useIsFocused();
  return (
    <ScreenFocusProvider isFocused={isFocused}>
      <ScheduleScreen />
    </ScreenFocusProvider>
  );
}
