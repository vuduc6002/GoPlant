import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { useGardensList } from '@/features/gardens/gardenHooks';
import { getHealthStatusMeta, type HealthStatus } from '@/features/gardens/gardenTypes';
import { useUserPlantsList } from '@/features/plants/plantHooks';
import {
  HEALTH_STATUS_OPTIONS,
  PLANT_SORT_OPTIONS,
  type UserPlantSummaryDto,
} from '@/features/plants/plantTypes';
import { useFavoriteToggle, useSpeciesList } from '@/features/species/speciesHooks';
import {
  SPECIES_CATEGORY_OPTIONS,
  SPECIES_SORT_OPTIONS,
  type SpeciesSummaryDto,
} from '@/features/species/speciesTypes';
import { AppApiError } from '@/services/api/apiError';
import { getSessionGeneration } from '@/services/api/tokenStorage';

function normalizeRouteHealthStatus(raw?: string): HealthStatus | '' {
  return raw === 'HEALTHY' ||
    raw === 'NEEDS_ATTENTION' ||
    raw === 'CRITICAL' ||
    raw === 'UNKNOWN'
    ? raw
    : '';
}

const DEFAULT_PAGE_SIZE = 20;
const QUICK_SUGGESTIONS = ['Trầu bà', 'Monstera', 'Philodendron', 'Cẩm thạch'];

