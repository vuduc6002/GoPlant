import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { plantCatalog, usePlantData } from '@/features/plants/PlantDataStore';

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
      <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" onPress={() => router.back()} style={s.back}><Text style={s.backText}>‹</Text></Pressable>
      <View style={s.headerCopy}><Text style={s.brand}>GoPlant</Text><Text style={s.headerTitle}>{title}</Text></View>
      <Pressable onPress={() => Alert.alert('Bản xem trước', 'Thông báo sẽ được triển khai ở đợt tiếp theo.')} style={s.avatar}><Text style={s.avatarText}>G</Text></Pressable>
      <Text style={s.headerSubtitle}>{subtitle}</Text>
    </View>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return <View style={s.section}><View style={s.sectionHeading}><Text style={s.sectionTitle}>{title}</Text>{hint ? <Text style={s.hint}>{hint}</Text> : null}</View>{children}</View>;
}

function BottomNav({ current }: { current: string }) {
  return (
    <View style={s.bottomNav}>
      {tabs.map((tab) => <Pressable key={tab.route} accessibilityRole="tab" accessibilityState={{ selected: current === tab.route }} onPress={() => router.replace(tab.route as never)} style={s.navItem}>
        <Text style={[s.navIcon, current === tab.route && s.active]}>{tab.icon}</Text><Text style={[s.navLabel, current === tab.route && s.active]}>{tab.label}</Text>
      </Pressable>)}
    </View>
  );
}

function Tag({ children, tone = 'mint' }: { children: ReactNode; tone?: 'mint' | 'peach' | 'plain' }) {
  return <Text style={[s.tag, tone === 'peach' ? s.tagPeach : tone === 'plain' ? s.tagPlain : s.tagMint]}>{children}</Text>;
}

function Action({ label, muted = false, onPress }: { label: string; muted?: boolean; onPress?: () => void }) {
  return <Pressable onPress={onPress ?? (() => Alert.alert('Bản xem trước', `${label} sẽ được triển khai theo thiết kế.`))} style={[s.action, muted && s.actionMuted]}><Text style={[s.actionText, muted && s.actionMutedText]}>{label}</Text></Pressable>;
}

function GardenList() {
  const gardens = [
    { title: 'Ban Công Tầng 3 - Hướng Đông', place: 'Căn hộ 302, Tòa Thảo Mộc', count: '12 cây đang trồng', status: 'Độ ẩm 72% • Rất tốt', tone: 'mint' as const, art: 'BAN CÔNG' },
    { title: 'Khu Vườn Sân Thượng Nắng Gió', place: 'Tầng thượng • Hướng Tây Nam', count: '25 cây đang trồng', status: 'Cần tưới 3 cây hôm nay', tone: 'peach' as const, art: 'SÂN THƯỢNG' },
    { title: 'Khu Vườn Cây Văn Phòng & Phòng Khách', place: 'Không gian làm việc • Trong nhà', count: '8 cây đang trồng', status: 'Ánh sáng tán xạ', tone: 'mint' as const, art: 'TRONG NHÀ' },
  ];
  return <>{gardens.map((garden) => <View key={garden.title} style={s.card}>
    <View style={s.gardenArt}><Text style={s.artGlyph}>♧</Text><Text style={s.artLabel}>{garden.art}</Text></View>
    <View style={s.cardBody}><Text style={s.cardTitle}>{garden.title}</Text><Text style={s.body}>{garden.place}</Text><View style={s.row}><Text style={s.body}>{garden.count}</Text><Tag tone={garden.tone}>{garden.status}</Tag></View><Action label="Quản lý vườn →" onPress={() => router.push('/garden-detail' as never)} /></View>
  </View>)}</>;
}

