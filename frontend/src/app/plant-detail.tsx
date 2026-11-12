import { useIsFocused } from 'expo-router';

import PlantDetailScreen from '@/features/plants/PlantDetailScreen';
import { ScreenFocusProvider } from '@/features/schedule/useScheduleClock';

export default function PlantDetailRouteScreen() {
  const isFocused = useIsFocused();
  return (
    <ScreenFocusProvider isFocused={isFocused}>
      <PlantDetailScreen />
    </ScreenFocusProvider>
  );
}
