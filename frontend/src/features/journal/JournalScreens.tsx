import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';

function Header({ title }: { title: string }) { return <View style={j.header}><Pressable onPress={() => router.back()}><Text style={j.back}>‹</Text></Pressable><Text style={j.headerTitle}>{title}</Text><Pressable onPress={() => Alert.alert('Bản xem trước', 'Tài khoản chưa kết nối.')}><Text style={j.profile}>G</Text></Pressable></View>; }

export function JournalDetailScreen() {
  return <SafeAreaView style={j.safe} edges={['top']}><Header title="Nhật ký phát triển"/><ScrollView contentContainerStyle={j.content}>
    <View style={j.plantCard}><View style={j.thumb}><Text style={j.emoji}>🍅</Text></View><View style={j.copy}><Text style={j.title}>Cà Chua Cherry</Text><Text style={j.body}>Ban Công Tầng 3 • Đang ra trái</Text><Text style={j.tag}>Khỏe mạnh</Text></View></View>
    <View style={j.card}><Text style={j.sectionTitle}>Hồ sơ phát triển</Text><Text style={j.body}>Cập nhật theo dõi sức khỏe và lịch sử chăm sóc của cây.</Text><View style={j.metrics}>{[['45 ngày', 'Tuổi cây'], ['4 lần', 'Ghi nhận'], ['Tốt', 'Tình trạng']].map(([a,b]) => <View style={j.metric} key={b}><Text style={j.metricValue}>{a}</Text><Text style={j.body}>{b}</Text></View>)}</View></View>
    <View style={j.card}><View style={j.row}><Text style={j.sectionTitle}>Nhật ký theo thời gian</Text><Text style={j.tag}>4 ghi nhận</Text></View>{[
      ['26/10/2025', 'Cây đang ra quả, lá xanh khỏe', 'Tưới nước • Đã bổ sung dinh dưỡng'],
      ['18/10/2025', 'Phát hiện một số lá vàng nhẹ', 'Đã cắt tỉa lá hỏng và kiểm tra đất'],
      ['05/10/2025', 'Cây thích nghi tốt với vị trí mới', 'Theo dõi độ ẩm • Không phát hiện sâu bệnh'],
    ].map(([date, title, note]) => <View key={date} style={j.entry}><Text style={j.date}>{date} • Ban công</Text><Text style={j.titleSmall}>{title}</Text><Text style={j.body}>{note}</Text><View style={j.photoRow}><View style={j.photo}><Text>🌱</Text></View><View style={j.photo}><Text>🍃</Text></View></View><Pressable onPress={() => router.push('/journal/edit' as never)}><Text style={j.link}>Chỉnh sửa ghi nhận ›</Text></Pressable></View>)}</View>
    <Pressable onPress={() => router.push('/journal/new' as never)} style={j.submit}><Text style={j.submitText}>＋  Thêm ghi nhận mới</Text></Pressable><Text style={j.note}>Nhật ký này dùng dữ liệu mẫu, chưa lưu lên máy chủ.</Text>
  </ScrollView></SafeAreaView>;
}

function JournalForm({ editing = false }: { editing?: boolean }) {
  const [plant, setPlant] = useState(editing ? 'Cà Chua Cherry' : '');
  const [note, setNote] = useState('');
  const [type, setType] = useState('Phát triển');
  const [health, setHealth] = useState('Khỏe mạnh');
  const [error, setError] = useState(false);
  const save = () => { const invalid = !plant || !note.trim(); setError(invalid); if (!invalid) Alert.alert('Bản xem trước', 'Ghi nhận hợp lệ nhưng chưa được lưu vì chưa có backend.'); };
  return <SafeAreaView style={j.safe} edges={['top']}><Header title={editing ? 'Chỉnh sửa nhật ký' : 'Thêm ghi nhận mới'}/><ScrollView contentContainerStyle={j.content}>
    <View style={j.tip}><Text style={j.sectionTitle}>{editing ? 'Cập nhật nhật ký cây' : 'Ghi nhận tình trạng cây'}</Text><Text style={j.body}>Lưu lại tình trạng và tiến triển để tiện theo dõi.</Text></View>
    <Text style={j.label}>1. Chọn cây trồng <Text style={j.required}>*</Text></Text>{['Cà Chua Cherry', 'Hương Thảo (Rosemary)', 'Hồng leo Huntington'].map((name, i) => <Pressable key={name} onPress={() => setPlant(name)} style={[j.plantCard, plant === name && j.selected]}><View style={j.thumbSmall}><Text>{['🍅','🌿','🌸'][i]}</Text></View><Text style={j.titleSmall}>{name}</Text><Text style={j.radio}>{plant === name ? '●' : '○'}</Text></Pressable>)}
    <Text style={j.label}>2. Loại ghi nhận</Text><View style={j.chips}>{['Phát triển', 'Tưới nước', 'Bón phân', 'Sâu bệnh'].map((name) => <Pressable key={name} onPress={() => setType(name)} style={[j.chip, type === name && j.selected]}><Text style={j.body}>{name}</Text></Pressable>)}</View>
    <Text style={j.label}>3. Tình trạng cây</Text><View style={j.chips}>{['Khỏe mạnh', 'Cần theo dõi', 'Cần can thiệp'].map((name) => <Pressable key={name} onPress={() => setHealth(name)} style={[j.chip, health === name && j.selected]}><Text style={j.body}>{name}</Text></Pressable>)}</View>
    <Text style={j.label}>4. Hình ảnh tham khảo</Text><View style={j.photoRow}><Pressable onPress={() => Alert.alert('Camera chưa bật', 'Camera đang được hoãn theo phạm vi hiện tại.')} style={j.addPhoto}><Text style={j.photoAdd}>＋</Text><Text style={j.body}>Thêm ảnh sau</Text></Pressable><View style={j.addPhoto}><Text style={j.photoAdd}>🌿</Text><Text style={j.body}>Ảnh minh họa</Text></View></View>
    <Text style={j.label}>5. Ghi chú <Text style={j.required}>*</Text></Text><TextInput value={note} onChangeText={setNote} multiline placeholder="Mô tả tình trạng, biện pháp chăm sóc..." style={[j.input, j.multiline, error && !note.trim() && j.errorBorder]} />
    <Text style={j.label}>Ngày ghi nhận</Text><TextInput value="Hôm nay" editable={false} style={j.input}/>
    {error ? <Text style={j.errorText}>Chọn cây và nhập ghi chú để tiếp tục.</Text> : null}<Pressable onPress={save} style={j.submit}><Text style={j.submitText}>{editing ? 'Lưu thay đổi' : 'Lưu ghi nhận'}</Text></Pressable><Text style={j.note}>Lưu hiện chỉ kiểm tra dữ liệu giao diện, chưa tạo nhật ký thật.</Text>
  </ScrollView></SafeAreaView>;
}