function SearchHeader({
  query,
  onQueryChange,
  onClear,
  onSubmit,
  onFilter,
}: {
  query: string;
  onQueryChange: (text: string) => void;
  onClear: () => void;
  onSubmit: () => void;
  onFilter: () => void;
}) {
  return (
    <View style={ss.header}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Quay lại"
        style={ss.back}
      >
        <Text style={ss.backText}>‹</Text>
      </Pressable>
      <View style={ss.searchBox}>
        <Text style={ss.searchIcon}>⌕</Text>
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          onSubmitEditing={onSubmit}
          placeholder="Tìm tên loài cây, tên khoa học..."
          placeholderTextColor={C.mutedText}
          style={ss.searchInput}
          returnKeyType="search"
          accessibilityLabel="Ô tìm kiếm loài cây"
        />
        {query ? (
          <Pressable
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel="Xóa từ khóa tìm kiếm"
          >
            <Text style={ss.clear}>×</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        onPress={onFilter}
        accessibilityRole="button"
        accessibilityLabel="Mở bộ lọc"
        style={ss.filterButton}
      >
        <Text style={ss.filterGlyph}>☷</Text>
      </Pressable>
    </View>
  );
}

function SpeciesResultCard({
  item,
  isPending,
  isAnyFavoritePending,
  onToggleFavorite,
  onOpenDetail,
  onAddPlant,
}: {
  item: SpeciesSummaryDto;
  isPending: boolean;
  isAnyFavoritePending: boolean;
  onToggleFavorite: () => void;
  onOpenDetail: () => void;
  onAddPlant: () => void;
}) {
  return (
    <View style={ss.resultCard}>
      <View style={ss.resultTop}>
        {item.thumbnailUrl ? (
          <Image source={{ uri: item.thumbnailUrl }} style={ss.resultThumbImage} contentFit="cover" />
        ) : (
          <View style={ss.resultImage}>
            <Text style={ss.plantEmoji}>♧</Text>
          </View>
        )}
        <View style={ss.resultCopy}>
          <Text style={ss.resultName}>{item.commonName}</Text>
          <Text style={ss.latin}>{item.scientificName}</Text>
          <Text style={ss.body}>
            {item.category} • Độ khó: {item.difficulty || 'Chưa có dữ liệu'}
          </Text>
        </View>
        <Pressable
          disabled={isAnyFavoritePending}
          onPress={onToggleFavorite}
          accessibilityRole="button"
          accessibilityLabel={
            item.isFavorited ? `Bỏ yêu thích ${item.commonName}` : `Yêu thích ${item.commonName}`
          }
          accessibilityState={{ disabled: isAnyFavoritePending }}
          style={[ss.favButton, isAnyFavoritePending && ss.favButtonDisabled]}
        >
          <Text style={ss.favorite}>{isPending ? '…' : item.isFavorited ? '♥' : '♡'}</Text>
        </Pressable>
      </View>
      <View style={ss.actions}>
        <Pressable
          onPress={onOpenDetail}
          style={[ss.action, ss.actionLight]}
          accessibilityRole="button"
          accessibilityLabel={`Xem chi tiết ${item.commonName}`}
        >
          <Text style={ss.actionLightText}>Xem chi tiết</Text>
        </Pressable>
        <Pressable
          onPress={onAddPlant}
          style={ss.action}
          accessibilityRole="button"
          accessibilityLabel={`Thêm ${item.commonName} vào cây của tôi`}
        >
          <Text style={ss.actionText}>＋ Thêm vào cây của tôi</Text>
        </Pressable>
      </View>
    </View>
  );
}

function OwnedPlantResultCard({ item }: { item: UserPlantSummaryDto }) {
  const health = getHealthStatusMeta(item.healthStatus);
  return (
    <View style={ss.resultCard}>
      <View style={ss.resultTop}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={ss.resultThumbImage} contentFit="cover" />
        ) : (
          <View style={ss.resultImage}>
            <Text style={ss.plantEmoji}>♧</Text>
          </View>
        )}
        <View style={ss.resultCopy}>
          <Text style={ss.resultName}>{item.displayName}</Text>
          {item.scientificName ? <Text style={ss.latin}>{item.scientificName}</Text> : null}
          <Text style={ss.body}>
            {item.speciesName || 'Chưa gắn loài'}
            {item.category ? ` • ${item.category}` : ''}
          </Text>
          <Text style={ss.body}>
            {item.gardenName ? `⌂ ${item.gardenName}` : 'Chưa gắn khu vườn'} • {health.label}
          </Text>
        </View>
      </View>
      <View style={ss.actions}>
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/plant-detail',
              params: { plantId: item.id },
            } as never)
          }
          style={[ss.action, ss.actionLight]}
          accessibilityRole="button"
          accessibilityLabel={`Xem chi tiết ${item.displayName}`}
        >
          <Text style={ss.actionLightText}>Xem chi tiết</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/garden/add-plant',
              params: { editPlantId: item.id },
            } as never)
          }
          style={ss.action}
          accessibilityRole="button"
          accessibilityLabel={`Chỉnh sửa ${item.displayName}`}
        >
          <Text style={ss.actionText}>Chỉnh sửa</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function SearchScreen() {
  const params = useLocalSearchParams<{
    query?: string;
    category?: string;
    sort?: string;
    scope?: string;
    filters?: string;
    gardenId?: string;
    healthStatus?: string;
    plantSort?: string;
  }>();

  const initialScope =
    params.scope === 'owned' || params.scope === 'Trong vườn của tôi' ? 'owned' : 'catalog';

  const { user } = useAuth();
  const currentUserId = typeof user?.id === 'string' ? user.id.trim() : '';
  const currentUserIdRef = useRef(currentUserId);
  const prevUserIdRef = useRef(currentUserId);

  const [scope, setScope] = useState<'catalog' | 'owned'>(initialScope);
  const [query, setQuery] = useState(typeof params.query === 'string' ? params.query : '');
  const [debouncedKeyword, setDebouncedKeyword] = useState(
    typeof params.query === 'string' ? params.query.trim() : ''
  );
  const [category, setCategory] = useState(
    typeof params.category === 'string' && params.category.trim() ? params.category.trim() : 'Tất cả'
  );
  const [sort, setSort] = useState(
    typeof params.sort === 'string' && params.sort.trim() ? params.sort.trim() : 'commonName,asc'
  );
  const [page, setPage] = useState(0);
  const [ownedGardenId, setOwnedGardenId] = useState(
    typeof params.gardenId === 'string' ? params.gardenId.trim() : ''
  );
  const [ownedHealthStatus, setOwnedHealthStatus] = useState<HealthStatus | ''>(() =>
    normalizeRouteHealthStatus(params.healthStatus)
  );
  const [ownedSort, setOwnedSort] = useState(
    typeof params.plantSort === 'string' && params.plantSort.trim()
      ? params.plantSort.trim()
      : 'createdAt,desc'
  );
  const [ownedPage, setOwnedPage] = useState(0);
  const [favError, setFavError] = useState<string | null>(null);

  const lastParamsSignatureRef = useRef<string>(
    JSON.stringify([
      params.query ?? '',
      params.category ?? '',
      params.sort ?? '',
      params.scope ?? '',
      params.gardenId ?? '',
      params.healthStatus ?? '',
      params.plantSort ?? '',
    ])
  );

  // Sync local state only when route parameters change (e.g. returning from FilterScreen)
  useEffect(() => {
    const signature = JSON.stringify([
      params.query ?? '',
      params.category ?? '',
      params.sort ?? '',
      params.scope ?? '',
      params.gardenId ?? '',
      params.healthStatus ?? '',
      params.plantSort ?? '',
    ]);
    if (signature === lastParamsSignatureRef.current) {
      return;
    }
    lastParamsSignatureRef.current = signature;

    const nextScope =
      params.scope === 'owned' || params.scope === 'Trong vườn của tôi' ? 'owned' : 'catalog';
    const nextQuery = typeof params.query === 'string' ? params.query : '';
    const nextCategory =
      typeof params.category === 'string' && params.category.trim()
        ? params.category.trim()
        : 'Tất cả';
    const nextSort =
      typeof params.sort === 'string' && params.sort.trim()
        ? params.sort.trim()
        : 'commonName,asc';
    const nextGardenId = typeof params.gardenId === 'string' ? params.gardenId.trim() : '';
    const nextHealthStatus = normalizeRouteHealthStatus(params.healthStatus);
    const nextOwnedSort =
      typeof params.plantSort === 'string' && params.plantSort.trim()
        ? params.plantSort.trim()
        : 'createdAt,desc';

    setScope(nextScope);
    setQuery(nextQuery);
    setDebouncedKeyword(nextQuery.trim());
    setCategory(nextCategory);
    setSort(nextSort);
    setPage(0);
    setOwnedGardenId(nextGardenId);
    setOwnedHealthStatus(nextHealthStatus);
    setOwnedSort(nextOwnedSort);
    setOwnedPage(0);
  }, [
    params.query,
    params.category,
    params.sort,
    params.scope,
    params.gardenId,
    params.healthStatus,
    params.plantSort,
  ]);

  // Debounce free-text typing for search
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === debouncedKeyword) {
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedKeyword(trimmed);
      setPage(0);
      setOwnedPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, debouncedKeyword]);

  const speciesQuery = useSpeciesList(
    {
      keyword: debouncedKeyword || undefined,
      category: category !== 'Tất cả' ? category : undefined,
      page,
      size: DEFAULT_PAGE_SIZE,
      sort,
    },
    { enabled: scope === 'catalog' }
  );

  const ownedPlantsQuery = useUserPlantsList(
    {
      keyword: debouncedKeyword || undefined,
      gardenId: ownedGardenId || undefined,
      healthStatus: ownedHealthStatus || undefined,
      page: ownedPage,
      size: DEFAULT_PAGE_SIZE,
      sort: ownedSort,
    },
    { enabled: scope === 'owned' }
  );

  const ownedQueryData = ownedPlantsQuery.data;
  const isOwnedFetching = ownedPlantsQuery.isFetching;
  const isOwnedPlaceholder = ownedPlantsQuery.isPlaceholderData;
  const isOwnedError = ownedPlantsQuery.isError;

  useEffect(() => {
    if (scope !== 'owned') {
      return;
    }
    if (isOwnedFetching || isOwnedPlaceholder || isOwnedError || !ownedQueryData) {
      return;
    }
    const rawTotalPages = ownedQueryData.totalPages;
    if (typeof rawTotalPages !== 'number' || !Number.isFinite(rawTotalPages)) {
      return;
    }
    const totalPages = Math.max(0, Math.trunc(rawTotalPages));
    if (ownedPage < 0 || ownedPage >= totalPages) {
      const nextPage = ownedPage < 0 || totalPages === 0 ? 0 : totalPages - 1;
      if (nextPage !== ownedPage) {
        setOwnedPage(nextPage);
      }
    }
  }, [scope, ownedPage, ownedQueryData, isOwnedFetching, isOwnedPlaceholder, isOwnedError]);

  const gardensQuery = useGardensList({ enabled: scope === 'owned' });

  const { toggleFavorite, isSpeciesPending, isAnyFavoritePending } = useFavoriteToggle();

  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = currentUserId;
    currentUserIdRef.current = currentUserId;
    if (prevUserId && prevUserId !== currentUserId) {
      setPage(0);
      setOwnedPage(0);
      setOwnedGardenId('');
      setOwnedHealthStatus('');
      setOwnedSort('createdAt,desc');
      setFavError(null);
    }
  }, [currentUserId]);

  const applyImmediateKeyword = (nextKeyword: string) => {
    setQuery(nextKeyword);
    setDebouncedKeyword(nextKeyword.trim());
    setPage(0);
    setOwnedPage(0);
  };

  const handleSelectCategory = (nextCategory: string) => {
    setCategory(nextCategory);
    setPage(0);
  };

  const handleSelectSort = (nextSort: string) => {
    setSort(nextSort);
    setPage(0);
  };

  const handleResetFilters = () => {
    setQuery('');
    setDebouncedKeyword('');
    setCategory('Tất cả');
    setSort('commonName,asc');
    setPage(0);
  };

  const handleResetOwnedFilters = () => {
    setQuery('');
    setDebouncedKeyword('');
    setOwnedGardenId('');
    setOwnedHealthStatus('');
    setOwnedSort('createdAt,desc');
    setOwnedPage(0);
  };

  const handleFavoriteToggle = async (item: SpeciesSummaryDto) => {
    const initiatedGeneration = getSessionGeneration();
    const initiatedByUserId = currentUserIdRef.current;
    setFavError(null);
    try {
      await toggleFavorite(item.id, item.isFavorited);
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
        if (err.statusCode === 409) {
          setFavError('Loài cây đã có trong danh sách yêu thích, đã đồng bộ trạng thái mới nhất.');
          return;
        }
        if (err.statusCode === 404) {
          setFavError('Bản ghi yêu thích không còn tồn tại, đã đồng bộ trạng thái mới nhất.');
          return;
        }
        setFavError(err.message);
        return;
      }
      setFavError('Không thể cập nhật yêu thích. Vui lòng thử lại.');
    }
  };

  const openFilter = () =>
    router.push({
      pathname: '/filter',
      params:
        scope === 'owned'
          ? {
              query,
              scope,
              gardenId: ownedGardenId,
              healthStatus: ownedHealthStatus,
              plantSort: ownedSort,
              filters: '{}',
            }
          : {
              query,
              category,
              sort,
              scope,
              filters: '{}',
            },
    } as never);

  const speciesPage = speciesQuery.data;
  const speciesList = speciesPage?.content ?? [];
  const totalPages = speciesPage?.totalPages ?? 0;

  const ownedPageData = ownedQueryData;
  const ownedList = ownedPageData?.content ?? [];
  const ownedTotalElements = ownedPageData?.totalElements ?? 0;
  const ownedTotalPages = ownedPageData?.totalPages ?? 0;
  const displayOwnedTotalPages = Math.max(1, ownedTotalPages, ownedPage + 1);
  const hasOwnedFilters = Boolean(debouncedKeyword || ownedGardenId || ownedHealthStatus);
  const gardens = gardensQuery.data ?? [];

  return (
    <SafeAreaView style={ss.safe} edges={['top']}>
      <SearchHeader
        query={query}
        onQueryChange={setQuery}
        onClear={() => applyImmediateKeyword('')}
        onSubmit={() => {
          setDebouncedKeyword(query.trim());
          setPage(0);
          setOwnedPage(0);
        }}
        onFilter={openFilter}
      />

      <ScrollView contentContainerStyle={ss.content} keyboardShouldPersistTaps="handled">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ss.pills}>
          <Pressable
            onPress={() => setScope('catalog')}
            style={[ss.scope, scope === 'catalog' && ss.scopeActive]}
            accessibilityRole="button"
          >
            <Text style={[ss.scopeText, scope === 'catalog' && ss.scopeTextActive]}>
              Thư viện loài cây {speciesPage ? `(${speciesPage.totalElements})` : ''}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setScope('owned')}
            style={[ss.scope, scope === 'owned' && ss.scopeActive]}
            accessibilityRole="button"
          >
            <Text style={[ss.scopeText, scope === 'owned' && ss.scopeTextActive]}>
              Cây của tôi {ownedPageData ? `(${ownedPageData.totalElements})` : ''}
            </Text>
          </Pressable>
        </ScrollView>

        {scope === 'catalog' ? (
          <>
            <Text style={ss.kicker}>GỢI Ý TÌM KIẾM NHANH</Text>
            <View style={ss.suggestions}>
              {QUICK_SUGGESTIONS.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => applyImmediateKeyword(item)}
                  style={ss.suggestion}
                  accessibilityRole="button"
                >
                  <Text style={ss.body}>⌕  {item}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={ss.kicker}>NHÓM LOÀI CÂY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ss.pills}>
              {SPECIES_CATEGORY_OPTIONS.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => handleSelectCategory(item)}
                  style={[ss.chip, category === item && ss.chipActive]}
                  accessibilityRole="button"
                >
                  <Text style={[ss.chipText, category === item && ss.chipTextActive]}>{item}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={ss.kicker}>SẮP XẾP</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ss.pills}>
              {SPECIES_SORT_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => handleSelectSort(opt.value)}
                  style={[ss.chip, sort === opt.value && ss.chipActive]}
                  accessibilityRole="button"
                >
                  <Text style={[ss.chipText, sort === opt.value && ss.chipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {favError ? (
              <View style={ss.errorBanner} accessibilityRole="alert">
                <Text style={ss.errorBannerText}>{favError}</Text>
                <Pressable onPress={() => setFavError(null)}>
                  <Text style={ss.dismissText}>Đóng</Text>
                </Pressable>
              </View>
            ) : null}

            {speciesQuery.isLoading ? (
              <View style={ss.stateCard}>
                <ActivityIndicator size="large" color={C.primary} />
                <Text style={ss.bodyCenter}>Đang tải danh sách loài cây từ máy chủ...</Text>
              </View>
            ) : speciesQuery.isError ? (
              <View style={ss.emptyCard} accessibilityRole="alert">
                <Text style={ss.emptyTitle}>Không thể tải thư viện loài cây</Text>
                <Text style={ss.bodyCenter}>{speciesQuery.error.message}</Text>
                <Pressable
                  onPress={() => speciesQuery.refetch()}
                  style={ss.action}
                  accessibilityRole="button"
                >
                  <Text style={ss.actionText}>Thử lại</Text>
                </Pressable>
              </View>
            ) : speciesList.length === 0 ? (
              <View style={ss.emptyCard}>
                <View style={ss.emptyIcon}>
                  <Text style={ss.emptyPlant}>♧</Text>
                </View>
                <Text style={ss.emptyTitle}>Không tìm thấy loài cây phù hợp</Text>
                {debouncedKeyword ? <Text style={ss.queryText}>“{debouncedKeyword}”</Text> : null}
                <Text style={ss.bodyCenter}>
                  Thử xóa bộ lọc, đổi nhóm cây hoặc nhập từ khóa tên thường gọi / tên khoa học khác.
                </Text>
                <View style={ss.emptyActions}>
                  <Pressable onPress={handleResetFilters} style={[ss.action, ss.actionLight]} accessibilityRole="button">
                    <Text style={ss.actionLightText}>Xóa bộ lọc</Text>
                  </Pressable>
                  <Pressable onPress={openFilter} style={ss.action} accessibilityRole="button">
                    <Text style={ss.actionText}>Mở bộ lọc</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <View style={ss.sectionRow}>
                  <Text style={ss.sectionTitle}>Thư viện thực vật</Text>
                  <Text style={ss.body}>
                    {speciesPage?.totalElements ?? speciesList.length} kết quả
                    {speciesQuery.isFetching ? ' • Đang cập nhật...' : ''}
                  </Text>
                </View>

                {speciesList.map((item) => (
                  <SpeciesResultCard
                    key={item.id}
                    item={item}
                    isPending={isSpeciesPending(item.id)}
                    isAnyFavoritePending={isAnyFavoritePending}
                    onToggleFavorite={() => {
                      void handleFavoriteToggle(item);
                    }}
                    onOpenDetail={() =>
                      router.push({
                        pathname: '/plant-detail',
                        params: { speciesId: item.id },
                      } as never)
                    }
                    onAddPlant={() =>
                      router.push({
                        pathname: '/garden/add-plant',
                        params: { speciesId: item.id },
                      } as never)
                    }
                  />
                ))}

                {totalPages > 1 || page > 0 ? (
                  <View style={ss.paginationRow}>
                    <Pressable
                      disabled={page <= 0 || speciesQuery.isFetching}
                      onPress={() => setPage((prev) => Math.max(0, prev - 1))}
                      style={[
                        ss.pageButton,
                        (page <= 0 || speciesQuery.isFetching) && ss.pageButtonDisabled,
                      ]}
                      accessibilityRole="button"
                    >
                      <Text style={ss.pageButtonText}>Trang trước</Text>
                    </Pressable>
                    <Text style={ss.body}>
                      Trang {page + 1} / {Math.max(1, totalPages)}
                    </Text>
                    <Pressable
                      disabled={Boolean(speciesPage?.last) || speciesQuery.isFetching}
                      onPress={() => setPage((prev) => prev + 1)}
                      style={[
                        ss.pageButton,
                        (Boolean(speciesPage?.last) || speciesQuery.isFetching) &&
                          ss.pageButtonDisabled,
                      ]}
                      accessibilityRole="button"
                    >
                      <Text style={ss.pageButtonText}>Trang sau</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            )}
          </>
        ) : (
          <>
            <Text style={ss.kicker}>KHU VƯỜN</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ss.pills}>
              <Pressable
                onPress={() => {
                  setOwnedGardenId('');
                  setOwnedPage(0);
                }}
                style={[ss.chip, !ownedGardenId && ss.chipActive]}
                accessibilityRole="button"
              >
                <Text style={[ss.chipText, !ownedGardenId && ss.chipTextActive]}>Tất cả vườn</Text>
              </Pressable>
              {gardens.map((garden) => {
                const active = ownedGardenId === garden.id;
                return (
                  <Pressable
                    key={garden.id}
                    onPress={() => {
                      setOwnedGardenId(garden.id);
                      setOwnedPage(0);
                    }}
                    style={[ss.chip, active && ss.chipActive]}
                    accessibilityRole="button"
                  >
                    <Text style={[ss.chipText, active && ss.chipTextActive]}>{garden.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={ss.kicker}>TÌNH TRẠNG SỨC KHỎE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ss.pills}>
              <Pressable
                onPress={() => {
                  setOwnedHealthStatus('');
                  setOwnedPage(0);
                }}
                style={[ss.chip, !ownedHealthStatus && ss.chipActive]}
                accessibilityRole="button"
              >
                <Text style={[ss.chipText, !ownedHealthStatus && ss.chipTextActive]}>
                  Tất cả trạng thái
                </Text>
              </Pressable>
              {HEALTH_STATUS_OPTIONS.map((opt) => {
                const active = ownedHealthStatus === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      setOwnedHealthStatus(opt.value);
                      setOwnedPage(0);
                    }}
                    style={[ss.chip, active && ss.chipActive]}
                    accessibilityRole="button"
                  >
                    <Text style={[ss.chipText, active && ss.chipTextActive]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={ss.kicker}>SẮP XẾP</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ss.pills}>
              {PLANT_SORT_OPTIONS.map((opt) => {
                const active = ownedSort === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      setOwnedSort(opt.value);
                      setOwnedPage(0);
                    }}
                    style={[ss.chip, active && ss.chipActive]}
                    accessibilityRole="button"
                  >
                    <Text style={[ss.chipText, active && ss.chipTextActive]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {ownedPlantsQuery.isLoading ? (
              <View style={ss.stateCard}>
                <ActivityIndicator size="large" color={C.primary} />
                <Text style={ss.bodyCenter}>Đang tải danh sách cây của bạn từ máy chủ...</Text>
              </View>
            ) : ownedPlantsQuery.isError ? (
              <View style={ss.emptyCard} accessibilityRole="alert">
                <Text style={ss.emptyTitle}>Không thể tải cây của bạn</Text>
                <Text style={ss.bodyCenter}>{ownedPlantsQuery.error.message}</Text>
                <Pressable
                  onPress={() => {
                    void ownedPlantsQuery.refetch();
                  }}
                  style={ss.action}
                  accessibilityRole="button"
                >
                  <Text style={ss.actionText}>Thử lại</Text>
                </Pressable>
              </View>
            ) : !ownedPageData ? (
              <View style={ss.stateCard}>
                <ActivityIndicator size="large" color={C.primary} />
                <Text style={ss.bodyCenter}>Đang tải danh sách cây của bạn từ máy chủ...</Text>
              </View>
            ) : ownedList.length === 0 ? (
              ownedTotalElements > 0 || isOwnedFetching || isOwnedPlaceholder ? (
                <View style={ss.stateCard}>
                  <ActivityIndicator size="large" color={C.primary} />
                  <Text style={ss.bodyCenter}>Đang cập nhật danh sách cây trồng...</Text>
                </View>
              ) : (
                <View style={ss.emptyCard}>
                  <View style={ss.emptyIcon}>
                    <Text style={ss.emptyPlant}>♧</Text>
                  </View>
                  <Text style={ss.emptyTitle}>
                    {hasOwnedFilters ? 'Không tìm thấy cây của bạn phù hợp' : 'Bạn chưa có cây trồng nào'}
                  </Text>
                  {debouncedKeyword ? <Text style={ss.queryText}>“{debouncedKeyword}”</Text> : null}
                  <Text style={ss.bodyCenter}>
                    {hasOwnedFilters
                      ? 'Thử xóa bộ lọc khu vườn / tình trạng hoặc nhập từ khóa khác.'
                      : 'Chọn khu vườn và loài cây từ thư viện để thêm cây đầu tiên của bạn.'}
                  </Text>
                  <View style={ss.emptyActions}>
                    {hasOwnedFilters ? (
                      <Pressable
                        onPress={handleResetOwnedFilters}
                        style={[ss.action, ss.actionLight]}
                        accessibilityRole="button"
                      >
                        <Text style={ss.actionLightText}>Xóa bộ lọc</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => router.push('/garden/add-plant' as never)}
                      style={ss.action}
                      accessibilityRole="button"
                    >
                      <Text style={ss.actionText}>＋ Thêm cây mới</Text>
                    </Pressable>
                  </View>
                </View>
              )
            ) : (
              <>
                <View style={ss.sectionRow}>
                  <Text style={ss.sectionTitle}>Cây đang sở hữu</Text>
                  <Text style={ss.body}>
                    {ownedPageData?.totalElements ?? ownedList.length} kết quả
                    {ownedPlantsQuery.isFetching ? ' • Đang cập nhật...' : ''}
                  </Text>
                </View>
                {ownedList.map((item) => (
                  <OwnedPlantResultCard key={item.id} item={item} />
                ))}
                {ownedTotalPages > 1 || ownedPage > 0 ? (
                  <View style={ss.paginationRow}>
                    <Pressable
                      disabled={ownedPage <= 0 || ownedPlantsQuery.isFetching}
                      onPress={() => setOwnedPage((prev) => Math.max(0, prev - 1))}
                      style={[
                        ss.pageButton,
                        (ownedPage <= 0 || ownedPlantsQuery.isFetching) && ss.pageButtonDisabled,
                      ]}
                      accessibilityRole="button"
                    >
                      <Text style={ss.pageButtonText}>Trang trước</Text>
                    </Pressable>
                    <Text style={ss.body}>
                      Trang {ownedPage + 1} / {displayOwnedTotalPages}
                    </Text>
                    <Pressable
                      disabled={Boolean(ownedPageData?.last) || ownedPlantsQuery.isFetching}
                      onPress={() => setOwnedPage((prev) => prev + 1)}
                      style={[
                        ss.pageButton,
                        (Boolean(ownedPageData?.last) || ownedPlantsQuery.isFetching) &&
                          ss.pageButtonDisabled,
                      ]}
                      accessibilityRole="button"
                    >
                      <Text style={ss.pageButtonText}>Trang sau</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export function FilterScreen() {
  const params = useLocalSearchParams<{
    query?: string;
    category?: string;
    sort?: string;
    scope?: string;
    filters?: string;
    gardenId?: string;
    healthStatus?: string;
    plantSort?: string;
  }>();

  const [scope, setScope] = useState<'catalog' | 'owned'>(
    params.scope === 'owned' || params.scope === 'Trong vườn của tôi' ? 'owned' : 'catalog'
  );
  const [query, setQuery] = useState(typeof params.query === 'string' ? params.query : '');
  const [category, setCategory] = useState(
    typeof params.category === 'string' && params.category.trim() ? params.category.trim() : 'Tất cả'
  );
  const [sort, setSort] = useState(
    typeof params.sort === 'string' && params.sort.trim() ? params.sort.trim() : 'commonName,asc'
  );
  const [gardenId, setGardenId] = useState(
    typeof params.gardenId === 'string' ? params.gardenId.trim() : ''
  );
  const [healthStatus, setHealthStatus] = useState<HealthStatus | ''>(() =>
    normalizeRouteHealthStatus(params.healthStatus)
  );
  const [plantSort, setPlantSort] = useState(
    typeof params.plantSort === 'string' && params.plantSort.trim()
      ? params.plantSort.trim()
      : 'createdAt,desc'
  );

  const catalogPreviewQuery = useSpeciesList(
    {
      keyword: query.trim() || undefined,
      category: category !== 'Tất cả' ? category : undefined,
      page: 0,
      size: 1,
      sort,
    },
    { enabled: scope === 'catalog' }
  );

  const ownedPreviewQuery = useUserPlantsList(
    {
      keyword: query.trim() || undefined,
      gardenId: gardenId || undefined,
      healthStatus: healthStatus || undefined,
      page: 0,
      size: 1,
      sort: plantSort,
    },
    { enabled: scope === 'owned' }
  );

  const gardensQuery = useGardensList({ enabled: scope === 'owned' });
  const gardens = gardensQuery.data ?? [];

  const reset = () => {
    setQuery('');
    setCategory('Tất cả');
    setSort('commonName,asc');
    setGardenId('');
    setHealthStatus('');
    setPlantSort('createdAt,desc');
  };

  const apply = () =>
    router.replace({
      pathname: '/search',
      params:
        scope === 'owned'
          ? {
              query,
              scope: 'owned',
              gardenId,
              healthStatus,
              plantSort,
              filters: '{}',
            }
          : {
              query,
              category,
              sort,
              scope,
              filters: '{}',
            },
    } as never);

  const previewCount =
    scope === 'catalog'
      ? catalogPreviewQuery.data?.totalElements
      : ownedPreviewQuery.data?.totalElements;

  return (
    <SafeAreaView style={ss.safe} edges={['top']}>
      <View style={ss.filterHeader}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Quay lại">
          <Text style={ss.backText}>‹</Text>
        </Pressable>
        <Text style={ss.filterTitle}>Bộ lọc cây trồng</Text>
        <Pressable onPress={reset} accessibilityRole="button">
          <Text style={ss.link}>Đặt lại</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={ss.filterContent}>
        <View style={ss.toggleRow}>
          {[
            { key: 'catalog', label: 'Thư viện loài cây (API)' },
            { key: 'owned', label: 'Cây của tôi (API)' },
          ].map((item) => (
            <Pressable
              key={item.key}
              onPress={() => setScope(item.key as 'catalog' | 'owned')}
              style={[ss.toggleOption, scope === item.key && ss.toggleActive]}
              accessibilityRole="button"
            >
              <Text style={[ss.toggleText, scope === item.key && ss.toggleTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={ss.searchBox}>
          <Text style={ss.searchIcon}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={scope === 'catalog' ? 'Tên loài hoặc tên khoa học' : 'Tên cây hoặc tên loài'}
            placeholderTextColor={C.mutedText}
            style={ss.searchInput}
          />
        </View>

        {scope === 'catalog' ? (
          <>
            <View style={ss.filterGroup}>
              <Text style={ss.sectionTitle}>Nhóm loài cây (hỗ trợ API)</Text>
              <View style={ss.optionGrid}>
                {SPECIES_CATEGORY_OPTIONS.map((item) => {
                  const active = category === item;
                  return (
                    <Pressable
                      key={item}
                      onPress={() => setCategory(item)}
                      style={[ss.option, active && ss.optionActive]}
                      accessibilityRole="button"
                    >
                      <Text style={[ss.optionText, active && ss.optionTextActive]}>{item}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={ss.filterGroup}>
              <Text style={ss.sectionTitle}>Sắp xếp kết quả</Text>
              <View style={ss.optionGrid}>
                {SPECIES_SORT_OPTIONS.map((opt) => {
                  const active = sort === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setSort(opt.value)}
                      style={[ss.option, active && ss.optionActive]}
                      accessibilityRole="button"
                    >
                      <Text style={[ss.optionText, active && ss.optionTextActive]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={ss.filterResult}>
              <Text style={ss.resultName}>
                {catalogPreviewQuery.isLoading
                  ? 'Đang kiểm tra số lượng trên máy chủ...'
                  : catalogPreviewQuery.isError
                    ? 'Không thể xem trước số lượng'
                    : `${catalogPreviewQuery.data?.totalElements ?? 0} loài cây phù hợp`}
              </Text>
              <Text style={ss.body}>
                Nhóm: {category} • Sắp xếp:{' '}
                {SPECIES_SORT_OPTIONS.find((item) => item.value === sort)?.label ?? sort}
              </Text>
              <Text style={ss.mockNote}>
                Các bộ lọc sinh thái nâng cao (ánh sáng, độ ẩm, độ pH đất, mức nước...) chưa được API GET /api/v1/species hỗ trợ nên không hiển thị ở chế độ thư viện.
              </Text>
            </View>
          </>
        ) : (
          <>
            <View style={ss.filterGroup}>
              <Text style={ss.sectionTitle}>Khu vườn (hỗ trợ API)</Text>
              <View style={ss.optionGrid}>
                <Pressable
                  onPress={() => setGardenId('')}
                  style={[ss.option, !gardenId && ss.optionActive]}
                  accessibilityRole="button"
                >
                  <Text style={[ss.optionText, !gardenId && ss.optionTextActive]}>Tất cả vườn</Text>
                </Pressable>
                {gardens.map((garden) => {
                  const active = gardenId === garden.id;
                  return (
                    <Pressable
                      key={garden.id}
                      onPress={() => setGardenId(garden.id)}
                      style={[ss.option, active && ss.optionActive]}
                      accessibilityRole="button"
                    >
                      <Text style={[ss.optionText, active && ss.optionTextActive]}>
                        {garden.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={ss.filterGroup}>
              <Text style={ss.sectionTitle}>Tình trạng sức khỏe</Text>
              <View style={ss.optionGrid}>
                <Pressable
                  onPress={() => setHealthStatus('')}
                  style={[ss.option, !healthStatus && ss.optionActive]}
                  accessibilityRole="button"
                >
                  <Text style={[ss.optionText, !healthStatus && ss.optionTextActive]}>
                    Tất cả trạng thái
                  </Text>
                </Pressable>
                {HEALTH_STATUS_OPTIONS.map((opt) => {
                  const active = healthStatus === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setHealthStatus(opt.value)}
                      style={[ss.option, active && ss.optionActive]}
                      accessibilityRole="button"
                    >
                      <Text style={[ss.optionText, active && ss.optionTextActive]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={ss.filterGroup}>
              <Text style={ss.sectionTitle}>Sắp xếp kết quả</Text>
              <View style={ss.optionGrid}>
                {PLANT_SORT_OPTIONS.map((opt) => {
                  const active = plantSort === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setPlantSort(opt.value)}
                      style={[ss.option, active && ss.optionActive]}
                      accessibilityRole="button"
                    >
                      <Text style={[ss.optionText, active && ss.optionTextActive]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={ss.filterResult}>
              <Text style={ss.resultName}>
                {ownedPreviewQuery.isLoading
                  ? 'Đang kiểm tra số lượng trên máy chủ...'
                  : ownedPreviewQuery.isError
                    ? 'Không thể xem trước số lượng'
                    : `${ownedPreviewQuery.data?.totalElements ?? 0} cây phù hợp`}
              </Text>
              <Text style={ss.body}>
                Tất cả bộ lọc cây của tôi được truy vấn trực tiếp qua GET /api/v1/plants.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <View style={ss.filterFooter}>
        <Pressable onPress={reset} style={[ss.action, ss.actionLight]} accessibilityRole="button">
          <Text style={ss.actionLightText}>Đặt lại</Text>
        </Pressable>
        <Pressable onPress={apply} style={ss.action} accessibilityRole="button">
          <Text style={ss.actionText}>
            {typeof previewCount === 'number' ? `Áp dụng lọc • ${previewCount} cây` : 'Áp dụng lọc'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const ss = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: {
    minHeight: 56,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DDE8E0',
  },
  back: { width: 28 },
  backText: { color: C.forest, fontSize: 30 },
  searchBox: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: '#CBDACF',
    borderRadius: 99,
    backgroundColor: C.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  searchIcon: { color: C.secondaryText, fontSize: 21 },
  searchInput: { flex: 1, color: C.text, fontFamily: F.regular, fontSize: 12 },
  clear: { color: C.secondaryText, fontSize: 20, paddingHorizontal: 4 },
  filterButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: C.softSurface,
  },
  filterGlyph: { color: C.forest, fontSize: 20 },
  content: { padding: 12, gap: 10, paddingBottom: 24 },
  kicker: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 10, lineHeight: 15 },
  pills: { flexDirection: 'row', gap: 6 },
  scope: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 99, backgroundColor: '#E6EEE8' },
  scopeActive: { backgroundColor: C.forest },
  scopeText: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 10 },
  scopeTextActive: { color: C.surface },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: '#DDE8E0',
  },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 10 },
  chipTextActive: { color: C.surface, fontFamily: F.semiBold },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  suggestion: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 99, backgroundColor: '#E8F0E9' },
  body: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 16 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 },
  resultCard: { padding: 10, borderRadius: 13, backgroundColor: C.surface, gap: 7 },
  resultTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  resultThumbImage: { width: 58, height: 58, borderRadius: 10, backgroundColor: '#DCEDE0' },
  resultImage: {
    width: 58,
    height: 58,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DCEDE0',
  },
  plantEmoji: { fontSize: 26 },
  resultCopy: { flex: 1, gap: 2 },
  resultName: { color: C.forest, fontFamily: F.semiBold, fontSize: 13 },
  latin: { color: C.mutedText, fontFamily: F.regular, fontStyle: 'italic', fontSize: 10 },
  favButton: {
    minWidth: 36,
    minHeight: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.softSurface,
  },
  favButtonDisabled: { opacity: 0.5 },
  favorite: { color: C.terracotta, fontSize: 22 },
  statusLine: {
    padding: 7,
    borderRadius: 8,
    backgroundColor: C.softSurface,
    color: C.secondaryText,
    fontFamily: F.regular,
    fontSize: 10,
  },
  actions: { flexDirection: 'row', gap: 7 },
  action: {
    flex: 1,
    minHeight: 37,
    paddingHorizontal: 9,
    borderRadius: 9,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: C.surface, fontFamily: F.semiBold, fontSize: 10 },
  actionLight: { backgroundColor: C.softSurface },
  actionLightText: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 10 },
  stateCard: { padding: 20, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', gap: 10 },
  emptyCard: { padding: 16, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', gap: 10 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.softSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPlant: { color: '#83A993', fontSize: 34 },
  emptyTitle: { color: C.forest, fontFamily: F.semiBold, textAlign: 'center', fontSize: 13 },
  queryText: { color: C.terracotta, fontFamily: F.bold, fontSize: 16 },
  bodyCenter: { color: C.secondaryText, fontFamily: F.regular, textAlign: 'center', fontSize: 11, lineHeight: 17 },
  emptyActions: { flexDirection: 'row', gap: 8, width: '100%' },
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
  paginationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  pageButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, backgroundColor: C.softSurface },
  pageButtonDisabled: { opacity: 0.45 },
  pageButtonText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  mockNote: { color: C.mutedText, fontFamily: F.regular, fontSize: 10, lineHeight: 15 },
  filterHeader: {
    minHeight: 54,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 },
  filterContent: { padding: 12, gap: 11, paddingBottom: 22 },
  toggleRow: { flexDirection: 'row', padding: 4, borderRadius: 10, backgroundColor: '#E4EDE6', gap: 4 },
  toggleOption: { flex: 1, minHeight: 37, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  toggleActive: { backgroundColor: C.surface },
  toggleText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11 },
  toggleTextActive: { color: C.forest, fontFamily: F.semiBold },
  letters: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  letter: {
    width: 25,
    height: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 99,
    backgroundColor: C.softSurface,
  },
  letterActive: { backgroundColor: C.forest },
  letterText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 9 },
  filterGroup: { gap: 7 },
  link: { color: C.primary, fontFamily: F.semiBold, fontSize: 11 },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  option: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: '#E5ECE6',
  },
  optionActive: { backgroundColor: C.forest, borderColor: C.forest },
  optionText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 10 },
  optionTextActive: { color: C.surface, fontFamily: F.semiBold },
  filterResult: { padding: 11, borderRadius: 12, backgroundColor: C.softSurface, gap: 4 },
  filterFooter: {
    padding: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DDE8E0',
    backgroundColor: C.surface,
    flexDirection: 'row',
    gap: 8,
  },
});
