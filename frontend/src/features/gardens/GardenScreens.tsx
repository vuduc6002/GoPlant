import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { plantCatalog, usePlantData } from '@/features/plants/PlantDataStore';

const gardenPlants = [
  ['Cà Chua Cherry', 'Đang ra trái • Cần tưới nước', '🍅'],
  ['Hương Thảo (Rosemary)', 'Khỏe mạnh • Ánh sáng tốt', '🌿'],
  ['Hồng leo Huntington', 'Đang nở hoa • Theo dõi độ ẩm', '🌸'],
  ['Bạc Hà Peppermint', 'Đang phát triển • Chăm sóc định kỳ', '🌱'],
];

function GardenHeader({ title }: { title: string }) {
  return <View style={g.header}><Pressable onPress={() => router.back()} style={g.back}><Text style={g.backText}>‹</Text></Pressable><Text style={g.headerTitle}>{title}</Text><Pressable onPress={() => Alert.alert('Bản xem trước', 'Tùy chọn tài khoản chưa kết nối.')}><Text style={g.profile}>G</Text></Pressable></View>;
}

function ActionButton({ label, secondary = false, onPress }: { label: string; secondary?: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[g.action, secondary && g.actionSecondary]}><Text style={[g.actionText, secondary && g.actionTextSecondary]}>{label}</Text></Pressable>;
}

export function GardenDetailScreen() {
  const info = () => Alert.alert('Bản xem trước', 'Tính năng này dùng dữ liệu mẫu, chưa lưu lên máy chủ.');
  return <SafeAreaView style={g.safe} edges={['top']}><GardenHeader title="Chi tiết khu vườn"/><ScrollView contentContainerStyle={g.content}>
    <View style={g.hero}><Text style={g.heroPlant}>♧</Text><Text style={g.heroLabel}>BAN CÔNG TẦNG 3</Text></View>
    <Text style={g.title}>Ban Công Tầng 3 - Hướng Đông</Text><Text style={g.body}>⌖  Căn hộ 302, Tòa Thảo Mộc</Text>
    <View style={g.metrics}>{[['28°C', 'Nhiệt độ'], ['72%', 'Độ ẩm'], ['5 giờ', 'Ánh sáng']].map(([x,y]) => <View key={y} style={g.metric}><Text style={g.metricValue}>{x}</Text><Text style={g.body}>{y}</Text></View>)}</View>
    <View style={g.card}><Text style={g.sectionTitle}>Tổng quan khu vườn</Text><Text style={g.body}>12 cây đang trồng • Chăm sóc định kỳ • Ánh sáng hướng Đông</Text><View style={g.row}><ActionButton label="Chỉnh sửa vườn" secondary onPress={info}/><ActionButton label="Chia sẻ" secondary onPress={info}/></View></View>
    <View style={g.card}><View style={g.row}><Text style={g.sectionTitle}>Lịch chăm sóc ban công</Text><Text style={g.link}>Xem lịch ›</Text></View>{[['💧', 'Tưới nước mỗi ngày', '08:00'], ['◉', 'Kiểm tra độ ẩm', '10:00'], ['✂', 'Cắt tỉa cành', 'Thứ Sáu']].map(([i,t,v]) => <View key={t} style={g.row}><Text style={g.icon}>{i}</Text><Text style={g.body}>{t}</Text><Text style={g.time}>{v}</Text></View>)}</View>
    <View style={g.row}><Text style={g.sectionTitle}>Cây đang trồng (12)</Text><Pressable onPress={() => router.push('/garden/add-plant' as never)}><Text style={g.link}>＋ Thêm cây</Text></Pressable></View>
    {gardenPlants.map(([name, detail, emoji]) => <View key={name} style={g.plantCard}><View style={g.plantImage}><Text style={g.plantEmoji}>{emoji}</Text></View><View style={g.plantCopy}><Text style={g.plantName}>{name}</Text><Text style={g.body}>{detail}</Text></View><Pressable onPress={() => router.push({ pathname: '/plant-detail', params: { name } } as never)}><Text style={g.link}>›</Text></Pressable></View>)}
    <ActionButton label="Thêm cây vào khu vườn" onPress={() => router.push('/garden/add-plant' as never)}/><Text style={g.note}>Dữ liệu khu vườn là mẫu giao diện, thao tác chưa lưu dữ liệu thật.</Text>
  </ScrollView></SafeAreaView>;
}

