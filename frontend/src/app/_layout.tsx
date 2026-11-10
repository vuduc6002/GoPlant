import { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
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

import { GoPlantColors, GoPlantTypography } from '@/constants/theme';
import { PlantDataProvider } from '@/features/plants/PlantDataStore';
import { AuthProvider, useAuth } from '@/features/auth';
import { queryClient } from '@/services/query/queryClient';

SplashScreen.preventAutoHideAsync();

function StorageErrorView({
  title,
  message,
  buttonText,
  onRetry,
}: {
  title: string;
  message: string;
  buttonText: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorIcon}>🔒</Text>
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      <Pressable style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryButtonText}>{buttonText}</Text>
      </Pressable>
    </View>
  );
}

function NavigationGuard({ fontsLoaded, fontError }: { fontsLoaded: boolean; fontError: Error | null }) {
  const { status, retryLoadSession, retryClearSession } = useAuth();
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

  if (status === 'storage-error') {
    return (
      <StorageErrorView
        title="Không thể truy cập dữ liệu"
        message="Ứng dụng tạm thời không thể đọc dữ liệu phiên đăng nhập trên thiết bị. Vui lòng bấm thử đọc lại."
        buttonText="Thử đọc lại"
        onRetry={retryLoadSession}
      />
    );
  }

  if (status === 'storage-cleanup-error') {
    return (
      <StorageErrorView
        title="Xóa phiên đăng nhập thất bại"
        message="Không thể xóa phiên đăng nhập khỏi thiết bị. Vui lòng thử xóa lại để đảm bảo an toàn."
        buttonText="Thử xóa lại"
        onRetry={() => {
          retryClearSession().catch(() => {});
        }}
      />
    );
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

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: GoPlantColors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: GoPlantTypography.bold,
    color: GoPlantColors.forest,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    fontFamily: GoPlantTypography.regular,
    color: GoPlantColors.secondaryText,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: GoPlantColors.primary,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: {
    color: GoPlantColors.surface,
    fontSize: 14,
    fontFamily: GoPlantTypography.semiBold,
  },
});
