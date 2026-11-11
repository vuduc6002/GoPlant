import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { AppApiError } from '@/services/api/apiError';
import { getSessionGeneration } from '@/services/api/tokenStorage';
import { useFavoriteSpecies, useFavoriteToggle } from './speciesHooks';
import type { SpeciesSummaryDto } from './speciesTypes';

export interface FavoritesSectionProps {
  pageSize?: number;
}

export function FavoritesSection({ pageSize = 20 }: FavoritesSectionProps) {
  const { user } = useAuth();
  const currentUserId = typeof user?.id === 'string' ? user.id.trim() : '';
  const currentUserIdRef = useRef(currentUserId);
  const prevUserIdRef = useRef(currentUserId);

  const [page, setPage] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const favoritesQuery = useFavoriteSpecies({ page, size: pageSize });
  const { toggleFavorite, isSpeciesPending, isAnyFavoritePending } = useFavoriteToggle();

  const data = favoritesQuery.data;
  const items = data?.content ?? [];
  const totalElements = data?.totalElements ?? 0;
  const totalPages = data?.totalPages ?? 0;

  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = currentUserId;
    currentUserIdRef.current = currentUserId;
    if (prevUserId && prevUserId !== currentUserId) {
      setPage(0);
      setActionError(null);
    }
  }, [currentUserId]);

  // Keep current page within bounds when unfavoriting the final item on a page
  useEffect(() => {
    if (data && page > 0 && totalPages > 0 && page >= totalPages) {
      setPage(totalPages - 1);
    } else if (data && page > 0 && totalPages === 0) {
      setPage(0);
    }
  }, [data, page, totalPages]);

  const handleRemoveFavorite = async (item: SpeciesSummaryDto) => {
    const initiatedGeneration = getSessionGeneration();
    const initiatedByUserId = currentUserIdRef.current;
    setActionError(null);
    try {
      await toggleFavorite(item.id, true);
    } catch (err) {
      if (
        getSessionGeneration() !== initiatedGeneration ||
        (Boolean(initiatedByUserId) && currentUserIdRef.current !== initiatedByUserId)
      ) {
        return;
      }
      if (err instanceof AppApiError) {
        if (err.code === 'FAVORITE_OPERATION_IN_PROGRESS' || err.code === 'SESSION_USER_MISMATCH') {
          return;
        }
        if (err.statusCode === 404) {
          setActionError('Loài cây này không còn trong danh sách yêu thích, đã đồng bộ lại dữ liệu.');
          return;
        }
        setActionError(err.message);
        return;
      }
      setActionError('Không thể bỏ yêu thích loài cây. Vui lòng thử lại.');
    }
  };

  return (
    <View style={fs.section}>
      <View style={fs.headerRow}>
        <Text style={fs.title}>Loài cây yêu thích</Text>
        <Text style={fs.hint}>
          {favoritesQuery.isLoading ? 'Đang tải...' : `${totalElements} loài đã lưu`}
        </Text>
      </View>

      {actionError ? (
        <View style={fs.errorBanner} accessibilityRole="alert">
          <Text style={fs.errorBannerText}>{actionError}</Text>
          <Pressable onPress={() => setActionError(null)} accessibilityRole="button" accessibilityLabel="Đóng thông báo lỗi">
            <Text style={fs.dismissText}>Đóng</Text>
          </Pressable>
        </View>
      ) : null}

      {favoritesQuery.isLoading ? (
        <View style={fs.stateCard}>
          <ActivityIndicator size="small" color={C.primary} />
          <Text style={fs.stateBody}>Đang tải danh sách loài cây yêu thích...</Text>
        </View>
      ) : favoritesQuery.isError ? (
        <View style={fs.stateCard} accessibilityRole="alert">
          <Text style={fs.stateTitle}>Không thể tải danh sách yêu thích</Text>
          <Text style={fs.stateBody}>{favoritesQuery.error.message}</Text>
          <Pressable onPress={() => favoritesQuery.refetch()} style={fs.primaryButton} accessibilityRole="button">
            <Text style={fs.primaryButtonText}>Thử lại</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={fs.stateCard}>
          <View style={fs.emptyIcon}>
            <Text style={fs.emptyGlyph}>♡</Text>
          </View>
          <Text style={fs.stateTitle}>Chưa có cây yêu thích</Text>
          <Text style={fs.stateBody}>Khám phá thư viện loài cây và đánh dấu yêu thích để lưu vào danh sách của bạn.</Text>
          <Pressable onPress={() => router.push('/search' as never)} style={fs.primaryButton} accessibilityRole="button">
            <Text style={fs.primaryButtonText}>Khám phá thư viện cây</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {items.map((plant) => {
            const pending = isSpeciesPending(plant.id);
            return (
              <View key={plant.id} style={fs.rowCard}>
                <Pressable
                  style={fs.rowPressable}
                  onPress={() =>
                    router.push({
                      pathname: '/plant-detail',
                      params: { speciesId: plant.id },
                    } as never)
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Xem chi tiết ${plant.commonName}`}
                >
                  {plant.thumbnailUrl ? (
                    <Image source={{ uri: plant.thumbnailUrl }} style={fs.thumbImage} contentFit="cover" />
                  ) : (
                    <View style={fs.thumbPlaceholder}>
                      <Text style={fs.plantEmoji}>♧</Text>
                    </View>
                  )}
                  <View style={fs.copy}>
                    <Text style={fs.cardTitle}>{plant.commonName}</Text>
                    <Text style={fs.latin}>{plant.scientificName}</Text>
                    <Text style={fs.meta}>
                      {plant.category} • Độ khó: {plant.difficulty || 'Chưa có dữ liệu'}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  disabled={isAnyFavoritePending}
                  onPress={() => {
                    void handleRemoveFavorite(plant);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Bỏ yêu thích ${plant.commonName}`}
                  accessibilityState={{ disabled: isAnyFavoritePending }}
                  style={[fs.favButton, isAnyFavoritePending && fs.favButtonDisabled]}
                >
                  <Text style={fs.heart}>{pending ? '…' : '♥'}</Text>
                </Pressable>
              </View>
            );
          })}

          {totalPages > 1 ? (
            <View style={fs.paginationRow}>
              <Pressable
                disabled={page <= 0 || favoritesQuery.isFetching}
                onPress={() => setPage((prev) => Math.max(0, prev - 1))}
                style={[fs.pageBtn, (page <= 0 || favoritesQuery.isFetching) && fs.pageBtnDisabled]}
                accessibilityRole="button"
              >
                <Text style={fs.pageBtnText}>Trang trước</Text>
              </Pressable>
              <Text style={fs.pageLabel}>
                Trang {page + 1} / {totalPages}
              </Text>
              <Pressable
                disabled={Boolean(data?.last) || favoritesQuery.isFetching}
                onPress={() => setPage((prev) => prev + 1)}
                style={[fs.pageBtn, (Boolean(data?.last) || favoritesQuery.isFetching) && fs.pageBtnDisabled]}
                accessibilityRole="button"
              >
                <Text style={fs.pageBtnText}>Trang sau</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const fs = StyleSheet.create({
  section: { gap: 8, marginTop: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: C.forest, fontFamily: F.semiBold, fontSize: 15, lineHeight: 21 },
  hint: { color: C.mutedText, fontFamily: F.regular, fontSize: 11 },
  errorBanner: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: '#F5C2C0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  errorBannerText: { flex: 1, color: '#991B1B', fontFamily: F.regular, fontSize: 11 },
  dismissText: { color: '#991B1B', fontFamily: F.semiBold, fontSize: 11 },
  stateCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: C.surface,
    alignItems: 'center',
    gap: 8,
  },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#E2F1E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyGlyph: { color: C.forest, fontSize: 28 },
  stateTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 13, textAlign: 'center' },
  stateBody: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, textAlign: 'center', lineHeight: 17 },
  primaryButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 9,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: C.surface, fontFamily: F.semiBold, fontSize: 11 },
  rowCard: {
    padding: 9,
    borderRadius: 13,
    backgroundColor: C.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  rowPressable: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  thumbImage: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#E4F0E7' },
  thumbPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#E4F0E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plantEmoji: { fontSize: 24 },
  copy: { flex: 1, gap: 2 },
  cardTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 13 },
  latin: { color: C.mutedText, fontFamily: F.regular, fontSize: 10, fontStyle: 'italic' },
  meta: { color: C.secondaryText, fontFamily: F.regular, fontSize: 10 },
  favButton: {
    minWidth: 36,
    minHeight: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.softSurface,
  },
  favButtonDisabled: { opacity: 0.5 },
  heart: { color: '#A84B20', fontSize: 18 },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    gap: 8,
  },
  pageBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: C.softSurface,
  },
  pageBtnDisabled: { opacity: 0.45 },
  pageBtnText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  pageLabel: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11 },
});
