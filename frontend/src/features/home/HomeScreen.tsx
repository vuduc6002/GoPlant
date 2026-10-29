import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';

// Local sample content for the visual prototype; no live weather or plant service is connected.

const categories = ['Tất cả', 'Cây ăn quả', 'Cây rau lá', 'Hoa cảnh', 'Cây mọng nước', 'Cây gia vị'];

function SectionTitle({ title, trailing }: { title: string; trailing?: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {trailing ? <Text style={styles.sectionTrailing}>{trailing}</Text> : null}
    </View>
  );
}

export default function HomeScreen() {
  const [category, setCategory] = useState(categories[0]);
  const [query, setQuery] = useState('');

  const unavailable = (feature: string) => Alert.alert('Bản xem trước giao diện', `${feature} sẽ được triển khai theo thiết kế ở đợt tiếp theo.`);
  const navigate = (route: string) => router.push(route as never);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Image source={require('@/assets/images/figma/welcome/logo.jpeg')} style={styles.logo} contentFit="cover" />
          <View>
            <Text style={styles.brandName}>GoPlant</Text>
            <Text style={styles.headerTitle}>Trang Chủ</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Thông báo" onPress={() => unavailable('Thông báo')} style={styles.iconButton}>
            <Text style={styles.headerIcon}>♧</Text>
          </Pressable>
          <View style={styles.avatar}><Text style={styles.avatarText}>G</Text></View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.greetingRow}>
          <View style={styles.greetingCopy}>
            <Text style={styles.greeting}>Chào buổi sáng, Amy🌱</Text>
            <Text style={styles.subtitle}>Hôm nay là thời điểm lý tưởng để chăm vườn nhỏ!</Text>
          </View>
          <View style={styles.sunBadge}><Text style={styles.sun}>☼</Text></View>
        </View>

        <View style={styles.weatherCard}>
          <View style={[styles.roundIcon, { backgroundColor: '#E1F3E8' }]}><Text>☼</Text></View>
          <View style={styles.flexCopy}>
            <Text style={styles.cardTitle}>28°C <Text style={styles.secondary}>• Độ ẩm 75%</Text></Text>
            <Text style={styles.bodyText}>Nắng nhẹ - Rất tốt để tưới cây</Text>
          </View>
          <Text style={styles.lightPill}>Tối ưu</Text>
        </View>

        <View style={styles.scheduleCard}>
          <View style={styles.scheduleIcon}><Text style={styles.white}>▣</Text></View>
          <View style={styles.flexCopy}>
            <Text style={styles.scheduleTitle}>Lập lịch chăm sóc cây trồng</Text>
            <Text style={styles.scheduleDescription}>Tự động hóa chu kỳ tưới nước, bón phân & tỉa cành để cây luôn xanh tốt.</Text>
          </View>
          <Pressable onPress={() => navigate('/schedule/create')} style={styles.scheduleButton}><Text style={styles.white}>Tạo lịch ngay →</Text></Pressable>
        </View>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => router.push({ pathname: '/search', params: { query } } as never)} placeholder="Tìm kiếm giống cây, sâu bệnh, kỹ thuật..." placeholderTextColor="#7B8580" style={styles.searchInput} returnKeyType="search" />
          <Pressable accessibilityRole="button" accessibilityLabel="Bộ lọc" onPress={() => navigate('/filter')} style={styles.searchAction}><Text>☷</Text></Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {categories.map((item) => (
            <Pressable key={item} onPress={() => setCategory(item)} style={[styles.chip, category === item && styles.chipSelected]}>
              <Text style={[styles.chipText, category === item && styles.chipTextSelected]}>{item}</Text>
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
            <Pressable key={label} onPress={() => label === 'Quản lý cây' ? navigate('/plants') : label === 'Quản lý vườn' ? navigate('/gardens') : label === 'Nhật ký chăm' ? navigate('/journal') : navigate('/monitoring')} style={styles.shortcut}>
              <View style={[styles.shortcutIcon, { backgroundColor: color }]}><Text style={styles.shortcutGlyph}>{icon}</Text></View>
              <Text style={styles.shortcutLabel}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <SectionTitle title="Vườn của bạn" trailing="0 khu vực" />
        <View style={styles.emptyHomeCard}>
          <Text style={styles.emptyHomeArt}>⌂</Text>
          <Text style={styles.emptyHomeTitle}>Bắt đầu tạo khu vườn đầu tiên</Text>
          <Text style={styles.bodyText}>Tạo không gian riêng để sắp xếp và chăm sóc cây.</Text>
          <Pressable onPress={() => navigate('/garden/create')} style={styles.emptyHomeButton}><Text style={styles.white}>＋  Tạo khu vườn mới</Text></Pressable>
        </View>
        <SectionTitle title="Cây trồng & chăm sóc" trailing="Chưa có cây" />
        <View style={styles.emptyHomeCard}>
          <Text style={styles.emptyHomeArt}>♧</Text>
          <Text style={styles.emptyHomeTitle}>Chưa có cây nào trong vườn</Text>
          <Text style={styles.bodyText}>Thêm cây để bắt đầu theo dõi quá trình chăm sóc.</Text>
          <Pressable onPress={() => navigate('/garden/add-plant')} style={styles.emptyHomeButton}><Text style={styles.white}>＋  Thêm cây đầu tiên</Text></Pressable>
        </View>
        <SectionTitle title="Gợi ý cho bạn" trailing="Khám phá" />
        <View style={styles.suggestionCard}><Text style={styles.plantEmoji}>🪴</Text><View style={styles.flexCopy}><Text style={styles.cardTitle}>Trầu bà lá xẻ</Text><Text style={styles.bodyText}>Dễ chăm sóc • Phù hợp trong nhà</Text></View><Text style={styles.caption}>Dữ liệu minh họa</Text></View>
        <View style={styles.newUserTip}><Text style={styles.cardTitle}>Mẹo nhỏ cho người mới</Text><Text style={styles.bodyText}>Bắt đầu với một cây phù hợp ánh sáng và không gian của bạn.</Text></View>
      </ScrollView>

      <View style={styles.bottomNav}>
        {[
          ['⌂', 'Trang chủ', true],
          ['▦', 'Vườn của tôi', false],
          ['♧', 'Cây trồng', false],
          ['▤', 'Nhật ký', false],
          ['☼', 'Theo dõi', false],
        ].map(([icon, label, selected], index) => (
          <Pressable key={label as string} accessibilityRole="tab" accessibilityState={{ selected: Boolean(selected) }} onPress={() => navigate(['/home', '/gardens', '/plants', '/journal', '/monitoring'][index])} style={styles.navItem}>
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
  header: { height: 56, paddingHorizontal: 16, backgroundColor: C.background, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2EBE4' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 30, height: 30, borderRadius: 5 },
  brandName: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 16 },
  headerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14, lineHeight: 20 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerIcon: { color: C.secondaryText, fontSize: 22 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#C7D9CC', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.forest, fontFamily: F.bold, fontSize: 14 },
  content: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 20, gap: 8 },
  greetingRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greetingCopy: { flex: 1, gap: 2 },
  greeting: { color: C.forest, fontFamily: F.semiBold, fontSize: 16, lineHeight: 22 },
  subtitle: { color: C.secondaryText, fontFamily: F.regular, fontSize: 13, lineHeight: 19 },
  sunBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#D9F1E3', alignItems: 'center', justifyContent: 'center' },
  sun: { color: C.forest, fontSize: 26, lineHeight: 30 },
  weatherCard: { minHeight: 72, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: C.softSurface, flexDirection: 'row', alignItems: 'center', gap: 10 },
  roundIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  flexCopy: { flex: 1, gap: 2 },
  cardTitle: { color: C.text, fontFamily: F.semiBold, fontSize: 14, lineHeight: 19 },
  secondary: { color: C.secondaryText, fontFamily: F.regular },
  bodyText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 18 },
  lightPill: { overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: C.surface, color: C.forest, fontFamily: F.semiBold, fontSize: 12 },
  reminderCard: { minHeight: 76, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: '#F9E6D4', flexDirection: 'row', alignItems: 'center', gap: 8 },
  reminderText: { color: '#8B3D13', fontFamily: F.regular, fontSize: 12, lineHeight: 17 },
  reminderButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 99, backgroundColor: '#A94F1B' },
  white: { color: C.surface, fontFamily: F.semiBold, fontSize: 12 },
  scheduleCard: { minHeight: 72, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: '#BCE6CD', backgroundColor: '#D9F2E3', flexDirection: 'row', alignItems: 'center', gap: 8 },
  scheduleIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  scheduleTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 13, lineHeight: 18 },
  scheduleDescription: { color: C.secondaryText, fontFamily: F.regular, fontSize: 10, lineHeight: 14 },
  scheduleButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 99, backgroundColor: C.primary },
  searchBox: { minHeight: 46, marginTop: 2, paddingHorizontal: 10, borderRadius: 12, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 4 },
  searchIcon: { color: '#65706A', fontSize: 26, width: 24, textAlign: 'center' },
  searchInput: { flex: 1, paddingVertical: 8, color: C.text, fontFamily: F.regular, fontSize: 12 },
  searchAction: { width: 32, height: 32, borderRadius: 8, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
  chips: { gap: 7, paddingVertical: 2 },
  chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 99, backgroundColor: '#E7EEE8' },
  chipSelected: { backgroundColor: C.forest },
  chipText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 16 },
  chipTextSelected: { color: C.surface, fontFamily: F.semiBold },
  shortcuts: { flexDirection: 'row', gap: 8, marginTop: 2 },
  shortcut: { flex: 1, minHeight: 76, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', gap: 5 },
  shortcutIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  shortcutGlyph: { color: C.forest, fontSize: 18 },
  shortcutLabel: { color: C.text, fontFamily: F.regular, fontSize: 10, textAlign: 'center' },
  sectionTitleRow: { marginTop: 8, marginBottom: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14, lineHeight: 20 },
  sectionTrailing: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11 },
  horizontalCards: { gap: 10, paddingRight: 4 },
  gardenCard: { width: 208, padding: 8, borderRadius: 14, backgroundColor: C.surface },
  emptyHomeCard: { padding: 16, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', gap: 8 },
  emptyHomeArt: { width: 54, height: 54, borderRadius: 27, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', backgroundColor: '#E3F2E8', color: C.forest, fontSize: 30 },
  emptyHomeTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14, textAlign: 'center' },
  emptyHomeButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  suggestionCard: { padding: 12, borderRadius: 13, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 10 },
  newUserTip: { padding: 12, borderRadius: 13, backgroundColor: '#E3F2E8', gap: 4 },
  gardenName: { marginTop: 7, color: C.forest, fontFamily: F.semiBold, fontSize: 12, lineHeight: 17 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 7, backgroundColor: '#D8E2DA' },
  gardenStatus: { color: C.primary, fontFamily: F.semiBold, fontSize: 11, lineHeight: 16 },
  addGarden: { width: 104, minHeight: 158, borderRadius: 14, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center', gap: 4 },
  addPlus: { color: C.forest, fontSize: 28 },
  caption: { color: C.mutedText, fontFamily: F.regular, fontSize: 10, lineHeight: 14 },
  list: { gap: 8 },
  careCard: { minHeight: 68, padding: 9, borderRadius: 14, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 9 },
  plantThumb: { width: 42, height: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  plantEmoji: { fontSize: 23 },
  careAction: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99, backgroundColor: '#E8F0E9' },
  careActionDark: { backgroundColor: C.primary },
  careActionText: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 11 },
  emptyMessage: { padding: 14, color: C.mutedText, fontFamily: F.regular, textAlign: 'center' },
  wishCard: { padding: 9, borderRadius: 14, backgroundColor: C.surface, gap: 8 },
  wishTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  wishThumb: { width: 52, height: 52 },
  heart: { color: '#A94F1B', fontSize: 18 },
  wishButton: { minHeight: 34, borderRadius: 9, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  wishButtonText: { color: C.surface, fontFamily: F.semiBold, fontSize: 11 },
  morePlants: { minHeight: 42, borderRadius: 12, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
  morePlantsText: { color: C.forest, fontFamily: F.semiBold, fontSize: 12 },
  bottomNav: { minHeight: 62, paddingHorizontal: 5, paddingTop: 6, paddingBottom: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DCE6DF', backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  navIcon: { color: '#58635D', fontSize: 18, lineHeight: 22 },
  navLabel: { color: '#58635D', fontFamily: F.regular, fontSize: 9, lineHeight: 13 },
  navSelected: { color: C.forest, fontFamily: F.semiBold },
});