function GardenForm({ addPlant = false }: { addPlant?: boolean }) {
  const params = useLocalSearchParams<{ editId?: string; plantId?: string }>();
  const { ownedPlants, addPlant: createOwnedPlant, updatePlant } = usePlantData();
  const editId = params.editId;
  const editingPlant = editId ? ownedPlants.find((item) => item.id === editId) : undefined;
  const initialCatalogId = params.plantId ?? editingPlant?.catalogId ?? '';
  const initialCatalogPlant = plantCatalog.find((plant) => plant.id === initialCatalogId);
  const [name, setName] = useState(editingPlant?.name ?? initialCatalogPlant?.name ?? '');
  const [place, setPlace] = useState(editingPlant?.location ?? '');
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState(addPlant ? initialCatalogId : '');
  const [plantedAt, setPlantedAt] = useState(editingPlant?.plantedAt ?? '');
  const [note, setNote] = useState(editingPlant?.note ?? '');
  const [plantQuery, setPlantQuery] = useState('');
  const title = editId ? 'Chỉnh sửa hồ sơ cây' : addPlant ? 'Thêm cây trồng' : 'Tạo khu vườn mới';
  const selectedProfile = plantCatalog.find((plant) => plant.id === selected);
  const submit = () => {
    const invalid = addPlant ? !selectedProfile || !name.trim() || !place : !name.trim() || !place.trim();
    setError(invalid);
    if (invalid) return;
    if (addPlant && selectedProfile) {
      const profile = {
        catalogId: selectedProfile.id,
        name: name.trim(),
        scientificName: selectedProfile.scientificName,
        category: selectedProfile.category,
        plantedAt: plantedAt.trim(),
        location: place,
        note: note.trim(),
      };
      if (editId) updatePlant(editId, profile);
      else createOwnedPlant(profile);
      router.replace('/plants' as never);
      return;
    }
    Alert.alert('Bản xem trước', 'Thông tin hợp lệ nhưng chưa được lưu vì ứng dụng chưa kết nối backend.');
  };
  return <SafeAreaView style={g.safe} edges={['top']}><GardenHeader title={title}/><ScrollView contentContainerStyle={g.content}>
    <View style={g.tip}><Text style={g.sectionTitle}>{addPlant ? 'Thêm cây vào khu vườn' : 'Thiết lập không gian xanh'}</Text><Text style={g.body}>{addPlant ? 'Chọn cây và khu vực trồng phù hợp.' : 'Tạo khu vườn để quản lý cây và lịch chăm sóc.'}</Text></View>
    {!addPlant ? <><Text style={g.label}>Tên khu vườn <Text style={g.required}>*</Text></Text><TextInput value={name} onChangeText={setName} placeholder="Ví dụ: Ban công tầng 3" style={[g.input, error && !name.trim() && g.inputError]}/><Text style={g.label}>Vị trí <Text style={g.required}>*</Text></Text><TextInput value={place} onChangeText={setPlace} placeholder="Địa chỉ hoặc khu vực trồng" style={[g.input, error && !place.trim() && g.inputError]}/><Text style={g.label}>Chọn loại không gian</Text><View style={g.choices}>{['Ban công', 'Sân thượng', 'Trong nhà'].map((x) => <Pressable key={x} onPress={() => setSelected(x)} style={[g.choice, selected === x && g.choiceActive]}><Text style={g.body}>{x}</Text></Pressable>)}</View><View style={g.heroSmall}><Text style={g.heroPlant}>▧</Text><Text style={g.body}>Ảnh bìa khu vườn • Chọn ảnh</Text></View><Text style={g.label}>Mô tả (không bắt buộc)</Text><TextInput placeholder="Thêm ghi chú cho khu vườn..." style={[g.input, g.multiline]} multiline/></> : <>
      <Text style={g.label}>Tìm cây trong thư viện</Text><TextInput value={plantQuery} onChangeText={setPlantQuery} placeholder="Nhập tên cây hoặc tên khoa học" style={g.input}/><Text style={g.label}>1. Chọn cây trồng</Text>{plantCatalog.filter((plant) => `${plant.name} ${plant.scientificName}`.toLocaleLowerCase().includes(plantQuery.trim().toLocaleLowerCase())).map((plant) => <Pressable key={plant.id} onPress={() => { setSelected(plant.id); if (!name.trim() || plantCatalog.some((item) => item.name === name)) setName(plant.name); }} style={[g.plantCard, selected === plant.id && g.choiceActive]}><View style={g.plantImage}><Text style={g.plantEmoji}>♧</Text></View><View style={g.plantCopy}><Text style={g.plantName}>{plant.name}</Text><Text style={g.body}>{plant.scientificName} • {plant.category} • Dữ liệu thư viện mẫu</Text></View><Text style={g.link}>{selected === plant.id ? '✓' : 'Chọn'}</Text></Pressable>)}
      {selectedProfile ? <><Text style={g.label}>Tên hiển thị <Text style={g.required}>*</Text></Text><TextInput value={name} onChangeText={setName} placeholder="Tên cây trong hồ sơ của bạn" style={[g.input, error && !name.trim() && g.inputError]}/><Text style={g.label}>2. Vị trí trồng</Text><View style={g.choices}>{['Trong nhà', 'Ban công', 'Sân thượng', 'Sân vườn', 'Ngoài sân', 'Nhà kính', 'Khác', 'Chưa xác định'].map((x) => <Pressable key={x} onPress={() => setPlace(x)} style={[g.choice, place === x && g.choiceActive]}><Text style={g.body}>{x}</Text></Pressable>)}</View><Text style={g.label}>Ngày trồng / bắt đầu chăm sóc (không bắt buộc)</Text><TextInput value={plantedAt} onChangeText={setPlantedAt} placeholder="Ngày/tháng/năm" style={g.input}/><Text style={g.label}>Ghi chú (không bắt buộc)</Text><TextInput value={note} onChangeText={setNote} placeholder="Ghi chú về cây" style={[g.input, g.multiline]} multiline/></> : null}
      </>}
    {error ? <Text style={g.error}>Vui lòng nhập đầy đủ thông tin bắt buộc.</Text> : null}
    <ActionButton label={addPlant ? 'Thêm cây vào vườn' : 'Tạo khu vườn'} onPress={submit}/><Text style={g.note}>Đây là biểu mẫu giao diện; chưa tạo hoặc lưu dữ liệu thật.</Text>
  </ScrollView></SafeAreaView>;
}