export function NewJournalScreen() { return <JournalForm/>; }
export function EditJournalScreen() { return <JournalForm editing/>; }

const j = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background }, header: { height: 52, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, back: { color: C.forest, fontSize: 29 }, headerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 }, profile: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.forest, color: C.surface, fontFamily: F.bold, textAlign: 'center', textAlignVertical: 'center' }, content: { padding: 13, gap: 9, paddingBottom: 24 }, plantCard: { padding: 9, borderRadius: 12, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 9 }, thumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#E6F0E8', alignItems: 'center', justifyContent: 'center' }, emoji: { fontSize: 26 }, copy: { flex: 1, gap: 3 }, title: { color: C.forest, fontFamily: F.bold, fontSize: 15 }, body: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 17 }, tag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: '#DDF2E4', color: C.forest, fontFamily: F.semiBold, fontSize: 9 }, card: { padding: 11, borderRadius: 13, backgroundColor: C.surface, gap: 8 }, sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 }, metrics: { flexDirection: 'row', gap: 6 }, metric: { flex: 1, padding: 8, borderRadius: 9, backgroundColor: C.softSurface }, metricValue: { color: C.forest, fontFamily: F.bold, fontSize: 13 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, entry: { paddingTop: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DFE9E1', gap: 5 }, date: { color: C.primary, fontFamily: F.semiBold, fontSize: 9 }, titleSmall: { color: C.text, fontFamily: F.semiBold, fontSize: 12 }, photoRow: { flexDirection: 'row', gap: 8, marginVertical: 3 }, photo: { flex: 1, height: 90, borderRadius: 10, backgroundColor: '#E0EEE3', alignItems: 'center', justifyContent: 'center' }, link: { color: C.primary, fontFamily: F.semiBold, fontSize: 10 }, submit: { minHeight: 44, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }, submitText: { color: C.surface, fontFamily: F.semiBold, fontSize: 12 }, note: { color: C.mutedText, fontFamily: F.regular, textAlign: 'center', fontSize: 9 }, tip: { padding: 12, borderRadius: 11, backgroundColor: C.softSurface, gap: 3 }, label: { marginTop: 3, color: C.text, fontFamily: F.semiBold, fontSize: 12 }, required: { color: C.terracotta }, thumbSmall: { width: 34, height: 34, borderRadius: 8, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' }, selected: { borderWidth: 1, borderColor: C.primary, backgroundColor: '#E5F4E9' }, radio: { marginLeft: 'auto', color: C.primary }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, chip: { paddingHorizontal: 9, paddingVertical: 8, borderRadius: 9, backgroundColor: C.surface }, addPhoto: { flex: 1, height: 90, borderRadius: 10, borderWidth: 1, borderColor: '#D5E3D8', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface }, photoAdd: { color: C.primary, fontSize: 20 }, input: { minHeight: 42, paddingHorizontal: 10, borderRadius: 9, backgroundColor: C.surface, fontFamily: F.regular, fontSize: 11 }, multiline: { minHeight: 90, paddingTop: 10, textAlignVertical: 'top' }, errorBorder: { borderWidth: 1, borderColor: '#B42318' }, errorText: { color: '#B42318', fontFamily: F.regular, fontSize: 11 },
});
