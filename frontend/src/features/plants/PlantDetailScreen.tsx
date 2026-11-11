import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { plantCatalog, usePlantData } from '@/features/plants/PlantDataStore';
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

export default function PlantDetailScreen() {
  const { speciesId, ownedId } = useLocalSearchParams<{ speciesId?: string; ownedId?: string }>();
  const cleanSpeciesId = typeof speciesId === 'string' ? speciesId.trim() : '';
  const cleanOwnedId = typeof ownedId === 'string' ? ownedId.trim() : '';

  const { user } = useAuth();
  const currentUserId = typeof user?.id === 'string' ? user.id.trim() : '';
  const currentUserIdRef = useRef(currentUserId);
  const prevUserIdRef = useRef(currentUserId);

  const { ownedPlants } = usePlantData();
  const owned = cleanOwnedId ? ownedPlants.find((item) => item.id === cleanOwnedId) : undefined;

  const isOwnedDemoMode = Boolean(owned);
  const speciesQuery = useSpeciesDetail(cleanSpeciesId, {
    enabled: Boolean(cleanSpeciesId) && !isOwnedDemoMode,
  });
  const { toggleFavorite, isSpeciesPending, isAnyFavoritePending } = useFavoriteToggle();
  const [favoriteError, setFavoriteError] = useState<string | null>(null);

  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = currentUserId;
    currentUserIdRef.current = currentUserId;
    if (prevUserId && prevUserId !== currentUserId) {
      setFavoriteError(null);
    }
  }, [currentUserId]);

  if (isOwnedDemoMode && owned) {
    const sampleRef = plantCatalog.find((item) => item.id === owned.catalogId);
    return (
      <SafeAreaView style={d.safe} edges={['top']}>
        <View style={d.header}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Quay lại" style={d.back}>
            <Text style={d.backText}>‹</Text>
          </Pressable>
          <Text style={d.headerTitle}>Chi tiết cây demo</Text>
          <View style={d.headerRightPlaceholder} />
        </View>
        <ScrollView contentContainerStyle={d.content}>
          <View style={d.hero}>
            <Text style={d.heroEmoji}>♧</Text>
            <Text style={d.heroBadge}>HỒ SƠ DEMO CỤC BỘ • G5.4</Text>
          </View>
          <View style={d.titleRow}>
            <View style={d.copy}>
              <Text style={d.title}>{owned.name}</Text>
              <Text style={d.latin}>{owned.scientificName}</Text>
              <View style={d.tags}>
                <Text style={d.tag}>{owned.category}</Text>
                <Text style={d.tag}>Bản xem trước G5.4</Text>
              </View>
            </View>
          </View>

          <View style={d.card}>
            <Text style={d.sectionTitle}>Hồ sơ cây của bạn</Text>
            <InfoRow label="Ngày trồng / bắt đầu chăm sóc" value={owned.plantedAt} />
            <InfoRow label="Vị trí hiện tại" value={owned.location} />
            <InfoRow label="Ghi chú" value={owned.note} />
            <InfoRow label="Tình trạng" value="Chưa đánh giá" />
            <Text style={d.note}>Hồ sơ cây cá nhân hiện lưu tạm cục bộ; API User Plants sẽ được tích hợp ở giai đoạn G5.4.</Text>
          </View>

          {sampleRef ? (
            <View style={d.card}>
              <Text style={d.sectionTitle}>Thông tin tham chiếu mẫu</Text>
              <InfoRow label="Tên cây" value={sampleRef.name} />
              <InfoRow label="Tên khoa học" value={sampleRef.scientificName} />
              <InfoRow label="Loại cây" value={sampleRef.category} />
            </View>
          ) : null}

          <View style={d.actions}>
            <Pressable
              onPress={() => router.push({ pathname: '/garden/add-plant', params: { editId: owned.id } } as never)}
              style={d.primaryButton}
              accessibilityRole="button"
            >
              <Text style={d.primaryText}>Chỉnh sửa hồ sơ cây demo</Text>
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
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Quay lại" style={d.back}>
            <Text style={d.backText}>‹</Text>
          </Pressable>
          <Text style={d.headerTitle}>Chi tiết loài cây</Text>
          <View style={d.headerRightPlaceholder} />
        </View>
        <View style={d.centerState}>
          <Text style={d.stateTitle}>Không tìm thấy mã loài cây</Text>
          <Text style={d.stateBody}>Vui lòng chọn một loài cây từ thư viện hoặc danh sách yêu thích để xem chi tiết.</Text>
          <Pressable onPress={() => router.replace('/search' as never)} style={d.primaryButton} accessibilityRole="button">
            <Text style={d.primaryText}>Mở thư viện loài cây</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (speciesQuery.isLoading) {
    return (
      <SafeAreaView style={d.safe} edges={['top']}>
        <View style={d.header}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Quay lại" style={d.back}>
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
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Quay lại" style={d.back}>
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
              <Pressable onPress={() => speciesQuery.refetch()} style={d.primaryButton} accessibilityRole="button">
                <Text style={d.primaryText}>Thử lại</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => router.back()} style={d.secondaryButton} accessibilityRole="button">
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
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Quay lại" style={d.back}>
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
              Alert.alert(
                'Sắp ra mắt (G5.4)',
                'Chức năng thêm cây vào khu vườn (User Plants API) sẽ được kết nối ở giai đoạn G5.4.'
              )
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