function PlantsContent() {
  const plants = [
    ['Cà chua bi Cherry', 'Solanum lycopersicum var. cerasiforme', 'Ban công tầng 3 • Cần tưới nước • Đang ra trái', '🍅'],
    ['Hồng leo Huntington', "Rosa 'Huntington Rose'", 'Ban công tầng 3 • Đang nở hoa • Khỏe mạnh', '🌸'],
    ['Sung Mỹ Cẩm Thạch', "Ficus carica 'Panache Tiger'", 'Khu sân thượng • Phát triển tốt', '🪴'],
    ['Trầu bà lá xẻ (Monstera)', 'Monstera deliciosa Liebm.', 'Văn phòng / Phòng khách • Mới nhú búp lá', '🌿'],
  ];
  return <>
    <View style={s.search}><Text style={s.searchGlyph}>⌕</Text><TextInput placeholder="Tìm kiếm tên cây, loại cây hoặc vị trí..." placeholderTextColor={C.mutedText} style={s.searchInput} /></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>{['Tất cả (45)', 'Cây đang sở hữu (45)', 'Cây mong muốn (4)', 'Cần chăm sóc (5)'].map((item, i) => <Tag key={item} tone={i === 0 ? 'mint' : 'plain'}>{item}</Tag>)}</ScrollView>
    <Section title="Cây đang sở hữu" hint="45 cây">{plants.map(([name, latin, details, emoji]) => <View key={name} style={s.plantCard}>
      <View style={s.rowTop}><View style={s.plantImage}><Text style={s.plantEmoji}>{emoji}</Text></View><View style={s.cardCopy}><Text style={s.cardTitle}>{name}</Text><Text style={s.latin}>{latin}</Text><Text style={s.body}>{details}</Text></View></View>
      <View style={s.divider} /><View style={s.row}><Action label="Chi tiết" muted onPress={() => router.push({ pathname: '/plant-detail', params: { name } } as never)} /><Action label="Chỉnh sửa" muted /><Action label="Xóa cây" muted /></View>
    </View>)}</Section>
    <Section title="Cây trồng mong muốn" hint="Đã lưu (4)">{['Dâu Tây Nhật Bản Tochiotome', 'Chanh Cẩm Thạch Eureka', 'Sen đá Chuỗi Ngọc Biển'].map((name, i) => <View key={name} style={s.rowCard}><View style={s.plantImage}><Text style={s.plantEmoji}>{['🍓', '🍋', '🌱'][i]}</Text></View><View style={s.cardCopy}><Text style={s.cardTitle}>{name}</Text><Text style={s.body}>Cây mong muốn • Đã lưu trong danh sách</Text></View><Text style={s.heart}>♥</Text></View>)}</Section>
  </>;
}

function JournalContent() {
  const entries = [
    ['26/10/2025 • Ban công', 'Cà chua bi Cherry', 'Cây đang ra quả, lá xanh khỏe', 'Đã tưới nước và bổ sung dinh dưỡng', '🍅'],
    ['18/10/2025 • Sân thượng', 'Hương Thảo (Rosemary)', 'Phát hiện một số lá vàng nhẹ', 'Đã cắt tỉa lá hỏng và kiểm tra đất', '🌿'],
    ['05/10/2025 • Phòng khách', 'Trầu bà lá xẻ Monstera', 'Cây thích nghi tốt với vị trí mới', 'Theo dõi độ ẩm • Không phát hiện sâu bệnh', '🪴'],
  ];
  return <>
    <View style={s.metrics}>{[['12', 'Ghi nhận tháng này'], ['4', 'Cây có nhật ký'], ['3', 'Khu vườn'], ['Hôm nay', 'Cập nhật gần nhất']].map(([value, label]) => <View key={label} style={s.metric}><Text style={s.metricValue}>{value}</Text><Text style={s.body}>{label}</Text></View>)}</View>
    <Action label="＋ Thêm ghi nhận mới" onPress={() => router.push('/journal/new' as never)} />
    <View style={s.scheduleBanner}><Text style={s.bannerIcon}>▤</Text><View style={s.cardCopy}><Text style={s.cardTitle}>Nhật ký phát triển</Text><Text style={s.body}>Theo dõi hành trình chăm sóc cây theo thời gian.</Text></View></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>{['Tất cả', 'Tưới nước', 'Bón phân', 'Phát triển', 'Sâu bệnh'].map((item, i) => <Tag key={item} tone={i === 0 ? 'mint' : 'plain'}>{item}</Tag>)}</ScrollView>
    <Section title="Ghi nhận gần đây" hint="Xem tất cả (28)›">{entries.map(([date, plant, title, note, emoji]) => <View key={date} style={s.card}><Tag>{date}</Tag><Pressable onPress={() => router.push('/journal/detail' as never)} style={s.rowTop}><View style={s.plantImage}><Text style={s.plantEmoji}>{emoji}</Text></View><View style={s.cardCopy}><Text style={s.cardTitle}>{plant}</Text><Text style={s.body}>{title}</Text><Text style={s.body}>{note}</Text></View></Pressable><View style={s.row}><Action label="Chi tiết ghi nhận" muted onPress={() => router.push('/journal/detail' as never)} /><Action label="Chỉnh sửa" muted onPress={() => router.push('/journal/edit' as never)} /></View></View>)}</Section>
    <Text style={s.mockNote}>Các ghi nhận này là dữ liệu mẫu cục bộ.</Text>
  </>;
}