export function CreateGardenScreen() { return <GardenForm/>; }
export function AddGardenPlantScreen() { return <GardenForm addPlant/>; }

const g = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background }, header: { height: 52, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, back: { width: 34 }, backText: { color: C.forest, fontSize: 29 }, headerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 }, profile: { width: 29, height: 29, borderRadius: 15, overflow: 'hidden', backgroundColor: C.forest, color: C.surface, textAlign: 'center', textAlignVertical: 'center', fontFamily: F.bold },
  content: { padding: 13, gap: 9, paddingBottom: 24 }, hero: { height: 180, borderRadius: 15, backgroundColor: '#DCEDE0', alignItems: 'center', justifyContent: 'center' }, heroPlant: { color: '#508664', fontSize: 64 }, heroLabel: { color: C.forest, fontFamily: F.bold, fontSize: 10, letterSpacing: 1 }, title: { color: C.forest, fontFamily: F.bold, fontSize: 19 }, body: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 17 }, metrics: { flexDirection: 'row', gap: 7 }, metric: { flex: 1, padding: 9, borderRadius: 11, backgroundColor: C.surface }, metricValue: { color: C.forest, fontFamily: F.bold, fontSize: 15 }, card: { padding: 11, borderRadius: 14, backgroundColor: C.surface, gap: 8 }, sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' }, link: { color: C.primary, fontFamily: F.semiBold, fontSize: 11 }, icon: { color: C.forest, fontSize: 16 }, time: { color: C.primary, fontFamily: F.semiBold, fontSize: 10 }, plantCard: { minHeight: 66, padding: 8, borderRadius: 12, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 9 }, plantImage: { width: 46, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.softSurface }, plantEmoji: { fontSize: 22 }, plantCopy: { flex: 1 }, plantName: { color: C.forest, fontFamily: F.semiBold, fontSize: 12 }, action: { minHeight: 44, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }, actionText: { color: C.surface, fontFamily: F.semiBold, fontSize: 12 }, actionSecondary: { backgroundColor: C.softSurface }, actionTextSecondary: { color: C.forest }, note: { color: C.mutedText, fontFamily: F.regular, fontSize: 9, textAlign: 'center' },
  tip: { padding: 12, borderRadius: 12, backgroundColor: C.softSurface, gap: 4 }, label: { color: C.text, fontFamily: F.semiBold, fontSize: 12, marginTop: 4 }, required: { color: C.terracotta }, input: { minHeight: 44, paddingHorizontal: 12, borderRadius: 9, backgroundColor: C.surface, color: C.text, fontFamily: F.regular, fontSize: 12 }, inputError: { borderWidth: 1, borderColor: '#C62828' }, multiline: { height: 80, textAlignVertical: 'top', paddingTop: 10 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, choice: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 9, backgroundColor: C.surface }, choiceActive: { borderWidth: 1, borderColor: C.primary, backgroundColor: '#E0F2E6' }, heroSmall: { height: 100, borderRadius: 12, backgroundColor: '#E0EEE3', alignItems: 'center', justifyContent: 'center' }, error: { color: '#B42318', fontFamily: F.regular, fontSize: 11 },
});
