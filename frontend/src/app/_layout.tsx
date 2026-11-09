import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { QueryClientProvider } from '@tanstack/react-query';

import { GoPlantColors } from '@/constants/theme';
import { PlantDataProvider } from '@/features/plants/PlantDataStore';
import { AuthProvider, useAuth } from '@/features/auth';
import { queryClient } from '@/services/query/queryClient';

SplashScreen.preventAutoHideAsync();

function NavigationGuard({ fontsLoaded, fontError }: { fontsLoaded: boolean; fontError: Error | null }) {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'initializing' || (!fontsLoaded && !fontError)) {
      return;
    }

    SplashScreen.hideAsync();

    const inAuthGroup = segments[0] === 'auth';
    const isWelcomeScreen = !segments[0];

    if (status === 'unauthenticated') {
      if (!inAuthGroup && !isWelcomeScreen) {
        router.replace('/auth/login');
      }
    } else if (status === 'authenticated') {
      if (inAuthGroup || isWelcomeScreen) {
        router.replace('/home');
      }
    }
  }, [status, segments, fontsLoaded, fontError, router]);

  if (status === 'initializing' || (!fontsLoaded && !fontError)) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: GoPlantColors.background } }} />
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PlantDataProvider>
          <StatusBar style="dark" />
          <NavigationGuard fontsLoaded={fontsLoaded} fontError={fontError} />
        </PlantDataProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
