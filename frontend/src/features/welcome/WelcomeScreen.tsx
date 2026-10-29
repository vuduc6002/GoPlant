import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ArrowIcon from '@/assets/images/figma/welcome/arrow-right.svg';
import BadgeLeafIcon from '@/assets/images/figma/welcome/badge-leaf.svg';
import CameraIcon from '@/assets/images/figma/welcome/icon-camera.svg';
import DropIcon from '@/assets/images/figma/welcome/icon-drop.svg';
import HeartIcon from '@/assets/images/figma/welcome/icon-heart.svg';
import LanguageIcon from '@/assets/images/figma/welcome/language.svg';
import PotIcon from '@/assets/images/figma/welcome/pot.svg';
import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';

const features = [
  {
    title: 'Quản lý khoa học',
    badge: 'Khu vườn',
    description: 'Phân loại từng chậu cây, vị trí ánh sáng & độ ẩm',
    color: '#E5F6ED',
    badgeColor: C.mint,
    icon: PotIcon,
  },
  {
    title: 'Lịch chăm chuẩn xác',
    badge: 'Đúng hẹn',
    description: 'Nhắc nhở tưới nước, bón phân & tỉa lá theo chu kỳ',
    color: '#CFF8E4',
    badgeColor: '#E8F0E9',
    icon: DropIcon,
  },
  {
    title: 'Nhật ký sinh trưởng',
    badge: 'Ghi chép',
    description: 'Lưu lại hành trình nảy mầm và phát triển từng ngày',
    color: '#FFF0E9',
    badgeColor: C.peach,
    icon: CameraIcon,
  },
];

export default function WelcomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.brand}>
          <View style={styles.logoShell}>
            <Image
              source={require('@/assets/images/figma/welcome/logo.jpeg')}
              style={styles.logo}
              contentFit="contain"
            />
            <View style={styles.brandBadge}>
              <BadgeLeafIcon width={10} height={10} />
            </View>
          </View>
          <Text style={styles.brandName}>GoPlant</Text>
          <Text style={styles.tagline}>VƯỜN XANH TRONG TAY BẠN</Text>
        </View>

        <View style={styles.intro}>
          <Text style={styles.title}>Chào mừng bạn đến với GoPlant</Text>
          <Text style={styles.subtitle}>
            Nuôi dưỡng mầm xanh, lan tỏa không gian sống an lành và gắn kết từng chiếc lá trong ngôi nhà của bạn.
          </Text>
        </View>

        <View style={styles.featureList}>
          {features.map(({ title, badge, description, color, badgeColor, icon: Icon }) => (
            <View key={title} style={styles.featureCard}>
              <View style={[styles.featureIcon, { backgroundColor: color }]}>
                <Icon width={22} height={22} />
              </View>
              <View style={styles.featureCopy}>
                <View style={styles.featureHeading}>
                  <Text style={styles.featureTitle}>{title}</Text>
                  <Text style={[styles.featureBadge, { backgroundColor: badgeColor }]}>{badge}</Text>
                </View>
                <Text style={styles.featureDescription}>{description}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.communityBanner}>
          <View style={styles.avatarStack}>
            <Text style={[styles.avatar, styles.avatarOne]}>🌱</Text>
            <Text style={[styles.avatar, styles.avatarTwo]}>🌿</Text>
            <Text style={[styles.avatar, styles.avatarThree]}>🪴</Text>
          </View>
          <Text style={styles.communityText}>Hơn 12.000 chậu cây đang lớn lên mỗi ngày</Text>
          <HeartIcon width={15} height={14} />
        </View>

        <View style={styles.spacer} />
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/auth/register')}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryLabel}>Bắt đầu ngay</Text>
            <ArrowIcon width={14} height={14} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/auth/login')}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryLabel}>Tôi đã có tài khoản • </Text>
            <Text style={styles.loginLabel}>Đăng nhập</Text>
          </Pressable>
          <View style={styles.languagePill}>
            <LanguageIcon width={12} height={12} />
            <Text style={styles.languageLabel}>VN</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.background },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  brand: { alignItems: 'center', paddingTop: 6 },
  logoShell: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.forest,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  logo: { width: 80, height: 80, borderRadius: 40 },
  brandBadge: {
    position: 'absolute',
    right: -4,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { marginTop: 8, color: C.forest, fontFamily: F.bold, fontSize: 26, lineHeight: 34, letterSpacing: -0.65 },
  tagline: { color: '#3B6752', fontFamily: F.semiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0.6, marginTop: 1 },
  intro: { alignItems: 'center', marginTop: 14, paddingHorizontal: 4 },
  title: { color: C.text, fontFamily: F.semiBold, fontSize: 20, lineHeight: 28, letterSpacing: -0.2, textAlign: 'center' },
  subtitle: { maxWidth: 320, color: C.secondaryText, fontFamily: F.regular, fontSize: 14, lineHeight: 22.75, textAlign: 'center', marginTop: 3 },
  featureList: { gap: 8, marginTop: 14 },
  featureCard: {
    minHeight: 76,
    padding: 14,
    borderRadius: 12,
    backgroundColor: C.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: C.forest,
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  featureIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  featureCopy: { flex: 1, gap: 2 },
  featureHeading: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  featureTitle: { color: C.text, fontFamily: F.semiBold, fontSize: 18, lineHeight: 24 },
  featureBadge: { overflow: 'hidden', color: C.forest, fontFamily: F.bold, fontSize: 10, lineHeight: 14, letterSpacing: 0.3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  featureDescription: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 18 },
  communityBanner: { minHeight: 56, marginTop: 16, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: C.softSurface, flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 28, height: 28, borderRadius: 14, textAlign: 'center', textAlignVertical: 'center', fontSize: 13, overflow: 'hidden', borderWidth: 1, borderColor: C.softSurface },
  avatarOne: { backgroundColor: '#A1D1B8' },
  avatarTwo: { backgroundColor: C.brightMint, marginLeft: -8 },
  avatarThree: { backgroundColor: C.peach, marginLeft: -8 },
  communityText: { flex: 1, color: C.secondaryText, fontFamily: F.semiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0.1 },
  spacer: { flexGrow: 1, minHeight: 16 },
  actions: { gap: 8 },
  primaryButton: { height: 48, paddingHorizontal: 16, borderRadius: 12, backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  primaryLabel: { color: C.surface, fontFamily: F.semiBold, fontSize: 14, lineHeight: 20, letterSpacing: 0.14 },
  secondaryButton: { height: 48, borderRadius: 12, backgroundColor: '#E8F0E9', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  secondaryLabel: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 14, lineHeight: 20 },
  loginLabel: { color: C.forest, fontFamily: F.bold, fontSize: 14, lineHeight: 20 },
  languagePill: { alignSelf: 'flex-end', marginTop: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#E3EAE4', flexDirection: 'row', alignItems: 'center', gap: 4 },
  languageLabel: { color: C.text, fontFamily: F.bold, fontSize: 10, lineHeight: 14, letterSpacing: 0.4 },
  pressed: { opacity: 0.82 },
});
