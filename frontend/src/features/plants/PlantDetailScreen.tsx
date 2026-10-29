import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { plantCatalog, usePlantData } from '@/features/plants/PlantDataStore';

const missing = 'Chưa có dữ liệu';

function InfoRow({ label, value }: { label: string; value?: string }) {
  return <View style={d.infoRow}><Text style={d.infoLabel}>{label}</Text><Text style={d.infoValue}>{value?.trim() || missing}</Text></View>;
}

export default function PlantDetailScreen() {
  const { name, ownedId } = useLocalSearchParams<{ name?: string; ownedId?: string }>();
  const { ownedPlants, favorites, toggleFavorite } = usePlantData();
  const owned = ownedPlants.find((item) => item.id === ownedId);
  const plant = (owned && plantCatalog.find((item) => item.id === owned.catalogId))
    ?? plantCatalog.find((item) => item.name === name || item.scientificName === name)
    ?? { id: 'unknown-plant', name: name ?? 'Cây trồng', scientificName: missing, category: missing };
  const isFavorite = favorites.includes(plant.id);

  return <SafeAreaView style={d.safe} edges={['top']}>
    <View style={d.header}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Quay lại" style={d.back}><Text style={d.backText}>‹</Text></Pressable>
      <Text style={d.headerTitle}>Chi tiết cây trồng</Text>
      <Pressable onPress={() => toggleFavorite(plant.id)} accessibilityRole="button" accessibilityLabel={isFavorite ? 'Bỏ yêu thích' : 'Thêm yêu thích'}><Text style={d.heart}>{isFavorite ? '♥' : '♡'}</Text></Pressable>
    </View>
    <ScrollView contentContainerStyle={d.content}>
      <View style={d.hero}><Text style={d.heroEmoji}>♧</Text><Text style={d.heroBadge}>THƯ VIỆN CÂY • DỮ LIỆU MẪU</Text></View>
      <View style={d.titleRow}><View style={d.copy}><Text style={d.title}>{owned?.name ?? plant.name}</Text><Text style={d.latin}>{plant.scientificName}</Text><View style={d.tags}><Text style={d.tag}>{plant.category}</Text><Text style={d.tag}>{owned ? 'Cây đang sở hữu' : 'Cây tham khảo'}</Text></View></View></View>

      {owned ? <View style={d.card}>
        <Text style={d.sectionTitle}>Hồ sơ cây của bạn</Text>
        <InfoRow label="Ngày trồng / bắt đầu chăm sóc" value={owned.plantedAt} />
        <InfoRow label="Vị trí hiện tại" value={owned.location} />
        <InfoRow label="Ghi chú" value={owned.note} />
        <InfoRow label="Tình trạng" value="Chưa đánh giá" />
        <Text style={d.note}>Hồ sơ được lưu tạm trong bộ nhớ phiên hiện tại.</Text>
      </View> : null}

      <View style={d.card}>
        <Text style={d.sectionTitle}>Thông tin nhận diện</Text>
        <InfoRow label="Tên cây" value={plant.name} />
        <InfoRow label="Tên khoa học" value={plant.scientificName} />
        <InfoRow label="Loại cây" value={plant.category} />
        <InfoRow label="Nguồn gốc" value={plant.origin} />
        <InfoRow label="Mô tả ngắn" value={plant.overview} />
      </View>

      <View style={d.card}>
        <Text style={d.sectionTitle}>Tổng quan về cây</Text>
        <InfoRow label="Đặc điểm hình thái" value={plant.morphology} />
        <InfoRow label="Nguồn gốc và phân bố" value={plant.origin} />
        <InfoRow label="Đặc điểm sinh trưởng" value={plant.overview} />
        <InfoRow label="Tuổi thọ" value={plant.lifespan} />
        <InfoRow label="Mùa hoa / mùa quả" value={plant.floweringSeason} />
        <InfoRow label="Công dụng và lưu ý" value={plant.usageAndCaution} />
      </View>

      <View style={d.card}>
        <Text style={d.sectionTitle}>Đặc tính và điều kiện sinh trưởng</Text>
        <InfoRow label="Độ khó chăm sóc" value={plant.difficulty} />
        <InfoRow label="Nhu cầu ánh sáng" value={plant.light} />
        <InfoRow label="Nhu cầu nước" value={plant.water} />
        <InfoRow label="Nhiệt độ phù hợp (°C)" value={plant.temperature} />
        <InfoRow label="Độ ẩm không khí (%)" value={plant.humidity} />
        <InfoRow label="Loại đất / giá thể" value={plant.medium} />
        <InfoRow label="Nhu cầu thoát nước" value={plant.drainage} />
        <InfoRow label="Kích thước trưởng thành" value={plant.matureSize} />
        <InfoRow label="Tốc độ phát triển" value={plant.growthRate} />
        <InfoRow label="Thời gian ra hoa / quả" value={plant.floweringSeason} />
        <InfoRow label="Tần suất tưới tham khảo" value={plant.wateringFrequency} />
        <InfoRow label="Độ pH đất" value={plant.soilPh} />
        <InfoRow label="Nhu cầu dinh dưỡng" value={plant.nutrition} />
        <Text style={d.note}>Các điều kiện chưa có nguồn dữ liệu được để trống về giá trị; đây không phải khuyến nghị chăm sóc.</Text>
      </View>

      <View style={d.actions}>
        {!owned ? <Pressable onPress={() => router.push({ pathname: '/garden/add-plant', params: { plantId: plant.id } } as never)} style={d.primaryButton}><Text style={d.primaryText}>＋  Thêm cây vào cây của tôi</Text></Pressable> : <Pressable onPress={() => router.push({ pathname: '/garden/add-plant', params: { editId: owned.id } } as never)} style={d.primaryButton}><Text style={d.primaryText}>Chỉnh sửa hồ sơ cây</Text></Pressable>}
      </View>
      <Text style={d.note}>Thư viện hiện là danh sách demo cục bộ; chưa có ảnh thực, dữ liệu chuyên môn đầy đủ hoặc API.</Text>
    </ScrollView>
  </SafeAreaView>;
}

