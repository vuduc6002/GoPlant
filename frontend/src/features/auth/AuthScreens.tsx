import { useMemo, useState, type ComponentType } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SvgProps } from 'react-native-svg';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { authenticateWithMockAuth } from '@/services/mockAuth';
import RegisterPot from '@/assets/images/figma/auth/signup/signup-23ac7.svg';
import RegisterLeaf from '@/assets/images/figma/auth/signup/signup-30c2d.svg';
import UserIcon from '@/assets/images/figma/auth/signup/signup-eecde.svg';
import ContactIcon from '@/assets/images/figma/auth/signup/signup-f43c0.svg';
import MailIcon from '@/assets/images/figma/auth/signup/signup-130e3.svg';
import InfoIcon from '@/assets/images/figma/auth/signup/signup-949a5.svg';
import PhoneIcon from '@/assets/images/figma/auth/signup/signup-94c92.svg';
import ComputerIcon from '@/assets/images/figma/auth/signup/signup-80770.svg';
import LockIcon from '@/assets/images/figma/auth/signup/signup-ce71f.svg';
import EyeIcon from '@/assets/images/figma/auth/signup/signup-289be.svg';
import ShieldIcon from '@/assets/images/figma/auth/signup/signup-a7ee7.svg';
import RegisterActionIcon from '@/assets/images/figma/auth/signup/signup-c0ac2.svg';
import BackIcon from '@/assets/images/figma/auth/signup/signup-9c8d3.svg';
import ProfileIcon from '@/assets/images/figma/auth/signup/signup-59e02.svg';
import LoginPlant from '@/assets/images/figma/auth/login/login-c77aa.svg';
import LoginLeaf from '@/assets/images/figma/auth/login/login-e636a.svg';
import LoginUser from '@/assets/images/figma/auth/login/login-71039.svg';
import LoginLock from '@/assets/images/figma/auth/login/login-7b228.svg';
import LoginEye from '@/assets/images/figma/auth/login/login-26e47.svg';

type IconType = ComponentType<SvgProps>;

function ScreenHeader({ title }: { title: string }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" onPress={() => router.back()} style={styles.headerButton}>
        <BackIcon width={16} height={16} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={[styles.headerButton, styles.profileButton]}>
        <ProfileIcon width={16} height={16} />
      </View>
    </View>
  );
}

