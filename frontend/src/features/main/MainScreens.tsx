import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { GardensTabContent } from '@/features/gardens/GardenScreens';
import { useGardensList } from '@/features/gardens/gardenHooks';
import { getHealthStatusMeta, type GardenSummaryDto, type HealthStatus } from '@/features/gardens/gardenTypes';
import { useDeletePlantMutation, useUserPlantsList } from '@/features/plants/plantHooks';
import {
  HEALTH_STATUS_OPTIONS,
  PLANT_SORT_OPTIONS,
  type UserPlantSummaryDto,
} from '@/features/plants/plantTypes';
import { FavoritesSection } from '@/features/species/FavoritesSection';
import { useFavoriteSpecies } from '@/features/species/speciesHooks';
import { AppApiError } from '@/services/api/apiError';
import type { PageResponse } from '@/services/api/apiTypes';
import { getSessionGeneration } from '@/services/api/tokenStorage';

type PageKind = 'gardens' | 'plants' | 'journal' | 'schedule' | 'monitoring';

const tabs = [
  { label: 'Trang chủ', icon: '⌂', route: '/home' },
  { label: 'Vườn của tôi', icon: '▦', route: '/gardens' },
  { label: 'Cây trồng', icon: '♧', route: '/plants' },
  { label: 'Nhật ký', icon: '▤', route: '/journal' },
  { label: 'Theo dõi', icon: '☼', route: '/monitoring' },
];

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={s.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Quay lại"
        onPress={() => router.back()}
        style={s.back}
      >
        <Text style={s.backText}>‹</Text>
      </Pressable>
      <View style={s.headerCopy}>
        <Text style={s.brand}>GoPlant</Text>
        <Text style={s.headerTitle}>{title}</Text>
      </View>
      <Pressable
        onPress={() => Alert.alert('Bản xem trước', 'Thông báo sẽ được triển khai ở đợt tiếp theo.')}
        style={s.avatar}
      >
        <Text style={s.avatarText}>G</Text>
      </Pressable>
      <Text style={s.headerSubtitle}>{subtitle}</Text>
    </View>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeading}>
        <Text style={s.sectionTitle}>{title}</Text>
        {hint ? <Text style={s.hint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function BottomNav({ current }: { current: string }) {
  return (
    <View style={s.bottomNav}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.route}
          accessibilityRole="tab"
          accessibilityState={{ selected: current === tab.route }}
          onPress={() => router.replace(tab.route as never)}
          style={s.navItem}
        >
          <Text style={[s.navIcon, current === tab.route && s.active]}>{tab.icon}</Text>
          <Text style={[s.navLabel, current === tab.route && s.active]}>{tab.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Tag({ children, tone = 'mint' }: { children: ReactNode; tone?: 'mint' | 'peach' | 'plain' }) {
  return (
    <Text style={[s.tag, tone === 'peach' ? s.tagPeach : tone === 'plain' ? s.tagPlain : s.tagMint]}>
      {children}
    </Text>
  );
}

function Action({
  label,
  muted = false,
  danger = false,
  disabled = false,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  muted?: boolean;
  danger?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={
        onPress ??
        (() => Alert.alert('Bản xem trước', `${label} sẽ được triển khai theo thiết kế.`))
      }
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={[
        s.action,
        muted && s.actionMuted,
        danger && s.actionDanger,
        disabled && s.actionDisabled,
      ]}
    >
      <Text
        style={[
          s.actionText,
          muted && s.actionMutedText,
          danger && s.actionDangerText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function EmptyCard({
  icon,
  title,
  description,
  action,
  onPress,
}: {
  icon: string;
  title: string;
  description: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={s.emptyCard}>
      <View style={s.emptyIcon}>
        <Text style={s.emptyGlyph}>{icon}</Text>
      </View>
      <Text style={s.cardTitle}>{title}</Text>
      <Text style={s.emptyDescription}>{description}</Text>
      {action && onPress ? <Action label={action} onPress={onPress} /> : null}
    </View>
  );
}

const PLANTS_PAGE_SIZE = 20;

interface PlantsBodyProps {
  plantQuery: string;
  onChangePlantQuery: (value: string) => void;
  onSubmitSearch: () => void;
  onClearSearch: () => void;
  selectedGardenId: string;
  onSelectGarden: (gardenId: string) => void;
  selectedHealthStatus: HealthStatus | '';
  onSelectHealthStatus: (status: HealthStatus | '') => void;
  sort: string;
  onSelectSort: (sort: string) => void;
  page: number;
  onChangePage: (page: number) => void;
  onResetFilters: () => void;
  onRefreshAll: () => void;
  gardens: GardenSummaryDto[];
  plantsData: PageResponse<UserPlantSummaryDto> | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isPlaceholderData: boolean;
  isError: boolean;
  errorMessage: string | undefined;
  onRetry: () => void;
  hasActiveFilters: boolean;
}

function PlantsManagementBody({
  plantQuery,
  onChangePlantQuery,
  onSubmitSearch,
  onClearSearch,
  selectedGardenId,
  onSelectGarden,
  selectedHealthStatus,
  onSelectHealthStatus,
  sort,
  onSelectSort,
  page,
  onChangePage,
  onResetFilters,
  onRefreshAll,
  gardens,
  plantsData,
  isLoading,
  isFetching,
  isPlaceholderData,
  isError,
  errorMessage,
  onRetry,
  hasActiveFilters,
}: PlantsBodyProps) {
  const { user } = useAuth();
  const currentUserId = typeof user?.id === 'string' ? user.id.trim() : '';
  const currentUserIdRef = useRef(currentUserId);
  const prevUserIdRef = useRef(currentUserId);

  const deletePlantMutation = useDeletePlantMutation();
  const [deletingPlantId, setDeletingPlantId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = currentUserId;
    currentUserIdRef.current = currentUserId;
    if (prevUserId && prevUserId !== currentUserId) {
      setDeletingPlantId(null);
      setDeleteError(null);
    }
  }, [currentUserId]);

  const visiblePlants = plantsData?.content ?? [];
  const totalElements = plantsData?.totalElements ?? 0;
  const totalPages = plantsData?.totalPages ?? 0;
  const displayTotalPages = isPlaceholderData
    ? Math.max(1, totalPages, page + 1)
    : Math.max(1, totalPages);

  const handleRequestDeletePlant = (plant: UserPlantSummaryDto) => {
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
            setDeletingPlantId(plant.id);
            void deletePlantMutation
              .mutateAsync(plant.id)
              .catch((err) => {
                if (hasSwitchedSession()) {
                  return;
                }
                if (err instanceof AppApiError) {
                  if (err.code === 'SESSION_USER_MISMATCH') {
                    return;
                  }
                  setDeleteError(err.message);
                  return;
                }
                setDeleteError('Không thể xóa cây trồng. Vui lòng thử lại.');
              })
              .finally(() => {
                if (!hasSwitchedSession()) {
                  setDeletingPlantId(null);
                }
              });
          },
        },
      ]
    );
  };

  return (
    <>
      <View style={s.search}>
        <Text style={s.searchGlyph}>⌕</Text>
        <TextInput
          value={plantQuery}
          onChangeText={onChangePlantQuery}
          onSubmitEditing={onSubmitSearch}
          placeholder="Tìm theo tên cây hoặc tên loài..."
          placeholderTextColor={C.mutedText}
          style={s.searchInput}
          returnKeyType="search"
          accessibilityLabel="Tìm kiếm cây đang sở hữu"
        />
        {plantQuery ? (
          <Pressable
            onPress={onClearSearch}
            accessibilityRole="button"
            accessibilityLabel="Xóa từ khóa tìm cây"
          >
            <Text style={s.clearGlyph}>×</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={s.managementActions}>
        <Action label="＋  Thêm cây" onPress={() => router.push('/garden/add-plant' as never)} />
        <Action
          label="Khám phá loài cây"
          muted
          onPress={() => router.push('/search' as never)}
        />
        <Pressable
          disabled={isFetching}
          onPress={onRefreshAll}
          accessibilityRole="button"
          accessibilityLabel="Làm mới danh sách cây"
          accessibilityState={{ disabled: isFetching }}
          style={[s.refreshBtn, isFetching && s.actionDisabled]}
        >
          <Text style={s.refreshBtnText}>{isFetching ? 'Đang tải...' : 'Làm mới'}</Text>
        </Pressable>
      </View>

      <View style={s.filterGroup}>
        <Text style={s.filterLabel}>Lọc theo khu vườn</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>
          <Pressable
            onPress={() => onSelectGarden('')}
            accessibilityRole="button"
            accessibilityState={{ selected: !selectedGardenId }}
            style={[s.filterPill, !selectedGardenId && s.filterPillActive]}
          >
            <Text style={[s.filterPillText, !selectedGardenId && s.filterPillTextActive]}>
              Tất cả vườn
            </Text>
          </Pressable>
          {gardens.map((garden) => {
            const active = selectedGardenId === garden.id;
            return (
              <Pressable
                key={garden.id}
                onPress={() => onSelectGarden(garden.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[s.filterPill, active && s.filterPillActive]}
              >
                <Text style={[s.filterPillText, active && s.filterPillTextActive]}>
                  {garden.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={s.filterGroup}>
        <Text style={s.filterLabel}>Tình trạng sức khỏe</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>
          <Pressable
            onPress={() => onSelectHealthStatus('')}
            accessibilityRole="button"
            accessibilityState={{ selected: !selectedHealthStatus }}
            style={[s.filterPill, !selectedHealthStatus && s.filterPillActive]}
          >
            <Text style={[s.filterPillText, !selectedHealthStatus && s.filterPillTextActive]}>
              Tất cả trạng thái
            </Text>
          </Pressable>
          {HEALTH_STATUS_OPTIONS.map((opt) => {
            const active = selectedHealthStatus === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => onSelectHealthStatus(opt.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[s.filterPill, active && s.filterPillActive]}
              >
                <Text style={[s.filterPillText, active && s.filterPillTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={s.filterGroup}>
        <Text style={s.filterLabel}>Sắp xếp</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>
          {PLANT_SORT_OPTIONS.map((opt) => {
            const active = sort === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => onSelectSort(opt.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[s.filterPill, active && s.filterPillActive]}
              >
                <Text style={[s.filterPillText, active && s.filterPillTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FavoritesSection />

      <Section
        title="Cây đang sở hữu"
        hint={isLoading ? 'Đang tải...' : `${totalElements} cây`}
      >
        {deleteError ? (
          <View style={s.errorBanner} accessibilityRole="alert">
            <Text style={s.errorBannerText}>{deleteError}</Text>
            <Pressable onPress={() => setDeleteError(null)} accessibilityRole="button">
              <Text style={s.dismissText}>Đóng</Text>
            </Pressable>
          </View>
        ) : null}

        {isLoading ? (
          <View style={s.emptyCard}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={s.emptyDescription}>Đang tải danh sách cây trồng từ máy chủ...</Text>
          </View>
        ) : isError ? (
          <View style={s.emptyCard} accessibilityRole="alert">
            <Text style={s.cardTitle}>Không thể tải danh sách cây trồng</Text>
            <Text style={s.emptyDescription}>
              {errorMessage || 'Đã có lỗi xảy ra khi kết nối máy chủ.'}
            </Text>
            <Action label="Thử lại" onPress={onRetry} />
          </View>
        ) : visiblePlants.length === 0 ? (
          <EmptyCard
            icon="♧"
            title={hasActiveFilters ? 'Không tìm thấy cây phù hợp' : 'Bạn chưa có cây trồng nào'}
            description={
              hasActiveFilters
                ? 'Thử tên cây khác hoặc xóa bộ lọc khu vườn / tình trạng để xem lại.'
                : 'Chọn một khu vườn và loài cây từ thư viện để bắt đầu quản lý cây của bạn.'
            }
            action={hasActiveFilters ? 'Xóa bộ lọc' : '＋  Thêm cây mới'}
            onPress={
              hasActiveFilters
                ? onResetFilters
                : () => router.push('/garden/add-plant' as never)
            }
          />
        ) : (
          <>
            {visiblePlants.map((plant) => {
              const health = getHealthStatusMeta(plant.healthStatus);
              const isDeletingThis = deletePlantMutation.isPending && deletingPlantId === plant.id;
              return (
                <View key={plant.id} style={s.plantCard}>
                  <View style={s.rowTop}>
                    {plant.imageUrl ? (
                      <Image
                        source={{ uri: plant.imageUrl }}
                        style={s.plantThumbImage}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={s.plantImage}>
                        <Text style={s.plantEmoji}>♧</Text>
                      </View>
                    )}
                    <View style={s.cardCopy}>
                      <Text style={s.cardTitle}>{plant.displayName}</Text>
                      {plant.scientificName ? (
                        <Text style={s.latin}>{plant.scientificName}</Text>
                      ) : null}
                      <Text style={s.body}>
                        {plant.speciesName || 'Chưa gắn loài'}
                        {plant.category ? ` • ${plant.category}` : ''}
                      </Text>
                      <Text style={s.body}>
                        {plant.gardenName ? `⌂ ${plant.gardenName}` : 'Chưa gắn khu vườn'} •{' '}
                        {health.label}
                      </Text>
                    </View>
                  </View>
                  <View style={s.row}>
                    <Action
                      label="Chi tiết"
                      muted
                      accessibilityLabel={`Xem chi tiết ${plant.displayName}`}
                      onPress={() =>
                        router.push({
                          pathname: '/plant-detail',
                          params: { plantId: plant.id },
                        } as never)
                      }
                    />
                    <Action
                      label="Chỉnh sửa"
                      muted
                      disabled={deletePlantMutation.isPending}
                      accessibilityLabel={`Chỉnh sửa ${plant.displayName}`}
                      onPress={() =>
                        router.push({
                          pathname: '/garden/add-plant',
                          params: { editPlantId: plant.id },
                        } as never)
                      }
                    />
                    <Action
                      label={isDeletingThis ? 'Đang xóa...' : 'Xóa'}
                      muted
                      danger
                      disabled={deletePlantMutation.isPending}
                      accessibilityLabel={`Xóa ${plant.displayName}`}
                      onPress={() => handleRequestDeletePlant(plant)}
                    />
                  </View>
                </View>
              );
            })}

            {totalPages > 1 || page > 0 ? (
              <View style={s.paginationRow}>
                <Pressable
                  disabled={page <= 0 || isFetching}
                  onPress={() => onChangePage(Math.max(0, page - 1))}
                  style={[s.pageButton, (page <= 0 || isFetching) && s.actionDisabled]}
                  accessibilityRole="button"
                >
                  <Text style={s.pageButtonText}>Trang trước</Text>
                </Pressable>
                <Text style={s.body}>
                  Trang {page + 1} / {displayTotalPages}
                </Text>
                <Pressable
                  disabled={Boolean(plantsData?.last) || isFetching}
                  onPress={() => onChangePage(page + 1)}
                  style={[
                    s.pageButton,
                    (Boolean(plantsData?.last) || isFetching) && s.actionDisabled,
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={s.pageButtonText}>Trang sau</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        )}
      </Section>

      <Text style={s.mockNote}>
        Mục “Loài cây yêu thích” và “Cây đang sở hữu” được đồng bộ trực tiếp với REST API máy chủ.
      </Text>
    </>
  );
}

function PageBody({ kind }: { kind: PageKind }) {
  if (kind === 'gardens') {
    return <GardensTabContent />;
  }
  if (kind === 'plants') {
    return null;
  }
  if (kind === 'journal') {
    return (
      <>
        <View style={s.metrics}>
          {[
            ['0', 'Ghi nhận'],
            ['0', 'Cây có nhật ký'],
            ['0', 'Khu vườn'],
            ['—', 'Cập nhật gần nhất'],
          ].map(([value, label]) => (
            <View key={label} style={s.metric}>
              <Text style={s.metricValue}>{value}</Text>
              <Text style={s.body}>{label}</Text>
            </View>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>
          {['Tất cả vườn', 'Nhật ký từng cây'].map((x, i) => (
            <Tag key={x} tone={i === 0 ? 'mint' : 'plain'}>
              {x}
            </Tag>
          ))}
        </ScrollView>
        <Section title="Nhật ký khu vườn">
          <EmptyCard
            icon="▤"
            title="Chưa có nhật ký khu vườn"
            description="Ghi lại hoạt động, thay đổi và hình ảnh trong khu vườn."
            action="＋  Thêm nhật ký khu vườn"
            onPress={() => router.push('/journal/new' as never)}
          />
        </Section>
        <Section title="Nhật ký từng cây">
          <EmptyCard
            icon="♧"
            title="Chưa có nhật ký cây trồng"
            description="Theo dõi từng giai đoạn phát triển và chăm sóc của cây."
            action="＋  Thêm nhật ký cây"
            onPress={() => router.push('/journal/new' as never)}
          />
        </Section>
        <View style={s.recommend}>
          <Text style={s.cardTitle}>Mẹo ghi nhật ký</Text>
          <Text style={s.body}>
            Ghi lại việc chăm sóc thường xuyên để dễ theo dõi thay đổi theo thời gian.
          </Text>
        </View>
      </>
    );
  }
  if (kind === 'monitoring') {
    return (
      <>
        <View style={s.metrics}>
          {[
            ['0', 'Cây đang theo dõi'],
            ['—', 'Tỉ lệ khỏe mạnh'],
            ['0', 'Cần xử lý'],
            ['—', 'Chỉ số sinh thái'],
          ].map(([value, label]) => (
            <View key={label} style={s.metric}>
              <Text style={s.metricValue}>{value}</Text>
              <Text style={s.body}>{label}</Text>
            </View>
          ))}
        </View>
        <View style={s.eco}>
          <Text style={s.ecoScore}>—</Text>
          <View style={s.cardCopy}>
            <Text style={s.cardTitle}>Chưa có dữ liệu đánh giá</Text>
            <Text style={s.body}>Thêm vườn và cây để bắt đầu theo dõi.</Text>
          </View>
        </View>
        <Section title="Khu vườn">
          <EmptyCard
            icon="⌂"
            title="Chưa có khu vườn để theo dõi"
            description="Tạo khu vườn đầu tiên để ghi nhận tình trạng không gian trồng."
            action="Tạo khu vườn"
            onPress={() => router.push('/garden/create' as never)}
          />
        </Section>
        <Section title="Cây trồng theo dõi">
          <EmptyCard
            icon="♧"
            title="Chưa có cây được theo dõi"
            description="Thêm cây để ghi nhận sức khỏe và tiến triển chăm sóc."
            action="Thêm cây"
            onPress={() => router.push('/garden/add-plant' as never)}
          />
        </Section>
        <Section title="Lịch sử ghi nhận">
          <EmptyCard
            icon="▤"
            title="Chưa có ghi nhận"
            description="Nhật ký và kết quả theo dõi sẽ xuất hiện tại đây."
            action="Thêm ghi nhận"
            onPress={() => router.push('/journal/new' as never)}
          />
        </Section>
      </>
    );
  }
  return (
    <>
      <View style={s.scheduleBanner}>
        <Text style={s.bannerIcon}>◷</Text>
        <View style={s.cardCopy}>
          <Text style={s.cardTitle}>Lịch chăm sóc của bạn</Text>
          <Text style={s.body}>Theo dõi các công việc chăm cây sắp tới.</Text>
        </View>
      </View>
      <View style={s.metrics}>
        <View style={s.metric}>
          <Text style={s.metricValue}>0%</Text>
          <Text style={s.body}>Tiến độ hoàn thành</Text>
        </View>
        <View style={s.metric}>
          <Text style={s.metricValue}>0</Text>
          <Text style={s.body}>Lịch đang hoạt động</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>
        {['Tất cả', 'Hôm nay', 'Tuần này'].map((x, i) => (
          <Tag key={x} tone={i === 0 ? 'mint' : 'plain'}>
            {x}
          </Tag>
        ))}
      </ScrollView>
      <Section title="Cây chưa có lịch" hint="0 cây">
        <EmptyCard
          icon="◷"
          title="Chưa có lịch chăm sóc"
          description="Tạo lịch để lên kế hoạch tưới nước, bón phân và chăm sóc cây."
          action="＋  Tạo lịch đầu tiên"
          onPress={() => router.push('/schedule/create' as never)}
        />
      </Section>
      <Section title="Thiết lập lịch thủ công">
        <View style={s.card}>
          <Text style={s.cardTitle}>Tạo chu kỳ chăm sóc</Text>
          <Text style={s.body}>Chọn cây, công việc và thời gian phù hợp.</Text>
          <Action label="Thiết lập lịch" onPress={() => router.push('/schedule/create' as never)} />
        </View>
      </Section>
    </>
  );
}

function PageContent({ kind }: { kind: PageKind }) {
  const { user } = useAuth();
  const currentUserId = typeof user?.id === 'string' ? user.id.trim() : '';
  const prevUserIdRef = useRef(currentUserId);

  const [plantQuery, setPlantQuery] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [selectedGardenId, setSelectedGardenId] = useState('');
  const [selectedHealthStatus, setSelectedHealthStatus] = useState<HealthStatus | ''>('');
  const [sort, setSort] = useState('createdAt,desc');
  const [page, setPage] = useState(0);

  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = currentUserId;
    if (prevUserId && prevUserId !== currentUserId) {
      setPlantQuery('');
      setDebouncedKeyword('');
      setSelectedGardenId('');
      setSelectedHealthStatus('');
      setSort('createdAt,desc');
      setPage(0);
    }
  }, [currentUserId]);

  useEffect(() => {
    const trimmed = plantQuery.trim();
    if (trimmed === debouncedKeyword) {
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedKeyword(trimmed);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [plantQuery, debouncedKeyword]);

  const isPlantsTab = kind === 'plants';
  const gardensQuery = useGardensList({ enabled: kind === 'gardens' || isPlantsTab });
  const favoritesQuery = useFavoriteSpecies({ page: 0, size: 20 }, { enabled: isPlantsTab });
  const plantsQuery = useUserPlantsList(
    {
      keyword: debouncedKeyword || undefined,
      gardenId: selectedGardenId || undefined,
      healthStatus: selectedHealthStatus || undefined,
      page,
      size: PLANTS_PAGE_SIZE,
      sort,
    },
    { enabled: isPlantsTab }
  );

  const plantsData = plantsQuery.data;
  const isPlantsFetching = plantsQuery.isFetching;
  const isPlantsPlaceholder = plantsQuery.isPlaceholderData;
  const isPlantsError = plantsQuery.isError;

  useEffect(() => {
    if (!isPlantsTab) {
      return;
    }
    if (isPlantsFetching || isPlantsPlaceholder || isPlantsError || !plantsData) {
      return;
    }
    const rawTotalPages = plantsData.totalPages;
    if (typeof rawTotalPages !== 'number' || !Number.isFinite(rawTotalPages)) {
      return;
    }
    const totalPages = Math.max(0, Math.trunc(rawTotalPages));
    if (page < 0 || page >= totalPages) {
      const nextPage = page < 0 || totalPages === 0 ? 0 : totalPages - 1;
      if (nextPage !== page) {
        setPage(nextPage);
      }
    }
  }, [isPlantsTab, page, plantsData, isPlantsFetching, isPlantsPlaceholder, isPlantsError]);

  const gardens = gardensQuery.data ?? [];
  const gardensCount = gardens.length;
  const favCount = favoritesQuery.data?.totalElements ?? 0;
  const plantsTotal = plantsQuery.data?.totalElements ?? 0;
  const hasActiveFilters = Boolean(
    debouncedKeyword || selectedGardenId || selectedHealthStatus
  );

  const config: Record<PageKind, { title: string; subtitle: string; intro: string }> = {
    gardens: {
      title: 'Khu Vườn',
      subtitle: 'Vườn của tôi',
      intro: gardensQuery.isLoading
        ? 'Đang tải danh sách khu vườn...'
        : gardensCount > 0
          ? `Đang quản lý ${gardensCount} khu vườn`
          : 'Bắt đầu tạo khu vườn đầu tiên của bạn',
    },
    plants: {
      title: 'Cây Trồng',
      subtitle: 'Quản lý cây trồng',
      intro: plantsQuery.isLoading
        ? `${favCount} loài yêu thích • Đang tải cây sở hữu... • ${gardensCount} khu vườn`
        : `${favCount} loài yêu thích • ${plantsTotal} cây sở hữu • ${gardensCount} khu vườn`,
    },
    journal: { title: 'Nhật ký', subtitle: 'Nhật ký phát triển', intro: 'Chưa có ghi nhận nào' },
    schedule: { title: 'Lịch Chăm Sóc', subtitle: 'Lập lịch chăm sóc', intro: 'Chưa có lịch chăm sóc nào' },
    monitoring: {
      title: 'Theo dõi & Ghi nhận',
      subtitle: 'Tổng quan sức khỏe vườn',
      intro: 'Chưa có cây hoặc khu vườn để theo dõi',
    },
  };

  const { title, subtitle, intro } = config[kind];
  const route = `/${kind}`;

  const renderBody = () => {
    if (kind === 'plants') {
      return (
        <PlantsManagementBody
          plantQuery={plantQuery}
          onChangePlantQuery={setPlantQuery}
          onSubmitSearch={() => {
            setDebouncedKeyword(plantQuery.trim());
            setPage(0);
          }}
          onClearSearch={() => {
            setPlantQuery('');
            setDebouncedKeyword('');
            setPage(0);
          }}
          selectedGardenId={selectedGardenId}
          onSelectGarden={(nextGardenId) => {
            setSelectedGardenId(nextGardenId);
            setPage(0);
          }}
          selectedHealthStatus={selectedHealthStatus}
          onSelectHealthStatus={(nextStatus) => {
            setSelectedHealthStatus(nextStatus);
            setPage(0);
          }}
          sort={sort}
          onSelectSort={(nextSort) => {
            setSort(nextSort);
            setPage(0);
          }}
          page={page}
          onChangePage={setPage}
          onResetFilters={() => {
            setPlantQuery('');
            setDebouncedKeyword('');
            setSelectedGardenId('');
            setSelectedHealthStatus('');
            setSort('createdAt,desc');
            setPage(0);
          }}
          onRefreshAll={() => {
            void Promise.all([
              plantsQuery.refetch(),
              gardensQuery.refetch(),
              favoritesQuery.refetch(),
            ]);
          }}
          gardens={gardens}
          plantsData={plantsQuery.data}
          isLoading={plantsQuery.isLoading}
          isFetching={plantsQuery.isFetching}
          isPlaceholderData={plantsQuery.isPlaceholderData}
          isError={plantsQuery.isError}
          errorMessage={plantsQuery.error?.message}
          onRetry={() => {
            void plantsQuery.refetch();
          }}
          hasActiveFilters={hasActiveFilters}
        />
      );
    }
    return <PageBody kind={kind} />;
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <PageHeader title={title} subtitle={subtitle} />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.introRow}>
          <View style={s.cardCopy}>
            <Text style={s.pageTitle}>{subtitle}</Text>
            <Text style={s.body}>{intro}</Text>
          </View>
        </View>
        {renderBody()}
      </ScrollView>
      <BottomNav current={route} />
    </SafeAreaView>
  );
}

export function GardensScreen() {
  return <PageContent kind="gardens" />;
}
export function PlantsScreen() {
  return <PageContent kind="plants" />;
}
export function JournalScreen() {
  return <PageContent kind="journal" />;
}
export function ScheduleScreen() {
  return <PageContent kind="schedule" />;
}
export function MonitoringScreen() {
  return <PageContent kind="monitoring" />;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: {
    minHeight: 58,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DDE8E0',
  },
  back: { width: 28, height: 38, justifyContent: 'center' },
  backText: { color: C.forest, fontSize: 30, lineHeight: 34 },
  headerCopy: { flex: 1 },
  brand: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11 },
  headerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: C.forest, fontFamily: F.bold },
  headerSubtitle: {
    position: 'absolute',
    left: 50,
    top: 58,
    color: C.secondaryText,
    fontFamily: F.regular,
    fontSize: 11,
  },
  content: { paddingHorizontal: 14, paddingTop: 18, paddingBottom: 20, gap: 9 },
  introRow: { minHeight: 54, marginBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pageTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 18, lineHeight: 24 },
  section: { gap: 8, marginTop: 5 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 15, lineHeight: 21 },
  hint: { color: C.mutedText, fontFamily: F.regular, fontSize: 11 },
  card: { padding: 10, borderRadius: 14, backgroundColor: C.surface, gap: 7 },
  body: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  cardCopy: { flex: 1, gap: 2 },
  cardTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 13, lineHeight: 19 },
  tag: {
    overflow: 'hidden',
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 99,
    fontFamily: F.semiBold,
    fontSize: 10,
    lineHeight: 14,
  },
  tagMint: { color: C.forest, backgroundColor: '#D5F2E1' },
  tagPeach: { color: '#914218', backgroundColor: '#FFE0CF' },
  tagPlain: { color: C.secondaryText, backgroundColor: '#E7EEE8' },
  action: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: C.surface, fontFamily: F.semiBold, fontSize: 11 },
  actionMuted: { flex: 1, backgroundColor: C.softSurface },
  actionMutedText: { color: C.secondaryText },
  actionDanger: { backgroundColor: '#FDECEC', borderWidth: 1, borderColor: '#F5C2C0' },
  actionDangerText: { color: '#991B1B' },
  actionDisabled: { opacity: 0.5 },
  clearGlyph: { color: C.secondaryText, fontSize: 20, paddingHorizontal: 4 },
  refreshBtn: {
    minHeight: 34,
    paddingHorizontal: 11,
    borderRadius: 9,
    backgroundColor: '#E7EEE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBtnText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  filterGroup: { gap: 4 },
  filterLabel: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 10 },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: '#DDE8E0',
  },
  filterPillActive: { backgroundColor: C.forest, borderColor: C.forest },
  filterPillText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 10 },
  filterPillTextActive: { color: C.surface, fontFamily: F.semiBold },
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
  pills: { flexDirection: 'row', gap: 7, paddingVertical: 3 },
  recommend: { padding: 13, borderRadius: 13, backgroundColor: '#D9F2E3', gap: 6 },
  search: {
    minHeight: 44,
    paddingHorizontal: 9,
    borderRadius: 11,
    backgroundColor: C.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  searchGlyph: { width: 23, textAlign: 'center', color: C.secondaryText, fontSize: 24 },
  searchInput: { flex: 1, paddingVertical: 7, color: C.text, fontFamily: F.regular, fontSize: 12 },
  plantCard: { padding: 9, borderRadius: 14, backgroundColor: C.surface, gap: 7 },
  plantThumbImage: { width: 54, height: 54, borderRadius: 10, backgroundColor: '#E4F0E7' },
  plantImage: {
    width: 54,
    height: 54,
    borderRadius: 10,
    backgroundColor: '#E4F0E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plantEmoji: { fontSize: 25 },
  latin: { color: C.mutedText, fontFamily: F.regular, fontSize: 10, fontStyle: 'italic' },
  paginationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  pageButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, backgroundColor: C.softSurface },
  pageButtonText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  metric: { width: '48%', minHeight: 54, padding: 9, borderRadius: 12, backgroundColor: C.surface },
  metricValue: { color: C.forest, fontFamily: F.bold, fontSize: 15 },
  eco: {
    marginVertical: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: C.softSurface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ecoScore: { color: C.forest, fontFamily: F.bold, fontSize: 23 },
  scheduleBanner: {
    padding: 12,
    borderRadius: 13,
    backgroundColor: C.softSurface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  bannerIcon: { color: C.forest, fontSize: 22 },
  mockNote: { marginTop: 8, color: C.mutedText, fontFamily: F.regular, fontSize: 10, textAlign: 'center' },
  emptyCard: { padding: 16, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', gap: 9 },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#E2F1E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyGlyph: { color: C.forest, fontSize: 30, lineHeight: 36 },
  emptyDescription: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  managementActions: { flexDirection: 'row', gap: 8 },
  bottomNav: {
    minHeight: 60,
    paddingHorizontal: 3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DDE8E0',
    backgroundColor: C.surface,
    flexDirection: 'row',
    alignItems: 'center',
  },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  navIcon: { color: C.secondaryText, fontSize: 18, lineHeight: 22 },
  navLabel: { color: C.secondaryText, fontFamily: F.regular, fontSize: 9 },
  active: { color: C.forest, fontFamily: F.semiBold },
});