function ScheduleContent() {
  const tasks = [
    ['Cà chua bi Cherry', 'Tưới nước • Hôm nay, 08:00', 'Đến hạn', '🍅'],
    ['Hồng leo Huntington', 'Bón phân hữu cơ • Ngày mai', 'Ngày mai', '🌸'],
    ['Cây hương thảo', 'Kiểm tra độ ẩm đất • Thứ Sáu', 'Định kỳ', '🌿'],
    ['Sung Mỹ Cẩm Thạch', 'Cắt tỉa cành • Tuần tới', 'Định kỳ', '🪴'],
  ];
  return <>
    <View style={s.scheduleBanner}><Text style={s.bannerIcon}>◷</Text><View style={s.cardCopy}><Text style={s.cardTitle}>Lịch chăm sóc của bạn</Text><Text style={s.body}>Theo dõi các công việc chăm cây sắp tới.</Text></View><Tag>Tuần này</Tag></View>
    <Section title="Vườn & cây cần chăm sóc" hint="4 công việc"><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>{['Hôm nay', 'Tuần này', 'Tất cả', 'Đã hoàn thành'].map((item, i) => <Tag key={item} tone={i === 0 ? 'mint' : 'plain'}>{item}</Tag>)}</ScrollView>
      {tasks.map(([plant, detail, status, emoji]) => <View key={plant} style={s.taskCard}><Pressable onPress={() => router.push('/schedule/detail' as never)} style={s.rowTop}><View style={s.plantImage}><Text style={s.plantEmoji}>{emoji}</Text></View><View style={s.cardCopy}><Text style={s.cardTitle}>{plant}</Text><Text style={s.body}>{detail}</Text></View><Tag tone={status === 'Đến hạn' ? 'peach' : 'mint'}>{status}</Tag></Pressable><View style={s.row}><Action label="Bỏ qua" muted onPress={() => Alert.alert('Bản xem trước', 'Lịch chưa được lưu.')} /><Action label="Hoàn thành" onPress={() => Alert.alert('Bản xem trước', 'Lịch chưa được cập nhật.')} /></View></View>)}</Section>
    <Section title="Thiết lập lịch chăm sóc" hint="Tùy chỉnh"><View style={s.card}><Text style={s.cardTitle}>Chu kỳ chăm sóc mẫu</Text><Text style={s.body}>Tưới nước • Bón phân • Cắt tỉa • Kiểm tra sâu bệnh</Text><View style={s.divider} /><Action label="Tạo lịch chăm sóc cây" onPress={() => router.push('/schedule/create' as never)} /></View></Section>
  </>;
}

