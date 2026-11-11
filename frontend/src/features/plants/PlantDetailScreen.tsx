import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { getHealthStatusMeta } from '@/features/gardens/gardenTypes';
import { useDeletePlantMutation, useUserPlantDetail } from '@/features/plants/plantHooks';
import type { UserPlantDetailDto } from '@/features/plants/plantTypes';
import { useFavoriteToggle, useSpeciesDetail } from '@/features/species/speciesHooks';
import { AppApiError } from '@/services/api/apiError';
import { getSessionGeneration } from '@/services/api/tokenStorage';

const missing = 'Chưa có dữ liệu';

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={d.infoRow}>
      <Text style={d.infoLabel}>{label}</Text>
      <Text style={d.infoValue}>{value?.trim() || missing}</Text>
    </View>
  );
}

function formatCreatedAt(value?: string | null): string {
  if (!value || !value.trim()) {
    return missing;
  }
  const isoDay = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(isoDay) ? isoDay : value;
}

export default function PlantDetailScreen() {
  const { plantId, speciesId } = useLocalSearchParams<{ plantId?: string; speciesId?: string }>();
  const cleanPlantId = typeof plantId === 'string' ? plantId.trim() : '';
  const cleanSpeciesId = typeof speciesId === 'string' ? speciesId.trim() : '';

  const { user } = useAuth();
  const currentUserId = typeof user?.id === 'string' ? user.id.trim() : '';
  const currentUserIdRef = useRef(currentUserId);
  const prevUserIdRef = useRef(currentUserId);

  const isPlantMode = Boolean(cleanPlantId);

  const deletePlantMutation = useDeletePlantMutation();
  const [isDeleted, setIsDeleted] = useState(false);
  const [deletingSnapshot, setDeletingSnapshot] = useState<UserPlantDetailDto | null>(null);

  const plantQuery = useUserPlantDetail(cleanPlantId, {
    enabled: isPlantMode && !isDeleted && !deletePlantMutation.isPending,
  });

  const speciesQuery = useSpeciesDetail(cleanSpeciesId, {
    enabled: !isPlantMode && Boolean(cleanSpeciesId),
  });
  const { toggleFavorite, isSpeciesPending, isAnyFavoritePending } = useFavoriteToggle();

  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = currentUserId;
    currentUserIdRef.current = currentUserId;
    if (prevUserId && prevUserId !== currentUserId) {
      setIsDeleted(false);
      setDeletingSnapshot(null);
      setFavoriteError(null);
      setDeleteError(null);
    }
  }, [currentUserId]);

  useEffect(() => {
    setIsDeleted(false);
    setDeletingSnapshot(null);
    setDeleteError(null);
  }, [cleanPlantId]);

  if (isPlantMode) {
    const plant = plantQuery.data ?? deletingSnapshot;

    if (plantQuery.isLoading && !plant) {
      return (
        <SafeAreaView style={d.safe} edges={['top']}>
          <View style={d.header}>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Quay lại"
              style={d.back}
            >
              <Text style={d.backText}>‹</Text>
            </Pressable>
            <Text style={d.headerTitle}>Chi tiết cây trồng</Text>
            <View style={d.headerRightPlaceholder} />
          </View>
          <View style={d.centerState}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={d.stateBody}>Đang tải thông tin cây trồng...</Text>
          </View>
        </SafeAreaView>
      );
    }

    if (!plant || (plantQuery.isError && !plantQuery.data)) {
      const statusCode = plantQuery.error?.statusCode;
      const isForbidden = statusCode === 403 || plantQuery.error?.isForbiddenError;
      const isNotFound = statusCode === 404;

      return (
        <SafeAreaView style={d.safe} edges={['top']}>
          <View style={d.header}>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Quay lại"
              style={d.back}
            >
              <Text style={d.backText}>‹</Text>
            </Pressable>
            <Text style={d.headerTitle}>Chi tiết cây trồng</Text>
            <View style={d.headerRightPlaceholder} />
          </View>
          <View style={d.centerState} accessibilityRole="alert">
            <Text style={d.stateTitle}>
              {isForbidden
                ? 'Không có quyền truy cập cây trồng'
                : isNotFound
                  ? 'Không tìm thấy cây trồng'
                  : 'Không thể tải thông tin cây trồng'}
            </Text>
            <Text style={d.stateBody}>
              {plantQuery.error?.message || 'Hồ sơ cây trồng không tồn tại hoặc đã bị xóa.'}
            </Text>
            <View style={d.stateActions}>
              {!isForbidden && !isNotFound ? (
                <Pressable
                  onPress={() => plantQuery.refetch()}
                  style={d.primaryButton}
                  accessibilityRole="button"
                >
                  <Text style={d.primaryText}>Thử lại</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() =>
                  router.canGoBack() ? router.back() : router.replace('/plants' as never)
                }
                style={d.secondaryButton}
                accessibilityRole="button"
              >
                <Text style={d.secondaryText}>Quay lại</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      );
    }

    const health = getHealthStatusMeta(plant.healthStatus);
    const badgeToneStyle =
      health.tone === 'peach'
        ? d.tagWarning
        : health.tone === 'danger'
          ? d.tagDanger
          : health.tone === 'plain'
            ? d.tagPlain
            : undefined;
    const badgeTextToneStyle =
      health.tone === 'peach'
        ? d.tagWarningText
        : health.tone === 'danger'
          ? d.tagDangerText
          : health.tone === 'plain'
            ? d.tagPlainText
            : undefined;

    const handleRequestDeletePlant = () => {
      const initiatedGeneration = getSessionGeneration();
      const initiatedByUserId = currentUserIdRef.current;
      const hasSwitchedSession = () =>
        getSessionGeneration() !== initiatedGeneration ||
        (Boolean(initiatedByUserId) && currentUserIdRef.current !== initiatedByUserId);

      Alert.alert(
        'Xác nhận xóa cây trồng',
        `Bạn có chắc chắn muốn xóa cây “${plant.displayName}”? Việc xóa cây sẽ đồng thời xóa toàn bộ lịch chăm sóc (Care Schedules), lịch sử chăm sóc (Care Logs) và nhật ký phát triển (Growth Journals) liên quan trên máy chủ. Thao tác này không thể hoàn tác.`,
        [
          { text: 'Hủy', style: 'cancel' },
          {
            text: 'Xóa cây',
            style: 'destructive',
            onPress: () => {
              if (hasSwitchedSession()) {
                return;
              }
              setDeleteError(null);
              setDeletingSnapshot(plant);
              setIsDeleted(true);
              void deletePlantMutation
                .mutateAsync(plant.id)
                .then(() => {
                  if (hasSwitchedSession()) {
                    return;
                  }
                  router.replace('/plants' as never);
                })
                .catch((err) => {
                  if (hasSwitchedSession()) {
                    return;
                  }
                  setIsDeleted(false);
                  setDeletingSnapshot(null);
                  if (err instanceof AppApiError) {
                    if (err.code === 'SESSION_USER_MISMATCH') {
                      return;
                    }
                    setDeleteError(err.message);
                    return;
                  }
                  setDeleteError('Không thể xóa cây trồng. Vui lòng thử lại.');
                });
            },
          },
        ]
      );
    };

    return (
      <SafeAreaView style={d.safe} edges={['top']}>
        <View style={d.header}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            style={d.back}
          >
            <Text style={d.backText}>‹</Text>
          </Pressable>
          <Text style={d.headerTitle}>Chi tiết cây trồng</Text>
          <View style={d.headerRightPlaceholder} />
        </View>

        <ScrollView contentContainerStyle={d.content}>
          {deleteError ? (
            <View style={d.errorBanner} accessibilityRole="alert">
              <Text style={d.errorBannerText}>{deleteError}</Text>
              <Pressable onPress={() => setDeleteError(null)} accessibilityRole="button">
                <Text style={d.dismissText}>Đóng</Text>
              </Pressable>
            </View>
          ) : null}

          {plant.imageUrl ? (
            <Image source={{ uri: plant.imageUrl }} style={d.heroImage} contentFit="cover" />
          ) : (
            <View style={d.hero}>
              <Text style={d.heroEmoji}>♧</Text>
              <Text style={d.heroBadge}>HỒ SƠ CÂY TRỒNG • GOPLANT</Text>
            </View>
          )}

          <View style={d.titleRow}>
            <View style={d.copy}>
              <Text style={d.title}>{plant.displayName}</Text>
              {plant.species?.scientificName ? (
                <Text style={d.latin}>{plant.species.scientificName}</Text>
              ) : null}
              <View style={d.tags}>
                <Text style={[d.tag, badgeToneStyle, badgeTextToneStyle]}>{health.label}</Text>
                {plant.species?.category ? <Text style={d.tag}>{plant.species.category}</Text> : null}
                {plant.garden?.name ? <Text style={d.tag}>⌂ {plant.garden.name}</Text> : null}
              </View>
            </View>
          </View>

          <View style={d.card}>
            <Text style={d.sectionTitle}>Hồ sơ cây của bạn</Text>
            <InfoRow label="Tên hiển thị" value={plant.displayName} />
            <InfoRow label="Khu vườn" value={plant.garden?.name} />
            <InfoRow label="Vị trí trong vườn" value={plant.location} />
            <InfoRow label="Ngày trồng / bắt đầu chăm sóc" value={plant.plantedAt} />
            <InfoRow label="Tình trạng sức khỏe" value={health.label} />
            <InfoRow label="Ghi chú" value={plant.note} />
            {plant.plantCode?.trim() ? (
              <InfoRow label="Mã định danh cây" value={plant.plantCode} />
            ) : null}
            <InfoRow label="Ngày tạo hồ sơ" value={formatCreatedAt(plant.createdAt)} />

            {plant.garden ? (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/garden-detail',
                    params: { gardenId: plant.garden!.id },
                  } as never)
                }
                accessibilityRole="button"
                style={d.inlineLinkButton}
              >
                <Text style={d.inlineLinkText}>Mở khu vườn “{plant.garden.name}” ›</Text>
              </Pressable>
            ) : null}
          </View>

          {plant.species ? (
            <View style={d.card}>
              <Text style={d.sectionTitle}>Thông tin loài cây</Text>
              <InfoRow label="Tên thường gọi" value={plant.species.commonName} />
              <InfoRow label="Tên khoa học" value={plant.species.scientificName} />
              <InfoRow label="Nhóm cây" value={plant.species.category} />
              <InfoRow label="Độ khó" value={plant.species.difficulty} />
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/plant-detail',
                    params: { speciesId: plant.species!.id },
                  } as never)
                }
                accessibilityRole="button"
                style={d.inlineLinkButton}
              >
                <Text style={d.inlineLinkText}>Xem chi tiết loài cây ›</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={d.actions}>
            <Pressable
              disabled={deletePlantMutation.isPending}
              onPress={() =>
                router.push({
                  pathname: '/garden/add-plant',
                  params: { editPlantId: plant.id },
                } as never)
              }
              style={[d.primaryButton, deletePlantMutation.isPending && d.buttonDisabled]}
              accessibilityRole="button"
              accessibilityState={{ disabled: deletePlantMutation.isPending }}
            >
              <Text style={d.primaryText}>Chỉnh sửa cây</Text>
            </Pressable>

            <Pressable
              disabled={deletePlantMutation.isPending}
              onPress={handleRequestDeletePlant}
              style={[d.dangerButton, deletePlantMutation.isPending && d.buttonDisabled]}
              accessibilityRole="button"
              accessibilityState={{ disabled: deletePlantMutation.isPending }}
            >
              <Text style={d.dangerText}>
                {deletePlantMutation.isPending ? 'Đang xóa cây...' : 'Xóa cây'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!cleanSpeciesId) {
    return (
      <SafeAreaView style={d.safe} edges={['top']}>
        <View style={d.header}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            style={d.back}
          >
            <Text style={d.backText}>‹</Text>
          </Pressable>
          <Text style={d.headerTitle}>Chi tiết cây</Text>
          <View style={d.headerRightPlaceholder} />
        </View>
        <View style={d.centerState}>
          <Text style={d.stateTitle}>Không tìm thấy mã cây hoặc loài cây</Text>
          <Text style={d.stateBody}>
            Vui lòng chọn một cây trồng của bạn hoặc một loài cây từ thư viện để xem chi tiết.
          </Text>
          <View style={d.stateActions}>
            <Pressable
              onPress={() => router.replace('/plants' as never)}
              style={d.primaryButton}
              accessibilityRole="button"
            >
              <Text style={d.primaryText}>Quản lý cây trồng</Text>
            </Pressable>
            <Pressable
              onPress={() => router.replace('/search' as never)}
              style={d.secondaryButton}
              accessibilityRole="button"
            >
              <Text style={d.secondaryText}>Mở thư viện loài cây</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (speciesQuery.isLoading) {
    return (
      <SafeAreaView style={d.safe} edges={['top']}>
        <View style={d.header}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            style={d.back}
          >
            <Text style={d.backText}>‹</Text>
          </Pressable>
          <Text style={d.headerTitle}>Chi tiết loài cây</Text>
          <View style={d.headerRightPlaceholder} />
        </View>
        <View style={d.centerState}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={d.stateBody}>Đang tải thông tin loài cây...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (speciesQuery.isError || !speciesQuery.data) {
    const isNotFound = speciesQuery.error?.statusCode === 404;
    return (
      <SafeAreaView style={d.safe} edges={['top']}>
        <View style={d.header}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            style={d.back}
          >
            <Text style={d.backText}>‹</Text>
          </Pressable>
          <Text style={d.headerTitle}>Chi tiết loài cây</Text>
          <View style={d.headerRightPlaceholder} />
        </View>
        <View style={d.centerState} accessibilityRole="alert">
          <Text style={d.stateTitle}>
            {isNotFound ? 'Không tìm thấy loài cây' : 'Không thể tải thông tin loài cây'}
          </Text>
          <Text style={d.stateBody}>
            {speciesQuery.error?.message || 'Loài cây không tồn tại hoặc đã ngừng hiển thị.'}
          </Text>
          <View style={d.stateActions}>
            {!isNotFound ? (
              <Pressable
                onPress={() => speciesQuery.refetch()}
                style={d.primaryButton}
                accessibilityRole="button"
              >
                <Text style={d.primaryText}>Thử lại</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => router.back()}
              style={d.secondaryButton}
              accessibilityRole="button"
            >
              <Text style={d.secondaryText}>Quay lại</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const species = speciesQuery.data;
  const favPending = isSpeciesPending(species.id);

  const handleToggleFavorite = async () => {
    const initiatedGeneration = getSessionGeneration();
    const initiatedByUserId = currentUserIdRef.current;
    setFavoriteError(null);
    try {
      await toggleFavorite(species.id, species.isFavorited);
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
          setFavoriteError('Loài cây này đã có trong danh sách yêu thích, đã đồng bộ lại trạng thái.');
          return;
        }
        if (err.statusCode === 404) {
          setFavoriteError('Không tìm thấy bản ghi yêu thích, đã đồng bộ lại trạng thái.');
          return;
        }
        setFavoriteError(err.message);
        return;
      }
      setFavoriteError('Không thể cập nhật trạng thái yêu thích. Vui lòng thử lại.');
    }
  };

  return (
    <SafeAreaView style={d.safe} edges={['top']}>
      <View style={d.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          style={d.back}
        >
          <Text style={d.backText}>‹</Text>
        </Pressable>
        <Text style={d.headerTitle}>Chi tiết loài cây</Text>
        <Pressable
          disabled={isAnyFavoritePending}
          onPress={() => {
            void handleToggleFavorite();
          }}
          accessibilityRole="button"
          accessibilityLabel={species.isFavorited ? 'Bỏ yêu thích' : 'Thêm yêu thích'}
          accessibilityState={{ disabled: isAnyFavoritePending }}
          style={[d.heartButton, isAnyFavoritePending && d.heartButtonDisabled]}
        >
          <Text style={d.heart}>{favPending ? '…' : species.isFavorited ? '♥' : '♡'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={d.content}>
        {favoriteError ? (
          <View style={d.errorBanner} accessibilityRole="alert">
            <Text style={d.errorBannerText}>{favoriteError}</Text>
            <Pressable onPress={() => setFavoriteError(null)}>
              <Text style={d.dismissText}>Đóng</Text>
            </Pressable>
          </View>
        ) : null}

        {species.thumbnailUrl ? (
          <Image source={{ uri: species.thumbnailUrl }} style={d.heroImage} contentFit="cover" />
        ) : (
          <View style={d.hero}>
            <Text style={d.heroEmoji}>♧</Text>
            <Text style={d.heroBadge}>THƯ VIỆN LOÀI CÂY • GOPLANT</Text>
          </View>
        )}

        <View style={d.titleRow}>
          <View style={d.copy}>
            <Text style={d.title}>{species.commonName}</Text>
            <Text style={d.latin}>{species.scientificName}</Text>
            <View style={d.tags}>
              <Text style={d.tag}>{species.category}</Text>
              <Text style={d.tag}>Độ khó: {species.difficulty || missing}</Text>
              {species.isFavorited ? <Text style={[d.tag, d.tagFavorite]}>♥ Đã yêu thích</Text> : null}
            </View>
          </View>
        </View>

        <View style={d.card}>
          <Text style={d.sectionTitle}>Thông tin nhận diện</Text>
          <InfoRow label="Tên thường gọi" value={species.commonName} />
          <InfoRow label="Tên khoa học" value={species.scientificName} />
          <InfoRow label="Nhóm cây" value={species.category} />
          <InfoRow label="Nguồn gốc" value={species.origin} />
          <InfoRow label="Mô tả ngắn" value={species.overview} />
        </View>

        <View style={d.card}>
          <Text style={d.sectionTitle}>Tổng quan về cây</Text>
          <InfoRow label="Đặc điểm hình thái" value={species.morphology} />
          <InfoRow label="Tuổi thọ" value={species.lifespan} />
          <InfoRow label="Mùa hoa / mùa quả" value={species.floweringSeason} />
          <InfoRow label="Công dụng và lưu ý" value={species.usageAndCaution} />
        </View>

        <View style={d.card}>
          <Text style={d.sectionTitle}>Đặc tính và điều kiện sinh trưởng</Text>
          <InfoRow label="Độ khó chăm sóc" value={species.difficulty} />
          <InfoRow label="Nhu cầu ánh sáng" value={species.lightRequirement} />
          <InfoRow label="Nhu cầu nước" value={species.waterRequirement} />
          <InfoRow label="Tần suất tưới tham khảo" value={species.wateringFrequency} />
          <InfoRow label="Môi trường sống" value={species.environment} />
          <InfoRow label="Không gian trồng phù hợp" value={species.spaceRequirement} />
          <InfoRow label="Nhiệt độ phù hợp" value={species.temperatureRange} />
          <InfoRow label="Độ ẩm không khí" value={species.humidityRange} />
          <InfoRow label="Loại đất / giá thể" value={species.growingMedium} />
          <InfoRow label="Nhu cầu thoát nước" value={species.drainage} />
          <InfoRow label="Độ pH đất" value={species.soilPh} />
          <InfoRow label="Khả năng chịu nắng" value={species.sunTolerance} />
          <InfoRow label="Kích thước trưởng thành" value={species.matureSize} />
          <InfoRow label="Tốc độ phát triển" value={species.growthRate} />
          <InfoRow label="Nhu cầu dinh dưỡng" value={species.nutrition} />
          <Text style={d.note}>Các trường chưa có dữ liệu trên máy chủ hiển thị là “{missing}”.</Text>
        </View>

        <View style={d.actions}>
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/garden/add-plant',
                params: { speciesId: species.id },
              } as never)
            }
            style={d.primaryButton}
            accessibilityRole="button"
          >
            <Text style={d.primaryText}>＋  Thêm cây vào cây của tôi</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const d = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: {
    height: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: { width: 36 },
  backText: { color: C.forest, fontSize: 30 },
  headerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 15 },
  headerRightPlaceholder: { width: 36 },
  heartButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  heartButtonDisabled: { opacity: 0.5 },
  heart: { color: C.terracotta, fontSize: 25 },
  content: { padding: 13, gap: 10, paddingBottom: 24 },
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
  heroImage: { height: 180, borderRadius: 16, backgroundColor: '#D9EBDD' },
  hero: {
    height: 150,
    borderRadius: 16,
    backgroundColor: '#D9EBDD',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  heroEmoji: { color: '#508664', fontSize: 74 },
  heroBadge: { color: C.forest, fontFamily: F.bold, fontSize: 9, letterSpacing: 0.8 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  copy: { flex: 1 },
  title: { color: C.forest, fontFamily: F.bold, fontSize: 21 },
  latin: { color: C.mutedText, fontFamily: F.regular, fontStyle: 'italic', fontSize: 12 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: '#DDF2E4',
    color: C.forest,
    fontFamily: F.semiBold,
    fontSize: 10,
  },
  tagFavorite: { backgroundColor: '#FFE0CF', color: '#914218' },
  tagWarning: { backgroundColor: '#FFE8D2' },
  tagWarningText: { color: '#914218' },
  tagDanger: { backgroundColor: '#FDECEC' },
  tagDangerText: { color: '#B42318' },
  tagPlain: { backgroundColor: '#E7EEE8' },
  tagPlainText: { color: C.secondaryText },
  card: { padding: 12, borderRadius: 14, backgroundColor: C.surface, gap: 3 },
  sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14, marginBottom: 3 },
  infoRow: {
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2EAE3',
    gap: 2,
  },
  infoLabel: { color: C.secondaryText, fontFamily: F.regular, fontSize: 10 },
  infoValue: { color: C.text, fontFamily: F.semiBold, fontSize: 11, lineHeight: 17 },
  inlineLinkButton: { paddingTop: 8, alignSelf: 'flex-start' },
  inlineLinkText: { color: C.primary, fontFamily: F.semiBold, fontSize: 11 },
  note: { color: C.mutedText, fontFamily: F.regular, fontSize: 9, lineHeight: 14, marginTop: 4 },
  actions: { gap: 8 },
  primaryButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: C.surface, fontFamily: F.semiBold, fontSize: 12 },
  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: C.softSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: C.forest, fontFamily: F.semiBold, fontSize: 12 },
  dangerButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: '#F5C2C0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerText: { color: '#B42318', fontFamily: F.semiBold, fontSize: 12 },
  buttonDisabled: { opacity: 0.55 },
  centerState: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  stateTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 15, textAlign: 'center' },
  stateBody: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  stateActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
});