function Field({
  label,
  placeholder,
  icon: Icon,
  value,
  onChangeText,
  error,
  secureTextEntry,
  onToggleSecure,
  keyboardType,
  optional,
}: {
  label: string;
  placeholder: string;
  icon: IconType;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  secureTextEntry?: boolean;
  onToggleSecure?: () => void;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  optional?: boolean;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {optional ? <Text style={styles.optionalPill}>An toàn</Text> : <Text style={styles.required}>*</Text>}
      </View>
      <View style={[styles.inputShell, error && styles.inputError]}>
        <Icon width={17} height={17} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.mutedText}
          style={styles.input}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
          autoCorrect={false}
        />
        {onToggleSecure ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Hiện hoặc ẩn mật khẩu" onPress={onToggleSecure} style={styles.eyeButton}>
            <EyeIcon width={18} height={14} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function InlineUnavailable(message: string) {
  Alert.alert('Chưa kết nối dịch vụ', message);
}

export function RegisterScreen() {
  const [name, setName] = useState('');
  const [account, setAccount] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [device, setDevice] = useState<'mobile' | 'pc'>('mobile');
  const [accepted, setAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showValidationSummary, setShowValidationSummary] = useState(false);

  const strength = useMemo(() => {
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
    if (/\d|[^A-Za-z0-9]/.test(password)) score += 1;
    return score;
  }, [password]);

  const submit = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Vui lòng nhập họ và tên.';
    if (!account.trim()) next.account = 'Vui lòng nhập email hoặc số điện thoại.';
    if (password.length < 8) next.password = 'Mật khẩu cần có ít nhất 8 ký tự.';
    if (!confirm || confirm !== password) next.confirm = 'Mật khẩu xác nhận chưa khớp.';
    if (!accepted) next.terms = 'Vui lòng đồng ý với điều khoản để tiếp tục.';
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setShowValidationSummary(true);
    } else {
      InlineUnavailable('Đăng ký tài khoản chưa kết nối backend trong phiên bản frontend này.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScreenHeader title="Register" />
      <ScrollView contentContainerStyle={styles.registerContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.registerHero}>
          <View style={styles.registerLogo}><RegisterPot width={22} height={24} /></View>
          <Text style={styles.registerTitle}>Tạo tài khoản mới</Text>
          <Text style={styles.registerSubtitle}>Bắt đầu hành trình gieo mầm và chăm sóc vườn xanh của riêng bạn</Text>
        </View>

        <View style={styles.factBanner}>
          <View style={styles.factIcon}><RegisterLeaf width={13} height={13} /></View>
          <Text style={styles.factText}>Cùng hơn <Text style={styles.factStrong}>12.000+</Text> người yêu cây số hóa không gian xanh mỗi ngày.</Text>
        </View>

        <View style={styles.form}>
          <Field label="Họ và tên" placeholder="Ví dụ: Nguyễn Văn An" icon={UserIcon} value={name} onChangeText={setName} error={errors.name} />
          <Field label="Số điện thoại hoặc Email" placeholder="Nhập số điện thoại hoặc email" icon={ContactIcon} value={account} onChangeText={setAccount} error={errors.account} keyboardType="email-address" />
          <View style={styles.recoveryField}>
            <Field label="Email khôi phục tài khoản" placeholder="Email dự phòng khi cần lấy lại mật khẩu" icon={MailIcon} value={recoveryEmail} onChangeText={setRecoveryEmail} optional keyboardType="email-address" />
            <View style={styles.helperRow}><InfoIcon width={13} height={13} /><Text style={styles.helperText}>Dùng để xác minh bảo mật khi bạn quên mật khẩu</Text></View>
          </View>

          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Thiết bị sử dụng chính</Text>
              <Text style={styles.deviceHint}>Tối ưu giao diện</Text>
            </View>
            <View style={styles.deviceSelector}>
              <Pressable onPress={() => setDevice('mobile')} style={[styles.deviceOption, device === 'mobile' && styles.deviceOptionSelected]}>
                <PhoneIcon width={13} height={17} /><Text style={[styles.deviceLabel, device === 'mobile' && styles.deviceLabelSelected]}>Mobile (Điện thoại)</Text>
              </Pressable>
              <Pressable onPress={() => setDevice('pc')} style={[styles.deviceOption, device === 'pc' && styles.deviceOptionSelected]}>
                <ComputerIcon width={18} height={13} /><Text style={styles.deviceLabel}>PC (Máy tính)</Text>
              </Pressable>
            </View>
          </View>

          <Field label="Mật khẩu" placeholder="Tối thiểu 8 ký tự" icon={LockIcon} value={password} onChangeText={setPassword} error={errors.password} secureTextEntry={!showPassword} onToggleSecure={() => setShowPassword((value) => !value)} />
          <View style={styles.strengthArea}>
            <View style={styles.strengthBars}>{[1, 2, 3].map((part) => <View key={part} style={[styles.strengthBar, part <= strength && styles.strengthBarActive]} />)}</View>
            <View style={styles.strengthLabels}><Text style={styles.helperText}>Độ mạnh: {strength === 0 ? 'Chưa nhập' : strength === 1 ? 'Yếu' : strength === 2 ? 'Trung bình' : 'Mạnh'}</Text><Text style={styles.helperText}>Nên gồm chữ, số & ký tự đặc biệt</Text></View>
          </View>
          <Field label="Nhập lại mật khẩu" placeholder="Nhập lại mật khẩu đã tạo" icon={ShieldIcon} value={confirm} onChangeText={setConfirm} error={errors.confirm} secureTextEntry={!showPassword} onToggleSecure={() => setShowPassword((value) => !value)} />

          <Pressable onPress={() => setAccepted((value) => !value)} style={styles.termsRow} accessibilityRole="checkbox" accessibilityState={{ checked: accepted }}>
            <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>{accepted ? <Text style={styles.checkmark}>✓</Text> : null}</View>
            <Text style={styles.termsText}>Tôi đồng ý với <Text style={styles.inlineLink}>Điều khoản dịch vụ</Text> và <Text style={styles.inlineLink}>Chính sách bảo mật</Text> của MiniApp Quản Lý Cây Trồng.</Text>
          </Pressable>
          {errors.terms ? <Text style={styles.errorText}>{errors.terms}</Text> : null}

          <Pressable onPress={submit} style={({ pressed }) => [styles.submitButton, pressed && styles.pressed]} accessibilityRole="button">
            <RegisterActionIcon width={15} height={15} /><Text style={styles.submitLabel}>Đăng ký tài khoản</Text>
          </Pressable>
          <Text style={styles.submitHint}>Sau khi đăng ký thành công sẽ chuyển sang màn hình Đăng nhập</Text>
        </View>

        <View style={styles.gardenTip}>
          <Image source={require('@/assets/images/figma/auth/signup/footer-garden.png')} style={styles.gardenPhoto} resizeMode="cover" />
          <View style={styles.gardenCopy}><Text style={styles.gardenTitle}>Vườn số xanh mát</Text><Text style={styles.gardenText}>Nhận lịch tưới thông minh & chẩn đoán sâu bệnh bằng hình ảnh ngay sau khi vào app.</Text></View>
        </View>
        <Pressable onPress={() => router.replace('/auth/login')} style={styles.switchAuth}>
          <Text style={styles.switchText}>Đã có tài khoản? </Text><Text style={styles.switchAction}>Đăng nhập ngay →</Text>
        </Pressable>
      </ScrollView>
      <Modal visible={showValidationSummary} transparent animationType="fade" onRequestClose={() => setShowValidationSummary(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.validationModal}>
            <View style={styles.modalAccent} />
            <View style={styles.modalContent}>
              <View style={styles.warningIcon}><Text style={styles.warningMark}>!</Text></View>
              <Text style={styles.modalTitle}>Thông tin không hợp lệ, hãy kiểm tra lại</Text>
              <Text style={styles.modalDescription}>Một số trường bắt buộc chưa được nhập hoặc chưa chính xác để tiếp tục.</Text>
              <View style={styles.errorList}>{Object.entries(errors).map(([key, message]) => <View key={key} style={styles.modalErrorRow}><Text style={styles.errorCross}>×</Text><View style={styles.modalErrorCopy}><Text style={styles.modalErrorTitle}>{({ name: 'Họ và tên', account: 'Số điện thoại hoặc Email', password: 'Mật khẩu', confirm: 'Xác nhận mật khẩu', terms: 'Điều khoản dịch vụ' } as Record<string, string>)[key]}</Text><Text style={styles.modalErrorMessage}>{message}</Text></View></View>)}</View>
              <Pressable onPress={() => setShowValidationSummary(false)} style={styles.modalPrimary}><Text style={styles.modalPrimaryText}>☷  Kiểm tra và sửa lại</Text></Pressable>
              <Pressable onPress={() => setShowValidationSummary(false)} style={styles.modalSecondary}><Text style={styles.modalSecondaryText}>Đóng cảnh báo</Text></Pressable>
              <Text style={styles.modalPrivacy}>GoPlant tôn trọng quyền riêng tư và mầm xanh an toàn</Text>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export function LoginScreen() {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    if (!account.trim() || !password) {
      setError('Vui lòng nhập tài khoản và mật khẩu.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      const result = await authenticateWithMockAuth(account, password);
      if (!result.ok) {
        if (result.reason === 'disabled') {
          setError('Mock authentication đã bị tắt. Tài khoản demo không thể đăng nhập trong cấu hình này.');
        } else if (result.reason === 'invalid-credentials') {
          setError('Email hoặc mật khẩu không chính xác.');
        } else {
          setError('Vui lòng nhập email và mật khẩu.');
        }
        return;
      }

      setPassword('');
      router.replace('/home');
    } catch {
      setError('Không thể hoàn tất đăng nhập demo. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScreenHeader title="Login" />
      <ScrollView contentContainerStyle={styles.loginContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.loginHero}>
          <View style={styles.loginHeroTop}>
            <View style={styles.loginLogo}><LoginPlant width={24} height={27} /></View>
            <View style={styles.loginHeroCopy}>
              <View style={styles.botanicalTag}><LoginLeaf width={10} height={10} /><Text style={styles.botanicalLabel}>BOTANICAL LIVING</Text></View>
              <Text style={styles.loginTitle}>Chào mừng trở lại!</Text>
            </View>
          </View>
          <Text style={styles.loginSubtitle}>Đăng nhập để tiếp tục tưới tắm, theo dõi nhật ký và chăm sóc ốc đảo xanh của bạn mỗi ngày.</Text>
        </View>

        <View style={styles.loginForm}>
          <View style={styles.loginField}>
            <View style={styles.labelRow}><Text style={styles.loginFieldLabel}>Tài khoản</Text><Text style={styles.loginMeta}>Email hoặc SĐT</Text></View>
            <View style={styles.loginInput}>
              <LoginUser width={17} height={17} />
              <TextInput value={account} onChangeText={(value) => { setAccount(value); setError(''); }} placeholder="Nhập email hoặc số điện thoại" placeholderTextColor={C.mutedText} style={styles.loginInputText} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" editable={!isSubmitting} />
            </View>
          </View>
          <View style={styles.loginField}>
            <Text style={styles.loginFieldLabel}>Mật khẩu</Text>
            <View style={styles.loginInput}>
              <LoginLock width={15} height={18} />
              <TextInput value={password} onChangeText={(value) => { setPassword(value); setError(''); }} placeholder="Nhập mật khẩu" placeholderTextColor={C.mutedText} style={styles.loginInputText} secureTextEntry={!showPassword} editable={!isSubmitting} />
              <Pressable onPress={() => setShowPassword((value) => !value)} style={styles.loginEye}><LoginEye width={18} height={13} /></Pressable>
            </View>
          </View>
          <Pressable onPress={() => InlineUnavailable('Khôi phục mật khẩu chưa được kết nối dịch vụ xác thực.')} style={styles.forgotButton}><Text style={styles.forgotText}>Quên mật khẩu?</Text></Pressable>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Pressable disabled={isSubmitting} onPress={submit} style={({ pressed }) => [styles.loginSubmit, pressed && styles.pressed, isSubmitting && styles.loginSubmitDisabled]}><Text style={styles.loginSubmitLabel}>{isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}</Text><View style={styles.loginSubmitIcon}><ProfileIcon width={15} height={15} /></View></Pressable>
          <View style={styles.successHint}><InfoIcon width={14} height={14} /><Text style={styles.helperText}>Đăng nhập demo thành công sẽ mở Trang chủ và các giao diện hiện có.</Text></View>

          <View style={styles.orRow}><View style={styles.rule} /><Text style={styles.orText}>HOẶC TIẾP TỤC VỚI</Text><View style={styles.rule} /></View>
          <View style={styles.socialRow}>
            <Pressable onPress={() => InlineUnavailable('Đăng nhập Zalo MiniApp chưa được kết nối.')} style={styles.socialButton}><Text style={styles.zaloMark}>Z</Text><Text style={styles.socialText}>Zalo MiniApp</Text></Pressable>
            <Pressable onPress={() => InlineUnavailable('Đăng nhập Google chưa được kết nối.')} style={styles.socialButton}><Text style={styles.googleMark}>G</Text><Text style={styles.socialText}>Google</Text></Pressable>
          </View>
          <Pressable onPress={() => router.push('/auth/register')} style={styles.createAccount}><Text style={styles.switchText}>Chưa có tài khoản? </Text><Text style={styles.switchAction}>Đăng ký ngay</Text></Pressable>
          <Text style={styles.loginPrivacy}>Bảo mật chuẩn mã hóa thiết bị MiniApp</Text>
          <Text style={styles.loginCopyright}>PlantCare © 2025 • Đồng hành cùng mầm xanh của bạn</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.background },
  header: { height: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E8F0E9' },
  headerButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  profileButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.forest },
  headerTitle: { color: C.text, fontFamily: F.semiBold, fontSize: 16, lineHeight: 24 },
  registerContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24, gap: 14 },
  registerHero: { alignItems: 'center' },
  registerLogo: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center', elevation: 1 },
  registerTitle: { marginTop: 8, color: C.text, fontFamily: F.bold, fontSize: 26, lineHeight: 34, letterSpacing: -0.4, textAlign: 'center' },
  registerSubtitle: { maxWidth: 280, color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 2 },
  factBanner: { minHeight: 48, padding: 8, borderRadius: 12, backgroundColor: C.softSurface, flexDirection: 'row', alignItems: 'center', gap: 8 },
  factIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(2,52,35,0.1)', alignItems: 'center', justifyContent: 'center' },
  factText: { flex: 1, color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 18 },
  factStrong: { color: C.forest, fontFamily: F.semiBold },
  form: { gap: 14, paddingTop: 6 },
  field: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { color: C.text, fontFamily: F.semiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0.24 },
  required: { color: C.terracotta, fontFamily: F.semiBold, fontSize: 12, lineHeight: 16 },
  optionalPill: { marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: 'rgba(153,245,198,0.3)', color: '#004D33', fontFamily: F.bold, fontSize: 10, lineHeight: 14 },
  inputShell: { minHeight: 44, paddingHorizontal: 14, borderRadius: 8, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 12, elevation: 1 },
  inputError: { borderWidth: 1, borderColor: '#B42318' },
  input: { flex: 1, paddingVertical: 10, color: C.text, fontFamily: F.regular, fontSize: 14, lineHeight: 20 },
  eyeButton: { width: 30, height: 32, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: '#B42318', fontFamily: F.regular, fontSize: 11, lineHeight: 16, marginTop: 2 },
  recoveryField: { gap: 6 },
  helperRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  helperText: { color: '#7A837D', fontFamily: F.regular, fontSize: 10, lineHeight: 14 },
  deviceHint: { marginLeft: 'auto', color: C.secondaryText, fontFamily: F.regular, fontSize: 10, lineHeight: 14 },
  deviceSelector: { padding: 4, borderRadius: 10, backgroundColor: C.softSurface, flexDirection: 'row', gap: 4 },
  deviceOption: { flex: 1, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  deviceOptionSelected: { backgroundColor: C.surface, elevation: 1 },
  deviceLabel: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 16 },
  deviceLabelSelected: { color: C.forest, fontFamily: F.semiBold },
  strengthArea: { gap: 4, marginTop: -6 },
  strengthBars: { flexDirection: 'row', gap: 4 },
  strengthBar: { height: 6, flex: 1, borderRadius: 4, backgroundColor: '#DDE5DE' },
  strengthBarActive: { backgroundColor: '#69B98C' },
  strengthLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 2 },
  checkbox: { width: 20, height: 20, borderRadius: 5, backgroundColor: '#E3EAE4', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: C.primary },
  checkmark: { color: C.surface, fontFamily: F.bold, fontSize: 14 },
  termsText: { flex: 1, color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 17 },
  inlineLink: { color: C.forest, fontFamily: F.semiBold },
  submitButton: { minHeight: 48, borderRadius: 8, backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, elevation: 2 },
  submitLabel: { color: C.surface, fontFamily: F.semiBold, fontSize: 16, lineHeight: 24 },
  submitHint: { marginTop: -6, color: C.secondaryText, fontFamily: F.regular, fontSize: 10, lineHeight: 14, textAlign: 'center' },
  gardenTip: { padding: 12, borderRadius: 12, backgroundColor: C.softSurface, flexDirection: 'row', alignItems: 'center', gap: 10 },
  gardenPhoto: { width: 48, height: 48, borderRadius: 8 },
  gardenCopy: { flex: 1, gap: 2 },
  gardenTitle: { color: C.text, fontFamily: F.semiBold, fontSize: 12, lineHeight: 16 },
  gardenText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 10, lineHeight: 14 },
  switchAuth: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 34 },
  switchText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 14, lineHeight: 20 },
  switchAction: { color: C.forest, fontFamily: F.semiBold, fontSize: 16, lineHeight: 24 },
  loginContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20, gap: 20 },
  loginHero: { padding: 20, borderRadius: 12, backgroundColor: C.softSurface, gap: 8, overflow: 'hidden' },
  loginHeroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  loginLogo: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  loginHeroCopy: { flex: 1, gap: 4 },
  botanicalTag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: 'rgba(161,209,184,0.3)', flexDirection: 'row', alignItems: 'center', gap: 6 },
  botanicalLabel: { color: C.forest, fontFamily: F.bold, fontSize: 10, lineHeight: 14, letterSpacing: 0.5 },
  loginTitle: { color: C.text, fontFamily: F.semiBold, fontSize: 20, lineHeight: 28, letterSpacing: -0.2 },
  loginSubtitle: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 18 },
  loginForm: { padding: 20, borderRadius: 12, backgroundColor: C.surface, gap: 14, elevation: 1 },
  loginField: { gap: 4 },
  loginFieldLabel: { color: C.text, fontFamily: F.semiBold, fontSize: 14, lineHeight: 20, letterSpacing: 0.14 },
  loginMeta: { marginLeft: 'auto', color: 'rgba(65,73,68,0.7)', fontFamily: F.regular, fontSize: 12, lineHeight: 18 },
  loginInput: { minHeight: 46, paddingHorizontal: 12, borderRadius: 8, backgroundColor: C.softSurface, flexDirection: 'row', alignItems: 'center', gap: 10 },
  loginInputText: { flex: 1, paddingVertical: 10, color: C.text, fontFamily: F.regular, fontSize: 14, lineHeight: 20 },
  loginEye: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  forgotButton: { alignSelf: 'flex-end', paddingVertical: 2 },
  forgotText: { color: C.primary, fontFamily: F.semiBold, fontSize: 12, lineHeight: 16 },
  loginSubmit: { height: 48, borderRadius: 8, backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', elevation: 2 },
  loginSubmitDisabled: { opacity: 0.65 },
  loginSubmitLabel: { color: C.surface, fontFamily: F.semiBold, fontSize: 14, lineHeight: 20 },
  loginSubmitIcon: { position: 'absolute', right: 10, width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  successHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: -6 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  rule: { flex: 1, height: 1, backgroundColor: '#E3EAE4' },
  orText: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 10, lineHeight: 14 },
  socialRow: { flexDirection: 'row', gap: 8 },
  socialButton: { flex: 1, height: 50, borderRadius: 10, backgroundColor: C.softSurface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  socialText: { color: C.text, fontFamily: F.semiBold, fontSize: 12, lineHeight: 18 },
  zaloMark: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', backgroundColor: '#0877F9', color: C.surface, fontFamily: F.bold, fontSize: 16, lineHeight: 24, textAlign: 'center' },
  googleMark: { color: '#4285F4', fontFamily: F.bold, fontSize: 20, lineHeight: 24 },
  createAccount: { minHeight: 48, borderRadius: 10, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  loginPrivacy: { color: '#7A837D', fontFamily: F.regular, fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 2 },
  loginCopyright: { color: '#BCC7C0', fontFamily: F.regular, fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: -14 },
  modalBackdrop: { flex: 1, paddingHorizontal: 24, backgroundColor: 'rgba(21,31,25,0.58)', alignItems: 'center', justifyContent: 'center' },
  validationModal: { width: '100%', maxWidth: 420, overflow: 'hidden', borderRadius: 14, backgroundColor: C.surface, elevation: 10 },
  modalAccent: { height: 5, backgroundColor: '#FF9A65' },
  modalContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 0, alignItems: 'center', gap: 9 },
  warningIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: C.peach, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  warningMark: { color: '#984416', fontFamily: F.bold, fontSize: 26 },
  modalTitle: { color: C.text, fontFamily: F.semiBold, fontSize: 16, lineHeight: 22, textAlign: 'center' },
  modalDescription: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  errorList: { width: '100%', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, backgroundColor: C.softSurface },
  modalErrorRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DCE7DE' },
  errorCross: { width: 20, height: 20, overflow: 'hidden', borderRadius: 10, backgroundColor: '#FADADA', color: '#B42318', textAlign: 'center', textAlignVertical: 'center', fontFamily: F.bold },
  modalErrorCopy: { flex: 1, gap: 2 },
  modalErrorTitle: { color: C.text, fontFamily: F.semiBold, fontSize: 11 },
  modalErrorMessage: { color: '#B42318', fontFamily: F.regular, fontSize: 10 },
  modalPrimary: { width: '100%', minHeight: 43, borderRadius: 9, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  modalPrimaryText: { color: C.surface, fontFamily: F.semiBold, fontSize: 12 },
  modalSecondary: { width: '100%', minHeight: 39, borderRadius: 9, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
  modalSecondaryText: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 11 },
  modalPrivacy: { marginHorizontal: -16, marginTop: 1, paddingVertical: 6, width: '110%', backgroundColor: '#EEF4EF', color: C.secondaryText, fontFamily: F.semiBold, fontSize: 9, textAlign: 'center' },
  pressed: { opacity: 0.82 },
});