function MonitoringContent() {
  return <>
    <View style={s.metrics}>{[['45', 'Cây theo dõi'], ['98%', 'Tỉ lệ khỏe mạnh'], ['2 ca', 'Cần xử lý sâu'], ['0 ca', 'Nguy cấp']].map(([value, label]) => <View key={label} style={s.metric}><Text style={s.metricValue}>{value}</Text><Text style={s.body}>{label}</Text></View>)}</View>
    <View style={s.card}><View style={s.row}><Text style={s.cardTitle}>◉ Chỉ số sinh thái toàn vườn</Text><Tag>3 Vườn • 45 Cây</Tag></View><View style={s.eco}><Text style={s.ecoScore}>94<Text style={s.body}>/100</Text></Text><View style={s.cardCopy}><Text style={s.cardTitle}>Sinh thái xuất sắc</Text><Text style={s.body}>Môi trường sống cân bằng, tỷ lệ rủi ro nhiễm nấm bệnh thấp.</Text></View></View><Text style={s.body}>Độ ẩm ổn định • Tốc độ sinh trưởng tốt • 92% cây cần tưới</Text></View>
    <Section title="Khu vườn đang sở hữu" hint="3 khu vực"><GardenList /></Section>
    <Section title="Danh sách cây trồng theo dõi" hint="Hồ sơ sức khỏe"><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>{['Tất cả cây (45)', 'Đang theo dõi bệnh (2)', 'Đã phục hồi (5)', 'Khỏe mạnh (38)'].map((x, i) => <Tag key={x} tone={i === 0 ? 'mint' : 'plain'}>{x}</Tag>)}</ScrollView>{['Hoa hồng leo Huntington', 'Cà chua bi Cherry', 'Trầu bà lá xẻ Monstera'].map((name) => <View key={name} style={s.card}><View style={s.row}><Text style={s.cardTitle}>{name}</Text><Tag tone="peach">Cảnh báo</Tag></View><Text style={s.body}>Ban công tầng 3 • Tình trạng và tiến triển chăm sóc</Text><Action label="Cập nhật tiến triển" onPress={() => router.push({ pathname: '/monitoring/detail', params: { name, type: 'plant' } } as never)} /></View>)}</Section>
    <Section title="Dự báo & Gợi ý chăm sóc"><View style={s.card}><Text style={s.cardTitle}>☼ Mẹo vi khí hậu hôm nay</Text><Text style={s.body}>Sân thượng có chỉ số UV cao và gió hanh từ 11:00 đến 14:00. Hãy kiểm tra độ ẩm đất của cây.</Text></View><Action label="Bắt đầu bài đánh giá nhanh vườn" /></Section>
  </>;
}

function EmptyCard({ icon, title, description, action, onPress }: { icon: string; title: string; description: string; action?: string; onPress?: () => void }) {
  return <View style={s.emptyCard}>
    <View style={s.emptyIcon}><Text style={s.emptyGlyph}>{icon}</Text></View>
    <Text style={s.cardTitle}>{title}</Text>
    <Text style={s.emptyDescription}>{description}</Text>
    {action && onPress ? <Action label={action} onPress={onPress} /> : null}
  </View>;
}

