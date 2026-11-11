import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { useUserProfile } from '@/features/auth/authHooks';
import { useGardensList } from '@/features/gardens/gardenHooks';
import { getHealthStatusMeta, getSpaceTypeLabel } from '@/features/gardens/gardenTypes';
import { useUserPlantsList } from '@/features/plants/plantHooks';
import { SPECIES_CATEGORY_OPTIONS } from '@/features/species/speciesTypes';

function SectionTitle({
  title,
  trailing,
  onTrailingPress,
}: {
  title: string;
  trailing?: string;
  onTrailingPress?: () => void;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {trailing ? (
        onTrailingPress ? (
          <Pressable onPress={onTrailingPress} accessibilityRole="button">
            <Text style={styles.sectionTrailingLink}>{trailing}</Text>
          </Pressable>
        ) : (
          <Text style={styles.sectionTrailing}>{trailing}</Text>
        )
      ) : null}
    </View>
  );
}

export function HomeGardensSection() {
  const gardensQuery = useGardensList();
  const gardens = gardensQuery.data ?? [];
  const navigate = (route: string) => router.push(route as never);

  return (
    <>
      <SectionTitle
        title="Vườn của bạn"
        trailing={
          gardensQuery.isLoading
            ? 'Đang tải...'
            : `${gardens.length} khu vực • Quản lý ›`
        }
        onTrailingPress={() => navigate('/gardens')}
      />
      {gardens.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalCards}>
          {gardens.map((garden) => (
            <Pressable
              key={garden.id}
              onPress={() =>
                router.push({
                  pathname: '/garden-detail',
                  params: { gardenId: garden.id },
                } as never)
              }
              accessibilityRole="button"
              style={styles.gardenCard}
            >
              <View style={styles.gardenCardThumb}>
                {garden.coverImageUrl ? (
                  <Image
                    source={{ uri: garden.coverImageUrl }}
                    style={styles.gardenCardImage}
                    contentFit="cover"
                  />
                ) : (
                  <Text style={styles.gardenCardGlyph}>♧</Text>
                )}
              </View>
              <Text style={styles.gardenName} numberOfLines={1}>
                {garden.name}
              </Text>
              <Text style={styles.caption} numberOfLines={1}>
                {garden.location} • {getSpaceTypeLabel(garden.spaceType)}
              </Text>
              <View style={styles.divider} />
              <Text style={styles.gardenStatus}>{garden.plantCount} cây đang trồng</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => navigate('/garden/create')} accessibilityRole="button" style={styles.addGarden}>
            <Text style={styles.addPlus}>＋</Text>
            <Text style={styles.caption}>Tạo vườn mới</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <View style={styles.emptyHomeCard}>
          <Text style={styles.emptyHomeArt}>⌂</Text>
          <Text style={styles.emptyHomeTitle}>
            {gardensQuery.isError
              ? 'Không tải được khu vườn'
              : 'Bắt đầu tạo khu vườn đầu tiên'}
          </Text>
          <Text style={styles.bodyText}>
            {gardensQuery.isError
              ? gardensQuery.error.message
              : 'Tạo không gian riêng để sắp xếp và chăm sóc cây.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              gardensQuery.isError ? gardensQuery.refetch() : navigate('/garden/create')
            }
            style={styles.emptyHomeButton}
          >
            <Text style={styles.white}>
              {gardensQuery.isError ? 'Thử lại' : '＋  Tạo khu vườn mới'}
            </Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

export function HomePlantsSection() {
  const plantsQuery = useUserPlantsList({ page: 0, size: 10, sort: 'createdAt,desc' });
  const plantsPage = plantsQuery.data;
  const plants = plantsPage?.content ?? [];
  const totalElements = plantsPage?.totalElements ?? 0;
  const navigate = (route: string) => router.push(route as never);

  return (
    <>
      <SectionTitle
        title="Cây trồng của bạn"
        trailing={
          plantsQuery.isLoading ? 'Đang tải...' : `${totalElements} cây • Quản lý ›`
        }
        onTrailingPress={() => navigate('/plants')}
      />
      {plantsQuery.isLoading ? (
        <View style={styles.emptyHomeCard}>
          <ActivityIndicator size="small" color={C.primary} />
          <Text style={styles.bodyText}>Đang tải cây trồng của bạn...</Text>
        </View>
      ) : plantsQuery.isError ? (
        <View style={styles.emptyHomeCard} accessibilityRole="alert">
          <Text style={styles.emptyHomeArt}>♧</Text>
          <Text style={styles.emptyHomeTitle}>Không tải được danh sách cây trồng</Text>
          <Text style={styles.bodyText}>{plantsQuery.error.message}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void plantsQuery.refetch();
            }}
            style={styles.emptyHomeButton}
          >
            <Text style={styles.white}>Thử lại</Text>
          </Pressable>
        </View>
      ) : plants.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalCards}
        >
          {plants.map((plant) => {
            const health = getHealthStatusMeta(plant.healthStatus);
            return (
              <Pressable
                key={plant.id}
                onPress={() =>
                  router.push({
                    pathname: '/plant-detail',
                    params: { plantId: plant.id },
                  } as never)
                }
                accessibilityRole="button"
                accessibilityLabel={`Xem chi tiết ${plant.displayName}`}
                style={styles.gardenCard}
              >
                <View style={styles.gardenCardThumb}>
                  {plant.imageUrl ? (
                    <Image
                      source={{ uri: plant.imageUrl }}
                      style={styles.gardenCardImage}
                      contentFit="cover"
                    />
                  ) : (
                    <Text style={styles.gardenCardGlyph}>♧</Text>
                  )}
                </View>
                <Text style={styles.gardenName} numberOfLines={1}>
                  {plant.displayName}
                </Text>
                <Text style={styles.caption} numberOfLines={1}>
                  {plant.speciesName || 'Chưa gắn loài'}
                  {plant.gardenName ? ` • ${plant.gardenName}` : ''}
                </Text>
                <View style={styles.divider} />
                <Text style={styles.gardenStatus}>{health.label}</Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => navigate('/garden/add-plant')}
            accessibilityRole="button"
            style={styles.addGarden}
          >
            <Text style={styles.addPlus}>＋</Text>
            <Text style={styles.caption}>Thêm cây mới</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <View style={styles.emptyHomeCard}>
          <Text style={styles.emptyHomeArt}>♧</Text>
          <Text style={styles.emptyHomeTitle}>Bạn chưa có cây trồng nào</Text>
          <Text style={styles.bodyText}>
            Chọn khu vườn và loài cây từ thư viện để bắt đầu theo dõi sự phát triển.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigate('/garden/add-plant')}
            style={styles.emptyHomeButton}
          >
            <Text style={styles.white}>＋  Thêm cây mới</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const { data: profile } = useUserProfile();
  const [category, setCategory] = useState(SPECIES_CATEGORY_OPTIONS[0]);
  const [query, setQuery] = useState('');

  const unavailable = (feature: string) =>
    Alert.alert('Bản xem trước giao diện', `${feature} sẽ được triển khai theo thiết kế ở đợt tiếp theo.`);
  const navigate = (route: string) => router.push(route as never);

  const displayName = profile?.fullName || user?.fullName || 'Người yêu cây';
  const displayInitial = displayName.charAt(0).toUpperCase();
  const displayEmail =
    profile?.email ||
    user?.email ||
    (profile?.phoneNumber ? `SĐT: ${profile.phoneNumber}` : 'Chưa cập nhật email');

  const handleAvatarPress = () => {
    Alert.alert(
      'Tài khoản GoPlant',
      `Tên: ${displayName}\nEmail: ${displayEmail}\nVai trò: ${(profile?.roles || user?.roles || []).join(', ') || 'ROLE_USER'}`,
      [
        { text: 'Đóng', style: 'cancel' },
        {
          text: 'Đăng xuất',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Xác nhận đăng xuất', 'Bạn có chắc chắn muốn đăng xuất không?', [
              { text: 'Hủy', style: 'cancel' },
              {
                text: 'Đăng xuất',
                style: 'destructive',
                onPress: () => {
                  logout().catch(() => {
                    // Handled: AuthProvider updates status to storage-cleanup-error
                  });
                },
              },
            ]);
          },
        },
      ]
    );
  };

  const openSpeciesSearch = (selectedCategory?: string) => {
    const activeCat = selectedCategory ?? category;
    router.push({
      pathname: '/search',
      params: {
        query,
        ...(activeCat && activeCat !== 'Tất cả' ? { category: activeCat } : {}),
      },
    } as never);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Image
            source={require('@/assets/images/figma/welcome/logo.jpeg')}
            style={styles.logo}
            contentFit="cover"
          />
          <View>
            <Text style={styles.brandName}>GoPlant</Text>
            <Text style={styles.headerTitle}>Trang Chủ</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Thông báo"
            onPress={() => unavailable('Thông báo')}
            style={styles.iconButton}
          >
            <Text style={styles.headerIcon}>♧</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hồ sơ cá nhân và đăng xuất"
            onPress={handleAvatarPress}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{displayInitial}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.greetingRow}>
          <View style={styles.greetingCopy}>
            <Text style={styles.greeting}>Chào buổi sáng, {displayName}🌱</Text>
            <Text style={styles.subtitle}>Hôm nay là thời điểm lý tưởng để chăm vườn nhỏ!</Text>
          </View>
          <View style={styles.sunBadge}>
            <Text style={styles.sun}>☼</Text>
          </View>
        </View>

        <View style={styles.weatherCard}>
          <View style={[styles.roundIcon, { backgroundColor: '#E1F3E8' }]}>
            <Text>☼</Text>
          </View>
          <View style={styles.flexCopy}>
            <Text style={styles.cardTitle}>
              28°C <Text style={styles.secondary}>• Độ ẩm 75%</Text>
            </Text>
            <Text style={styles.bodyText}>Thời tiết tham khảo giao diện mẫu (chưa kết nối API)</Text>
          </View>
          <Text style={styles.lightPill}>Mẫu UI</Text>
        </View>

        <View style={styles.scheduleCard}>
          <View style={styles.scheduleIcon}>
            <Text style={styles.white}>▣</Text>
          </View>
          <View style={styles.flexCopy}>
            <Text style={styles.scheduleTitle}>Lịch chăm sóc cây trồng</Text>
            <Text style={styles.scheduleDescription}>
              Theo dõi các việc cần làm hôm nay, hoàn thành hoặc thiết lập chu kỳ tưới nước & bón phân.
            </Text>
            <View style={styles.scheduleCtaRow}>
              <Pressable
                onPress={() => navigate('/schedule')}
                accessibilityRole="button"
                accessibilityLabel="Mở lịch chăm sóc hôm nay"
                style={styles.scheduleSecondaryButton}
              >
                <Text style={styles.scheduleSecondaryText}>Lịch hôm nay</Text>
              </Pressable>
              <Pressable
                onPress={() => navigate('/schedule/create')}
                accessibilityRole="button"
                accessibilityLabel="Tạo lịch chăm sóc mới"
                style={styles.scheduleButton}
              >
                <Text style={styles.white}>Tạo lịch ngay →</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => openSpeciesSearch()}
            placeholder="Tìm kiếm loài cây trong thư viện..."
            placeholderTextColor="#7B8580"
            style={styles.searchInput}
            returnKeyType="search"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Bộ lọc"
            onPress={() =>
              router.push({
                pathname: '/filter',
                params: {
                  query,
                  category,
                  scope: 'catalog',
                },
              } as never)
            }
            style={styles.searchAction}
          >
            <Text>☷</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {SPECIES_CATEGORY_OPTIONS.map((item) => (
            <Pressable
              key={item}
              onPress={() => {
                setCategory(item);
                openSpeciesSearch(item);
              }}
              style={[styles.chip, category === item && styles.chipSelected]}
            >
              <Text style={[styles.chipText, category === item && styles.chipTextSelected]}>
                {item}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.shortcuts}>
          {[
            ['♧', 'Quản lý cây', '#E8EFEB'],
            ['▦', 'Quản lý vườn', C.brightMint],
            ['▤', 'Nhật ký chăm', C.peach],
            ['♧', 'Sâu bệnh', '#FAD8D3'],
          ].map(([icon, label, color]) => (
            <Pressable
              key={label}
              onPress={() =>
                label === 'Quản lý cây'
                  ? navigate('/plants')
                  : label === 'Quản lý vườn'
                    ? navigate('/gardens')
                    : label === 'Nhật ký chăm'
                      ? navigate('/journal')
                      : navigate('/monitoring')
              }
              style={styles.shortcut}
            >
              <View style={[styles.shortcutIcon, { backgroundColor: color }]}>
                <Text style={styles.shortcutGlyph}>{icon}</Text>
              </View>
              <Text style={styles.shortcutLabel}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <HomeGardensSection />

        <HomePlantsSection />

        <SectionTitle
          title="Khám phá thư viện cây"
          trailing="Mở tìm kiếm ›"
          onTrailingPress={() => openSpeciesSearch('Tất cả')}
        />
        <Pressable onPress={() => openSpeciesSearch('Tất cả')} style={styles.suggestionCard}>
          <Text style={styles.plantEmoji}>🪴</Text>
          <View style={styles.flexCopy}>
            <Text style={styles.cardTitle}>Tra cứu loài cây từ Backend</Text>
            <Text style={styles.bodyText}>Tìm theo tên, nhóm cây và lưu danh sách yêu thích</Text>
          </View>
          <Text style={styles.sectionTrailingLink}>Khám phá ›</Text>
        </Pressable>

        <View style={styles.newUserTip}>
          <Text style={styles.cardTitle}>Mẹo nhỏ cho người mới</Text>
          <Text style={styles.bodyText}>
            Bắt đầu với một loài cây phù hợp ánh sáng và không gian khu vườn của bạn.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.bottomNav}>
        {[
          ['⌂', 'Trang chủ', true],
          ['▦', 'Vườn của tôi', false],
          ['♧', 'Cây trồng', false],
          ['▤', 'Nhật ký', false],
          ['☼', 'Theo dõi', false],
        ].map(([icon, label, selected], index) => (
          <Pressable
            key={label as string}
            accessibilityRole="tab"
            accessibilityState={{ selected: Boolean(selected) }}
            onPress={() => navigate(['/home', '/gardens', '/plants', '/journal', '/monitoring'][index])}
            style={styles.navItem}
          >
            <Text style={[styles.navIcon, selected && styles.navSelected]}>{icon}</Text>
            <Text style={[styles.navLabel, selected && styles.navSelected]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.background },
  header: {
    height: 56,
    paddingHorizontal: 16,
    backgroundColor: C.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2EBE4',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 30, height: 30, borderRadius: 5 },
  brandName: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 16 },
  headerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14, lineHeight: 20 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerIcon: { color: C.secondaryText, fontSize: 22 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#C7D9CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: C.forest, fontFamily: F.bold, fontSize: 14 },
  content: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 20, gap: 8 },
  greetingRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greetingCopy: { flex: 1, gap: 2 },
  greeting: { color: C.forest, fontFamily: F.semiBold, fontSize: 16, lineHeight: 22 },
  subtitle: { color: C.secondaryText, fontFamily: F.regular, fontSize: 13, lineHeight: 19 },
  sunBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#D9F1E3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sun: { color: C.forest, fontSize: 26, lineHeight: 30 },
  weatherCard: {
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: C.softSurface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  roundIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  flexCopy: { flex: 1, gap: 2 },
  cardTitle: { color: C.text, fontFamily: F.semiBold, fontSize: 14, lineHeight: 19 },
  secondary: { color: C.secondaryText, fontFamily: F.regular },
  bodyText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 18 },
  lightPill: {
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: C.surface,
    color: C.forest,
    fontFamily: F.semiBold,
    fontSize: 12,
  },
  white: { color: C.surface, fontFamily: F.semiBold, fontSize: 12 },
  scheduleCard: {
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BCE6CD',
    backgroundColor: '#D9F2E3',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scheduleIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 13, lineHeight: 18 },
  scheduleDescription: { color: C.secondaryText, fontFamily: F.regular, fontSize: 10, lineHeight: 14 },
  scheduleCtaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  scheduleButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 99, backgroundColor: C.primary },
  scheduleSecondaryButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: '#BCE6CD',
  },
  scheduleSecondaryText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  searchBox: {
    minHeight: 46,
    marginTop: 2,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: C.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  searchIcon: { color: '#65706A', fontSize: 26, width: 24, textAlign: 'center' },
  searchInput: { flex: 1, paddingVertical: 8, color: C.text, fontFamily: F.regular, fontSize: 12 },
  searchAction: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: C.softSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: { gap: 7, paddingVertical: 2 },
  chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 99, backgroundColor: '#E7EEE8' },
  chipSelected: { backgroundColor: C.forest },
  chipText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 16 },
  chipTextSelected: { color: C.surface, fontFamily: F.semiBold },
  shortcuts: { flexDirection: 'row', gap: 8, marginTop: 2 },
  shortcut: {
    flex: 1,
    minHeight: 76,
    borderRadius: 14,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  shortcutIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  shortcutGlyph: { color: C.forest, fontSize: 18 },
  shortcutLabel: { color: C.text, fontFamily: F.regular, fontSize: 10, textAlign: 'center' },
  sectionTitleRow: {
    marginTop: 8,
    marginBottom: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14, lineHeight: 20 },
  sectionTrailing: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11 },
  sectionTrailingLink: { color: C.primary, fontFamily: F.semiBold, fontSize: 11 },
  horizontalCards: { gap: 10, paddingRight: 4 },
  gardenCard: { width: 208, padding: 8, borderRadius: 14, backgroundColor: C.surface },
  gardenCardThumb: {
    height: 82,
    borderRadius: 10,
    backgroundColor: '#DDEFE3',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  gardenCardImage: { width: '100%', height: '100%' },
  gardenCardGlyph: { color: '#49815E', fontSize: 32 },
  emptyHomeCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: C.surface,
    alignItems: 'center',
    gap: 8,
  },
  emptyHomeArt: {
    width: 54,
    height: 54,
    borderRadius: 27,
    overflow: 'hidden',
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: '#E3F2E8',
    color: C.forest,
    fontSize: 30,
  },
  emptyHomeTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14, textAlign: 'center' },
  emptyHomeButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionCard: {
    padding: 12,
    borderRadius: 13,
    backgroundColor: C.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  newUserTip: { padding: 12, borderRadius: 13, backgroundColor: '#E3F2E8', gap: 4 },
  gardenName: { marginTop: 7, color: C.forest, fontFamily: F.semiBold, fontSize: 12, lineHeight: 17 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 7, backgroundColor: '#D8E2DA' },
  gardenStatus: { color: C.primary, fontFamily: F.semiBold, fontSize: 11, lineHeight: 16 },
  addGarden: {
    width: 104,
    minHeight: 158,
    borderRadius: 14,
    backgroundColor: C.softSurface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addPlus: { color: C.forest, fontSize: 28 },
  caption: { color: C.mutedText, fontFamily: F.regular, fontSize: 10, lineHeight: 14 },
  plantEmoji: { fontSize: 23 },
  bottomNav: {
    minHeight: 62,
    paddingHorizontal: 5,
    paddingTop: 6,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DCE6DF',
    backgroundColor: C.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  navIcon: { color: '#58635D', fontSize: 18, lineHeight: 22 },
  navLabel: { color: '#58635D', fontFamily: F.regular, fontSize: 9, lineHeight: 13 },
  navSelected: { color: C.forest, fontFamily: F.semiBold },
});
