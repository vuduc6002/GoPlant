import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { GardensTabContent } from '@/features/gardens/GardenScreens';
import { useGardensList } from '@/features/gardens/gardenHooks';
import { usePlantData } from '@/features/plants/PlantDataStore';
import { FavoritesSection } from '@/features/species/FavoritesSection';
import { useFavoriteSpecies } from '@/features/species/speciesHooks';

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
  onPress,
}: {
  label: string;
  muted?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress ?? (() => Alert.alert('Bản xem trước', `${label} sẽ được triển khai theo thiết kế.`))}
      style={[s.action, muted && s.actionMuted]}
    >
      <Text style={[s.actionText, muted && s.actionMutedText]}>{label}</Text>
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

function PlantsManagementBody() {
  const { ownedPlants, removePlant } = usePlantData();
  const [plantQuery, setPlantQuery] = useState('');
  const normalized = plantQuery.trim().toLocaleLowerCase();
  const visiblePlants = ownedPlants.filter((plant) =>
    `${plant.name} ${plant.scientificName} ${plant.location}`.toLocaleLowerCase().includes(normalized)
  );

  return (
    <>
      <View style={s.search}>
        <Text style={s.searchGlyph}>⌕</Text>
        <TextInput
          value={plantQuery}
          onChangeText={setPlantQuery}
          placeholder="Tìm theo tên cây, loài hoặc vị trí..."
          placeholderTextColor={C.mutedText}
          style={s.searchInput}
        />
      </View>
      <View style={s.managementActions}>
        <Action label="＋  Thêm cây" onPress={() => router.push('/garden/add-plant' as never)} />
        <Action
          label="Khám phá loài cây"
          muted
          onPress={() => router.push('/search' as never)}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>
        {[
          `Cây demo sở hữu (${ownedPlants.length})`,
          'Thư viện loài cây (API)',
        ].map((x, i) => (
          <Pressable key={x} onPress={() => i === 1 && router.push('/search' as never)}>
            <Tag tone={i === 0 ? 'mint' : 'plain'}>{x}</Tag>
          </Pressable>
        ))}
      </ScrollView>

      <FavoritesSection />

      <Section title="Cây đang sở hữu (Demo G5.4)" hint={`${visiblePlants.length} cây`}>
        {visiblePlants.length === 0 ? (
          <EmptyCard
            icon="♧"
            title={plantQuery ? 'Không tìm thấy cây phù hợp' : 'Vườn của bạn chưa có cây (Demo G5.4)'}
            description={
              plantQuery
                ? 'Thử tên cây, tên khoa học hoặc vị trí khác.'
                : 'API quản lý cây sở hữu sẽ được tích hợp ở giai đoạn G5.4. Bạn vẫn có thể dùng bản demo cục bộ.'
            }
            action={plantQuery ? undefined : '＋  Thêm cây demo'}
            onPress={plantQuery ? undefined : () => router.push('/garden/add-plant' as never)}
          />
        ) : (
          visiblePlants.map((plant) => (
            <View key={plant.id} style={s.plantCard}>
              <View style={s.rowTop}>
                <View style={s.plantImage}>
                  <Text style={s.plantEmoji}>♧</Text>
                </View>
                <View style={s.cardCopy}>
                  <Text style={s.cardTitle}>{plant.name}</Text>
                  <Text style={s.latin}>{plant.scientificName}</Text>
                  <Text style={s.body}>
                    {plant.category} • {plant.location}
                  </Text>
                  <Text style={s.body}>
                    Ngày thêm: {plant.plantedAt || 'Chưa có dữ liệu'} • Tình trạng: Chưa đánh giá
                  </Text>
                </View>
              </View>
              <View style={s.row}>
                <Action
                  label="Chi tiết"
                  muted
                  onPress={() =>
                    router.push({ pathname: '/plant-detail', params: { ownedId: plant.id } } as never)
                  }
                />
                <Action
                  label="Chỉnh sửa"
                  muted
                  onPress={() =>
                    router.push({ pathname: '/garden/add-plant', params: { editId: plant.id } } as never)
                  }
                />
                <Action
                  label="Xóa"
                  muted
                  onPress={() =>
                    Alert.alert('Xóa cây', `Xóa hồ sơ “${plant.name}” khỏi danh sách demo?`, [
                      { text: 'Hủy', style: 'cancel' },
                      { text: 'Xóa', style: 'destructive', onPress: () => removePlant(plant.id) },
                    ])
                  }
                />
              </View>
            </View>
          ))
        )}
      </Section>

      <Text style={s.mockNote}>
        Mục “Loài cây yêu thích” đồng bộ trực tiếp với REST API máy chủ; mục “Cây đang sở hữu” là dữ liệu demo cục bộ chờ tích hợp G5.4.
      </Text>
    </>
  );
}

function PageBody({ kind }: { kind: PageKind }) {
  if (kind === 'gardens') {
    return <GardensTabContent />;
  }
  if (kind === 'plants') {
    return <PlantsManagementBody />;
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
  const { ownedPlants } = usePlantData();
  const gardensQuery = useGardensList({ enabled: kind === 'gardens' || kind === 'plants' });
  const favoritesQuery = useFavoriteSpecies({ page: 0, size: 20 }, { enabled: kind === 'plants' });

  const gardensCount = gardensQuery.data?.length ?? 0;
  const favCount = favoritesQuery.data?.totalElements ?? 0;

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
      intro: `${favCount} loài yêu thích • ${ownedPlants.length} cây demo • ${gardensCount} khu vườn`,
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
        <PageBody kind={kind} />
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