function EmptyPage({ kind }: { kind: PageKind }) {
  const { ownedPlants, favorites, removePlant } = usePlantData();
  const [plantQuery, setPlantQuery] = useState('');
  if (kind === 'gardens') return <>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>{['Tất cả (0)', 'Ban công (0)', 'Trong nhà (0)'].map((x, i) => <Tag key={x} tone={i === 0 ? 'mint' : 'plain'}>{x}</Tag>)}</ScrollView>
    <View style={s.recommend}><Text style={s.cardTitle}>✦  Gợi ý thiết lập vườn</Text><Text style={s.body}>Khám phá mẫu vườn và cách sắp xếp phù hợp với không gian của bạn.</Text></View>
    <Section title="Khu vườn của bạn" hint="0 khu vực">
      <EmptyCard icon="⌂" title="Chưa có khu vườn nào" description="Tạo khu vườn để sắp xếp cây theo không gian và điều kiện chăm sóc." action="＋  Tạo khu vườn mới" onPress={() => router.push('/garden/create' as never)} />
    </Section>
    <Section title="Cây trồng chờ sắp xếp" hint="0 cây"><EmptyCard icon="♧" title="Chưa có cây chờ sắp xếp" description="Cây bạn thêm sẽ xuất hiện tại đây để đưa vào một khu vườn." action="＋  Thêm cây" onPress={() => router.push('/garden/add-plant' as never)} /></Section>
    <Text style={s.mockNote}>Gợi ý cây và mẫu vườn cần dữ liệu nội dung trước khi hiển thị.</Text>
  </>;
  if (kind === 'plants') {
    const normalized = plantQuery.trim().toLocaleLowerCase();
    const visiblePlants = ownedPlants.filter((plant) => `${plant.name} ${plant.scientificName} ${plant.location}`.toLocaleLowerCase().includes(normalized));
    const favoritePlants = plantCatalog.filter((plant) => favorites.includes(plant.id));
    return <>
      <View style={s.search}><Text style={s.searchGlyph}>⌕</Text><TextInput value={plantQuery} onChangeText={setPlantQuery} placeholder="Tìm theo tên cây, loài hoặc vị trí..." placeholderTextColor={C.mutedText} style={s.searchInput} /></View>
      <View style={s.managementActions}><Action label="＋  Thêm cây" onPress={() => router.push('/garden/add-plant' as never)} /><Action label="Lọc cây" muted onPress={() => router.push({ pathname: '/filter', params: { scope: 'owned' } } as never)} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>{[`Cây đang sở hữu (${ownedPlants.length})`, 'Khám phá & tìm cây'].map((x, i) => <Pressable key={x} onPress={() => i === 1 && router.push('/search' as never)}><Tag tone={i === 0 ? 'mint' : 'plain'}>{x}</Tag></Pressable>)}</ScrollView>
      <Section title="Cây đang sở hữu" hint={`${visiblePlants.length} cây`}>
        {visiblePlants.length === 0 ? <EmptyCard icon="♧" title={plantQuery ? 'Không tìm thấy cây phù hợp' : 'Vườn của bạn chưa có cây'} description={plantQuery ? 'Thử tên cây, tên khoa học hoặc vị trí khác.' : 'Thêm cây đầu tiên để bắt đầu quản lý hồ sơ cây trồng.'} action={plantQuery ? undefined : '＋  Thêm cây đầu tiên'} onPress={plantQuery ? undefined : () => router.push('/garden/add-plant' as never)} /> : visiblePlants.map((plant) => <View key={plant.id} style={s.plantCard}>
          <View style={s.rowTop}><View style={s.plantImage}><Text style={s.plantEmoji}>♧</Text></View><View style={s.cardCopy}><Text style={s.cardTitle}>{plant.name}</Text><Text style={s.latin}>{plant.scientificName}</Text><Text style={s.body}>{plant.category} • {plant.location}</Text><Text style={s.body}>Ngày thêm: {plant.plantedAt || 'Chưa có dữ liệu'} • Tình trạng: Chưa đánh giá</Text></View></View>
          <View style={s.row}><Action label="Chi tiết" muted onPress={() => router.push({ pathname: '/plant-detail', params: { name: plant.name, ownedId: plant.id } } as never)} /><Action label="Chỉnh sửa" muted onPress={() => router.push({ pathname: '/garden/add-plant', params: { editId: plant.id } } as never)} /><Action label="Xóa" muted onPress={() => Alert.alert('Xóa cây', `Xóa hồ sơ “${plant.name}” khỏi danh sách demo?`, [{ text: 'Hủy', style: 'cancel' }, { text: 'Xóa', style: 'destructive', onPress: () => removePlant(plant.id) }])} /></View>
        </View>)}
      </Section>
      <Section title="Cây trồng mong muốn" hint={`${favoritePlants.length} cây đã lưu`}>
        {favoritePlants.length === 0 ? <EmptyCard icon="♡" title="Chưa có cây yêu thích" description="Khám phá thư viện cây để xem thông tin tham khảo và đánh dấu yêu thích." action="Khám phá cây" onPress={() => router.push('/search' as never)} /> : favoritePlants.map((plant) => <View key={plant.id} style={s.rowCard}><View style={s.plantImage}><Text style={s.plantEmoji}>♧</Text></View><View style={s.cardCopy}><Text style={s.cardTitle}>{plant.name}</Text><Text style={s.latin}>{plant.scientificName}</Text><Text style={s.body}>Thông tin thư viện mẫu; chưa có dữ liệu chăm sóc chi tiết.</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Xem ${plant.name}`} onPress={() => router.push({ pathname: '/plant-detail', params: { name: plant.name } } as never)}><Text style={s.heart}>♡</Text></Pressable></View>)}
      </Section>
      <Text style={s.mockNote}>Hồ sơ thêm trong phiên này là dữ liệu minh họa cục bộ, không đồng bộ và sẽ mất khi khởi động lại ứng dụng.</Text>
    </>;
  }
  if (kind === 'journal') return <>
    <View style={s.metrics}>{[['0', 'Ghi nhận'], ['0', 'Cây có nhật ký'], ['0', 'Khu vườn'], ['—', 'Cập nhật gần nhất']].map(([value, label]) => <View key={label} style={s.metric}><Text style={s.metricValue}>{value}</Text><Text style={s.body}>{label}</Text></View>)}</View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>{['Tất cả vườn', 'Nhật ký từng cây'].map((x, i) => <Tag key={x} tone={i === 0 ? 'mint' : 'plain'}>{x}</Tag>)}</ScrollView>
    <Section title="Nhật ký khu vườn"><EmptyCard icon="▤" title="Chưa có nhật ký khu vườn" description="Ghi lại hoạt động, thay đổi và hình ảnh trong khu vườn." action="＋  Thêm nhật ký khu vườn" onPress={() => router.push('/journal/new' as never)} /></Section>
    <Section title="Nhật ký từng cây"><EmptyCard icon="♧" title="Chưa có nhật ký cây trồng" description="Theo dõi từng giai đoạn phát triển và chăm sóc của cây." action="＋  Thêm nhật ký cây" onPress={() => router.push('/journal/new' as never)} /></Section>
    <View style={s.recommend}><Text style={s.cardTitle}>Mẹo ghi nhật ký</Text><Text style={s.body}>Ghi lại việc chăm sóc thường xuyên để dễ theo dõi thay đổi theo thời gian.</Text></View>
  </>;
  if (kind === 'monitoring') return <>
    <View style={s.metrics}>{[['0', 'Cây đang theo dõi'], ['—', 'Tỉ lệ khỏe mạnh'], ['0', 'Cần xử lý'], ['—', 'Chỉ số sinh thái']].map(([value, label]) => <View key={label} style={s.metric}><Text style={s.metricValue}>{value}</Text><Text style={s.body}>{label}</Text></View>)}</View>
    <View style={s.eco}><Text style={s.ecoScore}>—</Text><View style={s.cardCopy}><Text style={s.cardTitle}>Chưa có dữ liệu đánh giá</Text><Text style={s.body}>Thêm vườn và cây để bắt đầu theo dõi.</Text></View></View>
    <Section title="Khu vườn"><EmptyCard icon="⌂" title="Chưa có khu vườn để theo dõi" description="Tạo khu vườn đầu tiên để ghi nhận tình trạng không gian trồng." action="Tạo khu vườn" onPress={() => router.push('/garden/create' as never)} /></Section>
    <Section title="Cây trồng theo dõi"><EmptyCard icon="♧" title="Chưa có cây được theo dõi" description="Thêm cây để ghi nhận sức khỏe và tiến triển chăm sóc." action="Thêm cây" onPress={() => router.push('/garden/add-plant' as never)} /></Section>
    <Section title="Lịch sử ghi nhận"><EmptyCard icon="▤" title="Chưa có ghi nhận" description="Nhật ký và kết quả theo dõi sẽ xuất hiện tại đây." action="Thêm ghi nhận" onPress={() => router.push('/journal/new' as never)} /></Section>
  </>;
  return <>
    <View style={s.scheduleBanner}><Text style={s.bannerIcon}>◷</Text><View style={s.cardCopy}><Text style={s.cardTitle}>Lịch chăm sóc của bạn</Text><Text style={s.body}>Theo dõi các công việc chăm cây sắp tới.</Text></View></View>
    <View style={s.metrics}><View style={s.metric}><Text style={s.metricValue}>0%</Text><Text style={s.body}>Tiến độ hoàn thành</Text></View><View style={s.metric}><Text style={s.metricValue}>0</Text><Text style={s.body}>Lịch đang hoạt động</Text></View></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>{['Tất cả', 'Hôm nay', 'Tuần này'].map((x, i) => <Tag key={x} tone={i === 0 ? 'mint' : 'plain'}>{x}</Tag>)}</ScrollView>
    <Section title="Cây chưa có lịch" hint="0 cây"><EmptyCard icon="◷" title="Chưa có lịch chăm sóc" description="Tạo lịch để lên kế hoạch tưới nước, bón phân và chăm sóc cây." action="＋  Tạo lịch đầu tiên" onPress={() => router.push('/schedule/create' as never)} /></Section>
    <Section title="Thiết lập lịch thủ công"><View style={s.card}><Text style={s.cardTitle}>Tạo chu kỳ chăm sóc</Text><Text style={s.body}>Chọn cây, công việc và thời gian phù hợp.</Text><Action label="Thiết lập lịch" onPress={() => router.push('/schedule/create' as never)} /></View></Section>
  </>;
}

function PageContent({ kind }: { kind: PageKind }) {
  const config: Record<PageKind, { title: string; subtitle: string; intro: string }> = {
    gardens: { title: 'Trang Chủ', subtitle: 'Vườn của tôi', intro: 'Bắt đầu tạo khu vườn đầu tiên của bạn' },
    plants: { title: 'Cây Trồng', subtitle: 'Quản lý cây trồng', intro: 'Tổng số 0 cây • 0 khu vườn' },
    journal: { title: 'Nhật ký', subtitle: 'Nhật ký phát triển', intro: 'Chưa có ghi nhận nào' },
    schedule: { title: 'Lịch Chăm Sóc', subtitle: 'Lập lịch chăm sóc', intro: 'Chưa có lịch chăm sóc nào' },
    monitoring: { title: 'Theo dõi & Ghi nhận', subtitle: 'Tổng quan sức khỏe vườn', intro: 'Chưa có cây hoặc khu vườn để theo dõi' },
  };
  const { title, subtitle, intro } = config[kind];
  const route = `/${kind}`;
  const alertLater = (action: string) => Alert.alert('Bản xem trước', `${action} đang dùng dữ liệu giao diện mẫu; chức năng sẽ được triển khai tiếp theo.`);
  return <SafeAreaView style={s.safe} edges={['top']}>
    <PageHeader title={title} subtitle={subtitle} />
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.introRow}><View style={s.cardCopy}><Text style={s.pageTitle}>{subtitle}</Text><Text style={s.body}>{intro}</Text></View></View>
      <EmptyPage kind={kind} />
    </ScrollView>
    <BottomNav current={route} />
  </SafeAreaView>;
}

export function GardensScreen() { return <PageContent kind="gardens" />; }
export function PlantsScreen() { return <PageContent kind="plants" />; }
export function JournalScreen() { return <PageContent kind="journal" />; }
export function ScheduleScreen() { return <PageContent kind="schedule" />; }
export function MonitoringScreen() { return <PageContent kind="monitoring" />; }

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: { minHeight: 58, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DDE8E0' },
  back: { width: 28, height: 38, justifyContent: 'center' }, backText: { color: C.forest, fontSize: 30, lineHeight: 34 },
  headerCopy: { flex: 1 }, brand: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11 }, headerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: C.forest, fontFamily: F.bold },
  headerSubtitle: { position: 'absolute', left: 50, top: 58, color: C.secondaryText, fontFamily: F.regular, fontSize: 11 },
  content: { paddingHorizontal: 14, paddingTop: 18, paddingBottom: 20, gap: 9 },
  introRow: { minHeight: 54, marginBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }, pageTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 18, lineHeight: 24 },
  section: { gap: 8, marginTop: 5 }, sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 15, lineHeight: 21 }, hint: { color: C.mutedText, fontFamily: F.regular, fontSize: 11 },
  card: { padding: 10, borderRadius: 14, backgroundColor: C.surface, gap: 7 }, gardenArt: { minHeight: 104, borderRadius: 11, backgroundColor: '#DDEFE3', alignItems: 'center', justifyContent: 'center' }, artGlyph: { color: '#49815E', fontSize: 38 }, artLabel: { color: '#446751', fontFamily: F.semiBold, fontSize: 9, letterSpacing: 1 },
  cardBody: { gap: 5 }, cardTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 13, lineHeight: 19 }, body: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 }, rowTop: { flexDirection: 'row', alignItems: 'center', gap: 9 }, cardCopy: { flex: 1, gap: 2 },
  tag: { overflow: 'hidden', alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, fontFamily: F.semiBold, fontSize: 10, lineHeight: 14 }, tagMint: { color: C.forest, backgroundColor: '#D5F2E1' }, tagPeach: { color: '#914218', backgroundColor: '#FFE0CF' }, tagPlain: { color: C.secondaryText, backgroundColor: '#E7EEE8' },
  action: { minHeight: 34, paddingHorizontal: 10, borderRadius: 9, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }, actionText: { color: C.surface, fontFamily: F.semiBold, fontSize: 11 }, actionMuted: { flex: 1, backgroundColor: C.softSurface }, actionMutedText: { color: C.secondaryText },
  pills: { flexDirection: 'row', gap: 7, paddingVertical: 3 }, recommend: { padding: 13, borderRadius: 13, backgroundColor: '#D9F2E3', gap: 6 },
  search: { minHeight: 44, paddingHorizontal: 9, borderRadius: 11, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 6 }, searchGlyph: { width: 23, textAlign: 'center', color: C.secondaryText, fontSize: 24 }, searchInput: { flex: 1, paddingVertical: 7, color: C.text, fontFamily: F.regular, fontSize: 12 },
  plantCard: { padding: 9, borderRadius: 14, backgroundColor: C.surface, gap: 7 }, plantImage: { width: 54, height: 54, borderRadius: 10, backgroundColor: '#E4F0E7', alignItems: 'center', justifyContent: 'center' }, plantEmoji: { fontSize: 25 }, latin: { color: C.mutedText, fontFamily: F.regular, fontSize: 10, fontStyle: 'italic' }, divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#DEE8E0' }, rowCard: { padding: 9, borderRadius: 13, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 9 }, heart: { color: '#A84B20', fontSize: 18 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, metric: { width: '48%', minHeight: 54, padding: 9, borderRadius: 12, backgroundColor: C.surface }, metricValue: { color: C.forest, fontFamily: F.bold, fontSize: 15 }, eco: { marginVertical: 8, padding: 10, borderRadius: 12, backgroundColor: C.softSurface, flexDirection: 'row', alignItems: 'center', gap: 12 }, ecoScore: { color: C.forest, fontFamily: F.bold, fontSize: 23 },
  plantCardActions: { flexDirection: 'row', gap: 5 }, scheduleBanner: { padding: 12, borderRadius: 13, backgroundColor: C.softSurface, flexDirection: 'row', alignItems: 'center', gap: 9 }, bannerIcon: { color: C.forest, fontSize: 22 }, taskCard: { padding: 10, borderRadius: 13, backgroundColor: C.surface, gap: 8 },
  mockNote: { marginTop: 8, color: C.mutedText, fontFamily: F.regular, fontSize: 10, textAlign: 'center' },
  emptyCard: { padding: 16, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', gap: 9 },
  emptyIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#E2F1E7', alignItems: 'center', justifyContent: 'center' },
  emptyGlyph: { color: C.forest, fontSize: 30, lineHeight: 36 },
  emptyDescription: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  managementActions: { flexDirection: 'row', gap: 8 },
  bottomNav: { minHeight: 60, paddingHorizontal: 3, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DDE8E0', backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center' }, navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }, navIcon: { color: C.secondaryText, fontSize: 18, lineHeight: 22 }, navLabel: { color: C.secondaryText, fontFamily: F.regular, fontSize: 9 }, active: { color: C.forest, fontFamily: F.semiBold },
});