const d = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background }, header: { height: 52, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, back: { width: 36 }, backText: { color: C.forest, fontSize: 30 }, headerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 15 }, heart: { color: C.terracotta, fontSize: 25 },
  content: { padding: 13, gap: 10, paddingBottom: 24 }, hero: { height: 150, borderRadius: 16, backgroundColor: '#D9EBDD', alignItems: 'center', justifyContent: 'center', gap: 8 }, heroEmoji: { color: '#508664', fontSize: 74 }, heroBadge: { color: C.forest, fontFamily: F.bold, fontSize: 9, letterSpacing: 0.8 }, titleRow: { flexDirection: 'row', alignItems: 'flex-start' }, copy: { flex: 1 }, title: { color: C.forest, fontFamily: F.bold, fontSize: 21 }, latin: { color: C.mutedText, fontFamily: F.regular, fontStyle: 'italic', fontSize: 12 }, tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 }, tag: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 99, backgroundColor: '#DDF2E4', color: C.forest, fontFamily: F.semiBold, fontSize: 10 },
  card: { padding: 12, borderRadius: 14, backgroundColor: C.surface, gap: 3 }, sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14, marginBottom: 3 }, infoRow: { paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2EAE3', gap: 2 }, infoLabel: { color: C.secondaryText, fontFamily: F.regular, fontSize: 10 }, infoValue: { color: C.text, fontFamily: F.semiBold, fontSize: 11, lineHeight: 17 }, note: { color: C.mutedText, fontFamily: F.regular, fontSize: 9, lineHeight: 14 }, actions: { gap: 8 }, primaryButton: { minHeight: 44, paddingHorizontal: 10, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: C.surface, fontFamily: F.semiBold, fontSize: 12 },
});
