import { useMemo, useState, type ComponentType } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SvgProps } from 'react-native-svg';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { useLoginMutation, useRegisterMutation } from './authHooks';
import { AppApiError } from '@/services/api/apiError';

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
  const registerMutation = useRegisterMutation();
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

  const submit = async () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Vui lòng nhập họ và tên.';
    else if (name.trim().length < 2) next.name = 'Họ và tên phải có ít nhất 2 ký tự.';

    if (!account.trim()) next.account = 'Vui lòng nhập email hoặc số điện thoại.';
    if (password.length < 8) next.password = 'Mật khẩu cần có ít nhất 8 ký tự.';
    if (!confirm || confirm !== password) next.confirm = 'Mật khẩu xác nhận chưa khớp.';
    if (!accepted) next.terms = 'Vui lòng đồng ý với điều khoản để tiếp tục.';

    setErrors(next);
    if (Object.keys(next).length > 0) {
      setShowValidationSummary(true);
      return;
    }

    if (registerMutation.isPending) return;

    try {
      await registerMutation.mutateAsync({
        fullName: name.trim(),
        account: account.trim(),
        recoveryEmail: recoveryEmail.trim() ? recoveryEmail.trim() : undefined,
        password,
        preferredDevice: device === 'mobile' ? 'MOBILE' : 'PC',
      });

      Alert.alert(
        'Đăng ký thành công',
        'Tài khoản đã được tạo thành công! Vui lòng đăng nhập để bắt đầu trải nghiệm GoPlant.',
        [
          {
            text: 'Đăng nhập ngay',
            onPress: () => {
              router.replace({
                pathname: '/auth/login',
                params: { account: account.trim() },
              });
            },
          },
        ]
      );
    } catch (err) {
      if (err instanceof AppApiError) {
        if (err.isConflictError) {
          setErrors({ account: 'Tài khoản (email hoặc số điện thoại) đã được đăng ký.' });
          setShowValidationSummary(true);
        } else if (err.isValidationError && err.field) {
          const fieldMap: Record<string, string> = {
            fullName: 'name',
            account: 'account',
            password: 'password',
            recoveryEmail: 'recoveryEmail',
          };
          const targetField = fieldMap[err.field] || 'general';
          setErrors({ [targetField]: err.message });
          setShowValidationSummary(true);
        } else {
          Alert.alert('Đăng ký thất bại', err.message);
        }
      } else {
        Alert.alert('Đăng ký thất bại', 'Không thể hoàn tất đăng ký. Vui lòng kiểm tra lại kết nối mạng.');
      }
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
          <Field label="Họ và tên" placeholder="Ví dụ: Nguyễn Văn An" icon={UserIcon} value={name} onChangeText={(val) => { setName(val); setErrors((prev) => ({ ...prev, name: '' })); }} error={errors.name} />
          <Field label="Số điện thoại hoặc Email" placeholder="Nhập số điện thoại hoặc email" icon={ContactIcon} value={account} onChangeText={(val) => { setAccount(val); setErrors((prev) => ({ ...prev, account: '' })); }} error={errors.account} keyboardType="email-address" />
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

          <Field label="Mật khẩu" placeholder="Tối thiểu 8 ký tự" icon={LockIcon} value={password} onChangeText={(val) => { setPassword(val); setErrors((prev) => ({ ...prev, password: '' })); }} error={errors.password} secureTextEntry={!showPassword} onToggleSecure={() => setShowPassword((value) => !value)} />
          <View style={styles.strengthArea}>
            <View style={styles.strengthBars}>{[1, 2, 3].map((part) => <View key={part} style={[styles.strengthBar, part <= strength && styles.strengthBarActive]} />)}</View>
            <View style={styles.strengthLabels}><Text style={styles.helperText}>Độ mạnh: {strength === 0 ? 'Chưa nhập' : strength === 1 ? 'Yếu' : strength === 2 ? 'Trung bình' : 'Mạnh'}</Text><Text style={styles.helperText}>Nên gồm chữ, số & ký tự đặc biệt</Text></View>
          </View>
          <Field label="Nhập lại mật khẩu" placeholder="Nhập lại mật khẩu đã tạo" icon={ShieldIcon} value={confirm} onChangeText={(val) => { setConfirm(val); setErrors((prev) => ({ ...prev, confirm: '' })); }} error={errors.confirm} secureTextEntry={!showPassword} onToggleSecure={() => setShowPassword((value) => !value)} />

          <Pressable onPress={() => setAccepted((value) => !value)} style={styles.termsRow} accessibilityRole="checkbox" accessibilityState={{ checked: accepted }}>
            <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>{accepted ? <Text style={styles.checkmark}>✓</Text> : null}</View>
            <Text style={styles.termsText}>Tôi đồng ý với <Text style={styles.inlineLink}>Điều khoản dịch vụ</Text> và <Text style={styles.inlineLink}>Chính sách bảo mật</Text> của MiniApp Quản Lý Cây Trồng.</Text>
          </Pressable>
          {errors.terms ? <Text style={styles.errorText}>{errors.terms}</Text> : null}

          <Pressable disabled={registerMutation.isPending} onPress={submit} style={({ pressed }) => [styles.submitButton, pressed && styles.pressed, registerMutation.isPending && styles.loginSubmitDisabled]} accessibilityRole="button">
            <RegisterActionIcon width={15} height={15} /><Text style={styles.submitLabel}>{registerMutation.isPending ? 'Đang đăng ký…' : 'Đăng ký tài khoản'}</Text>
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
              <View style={styles.errorList}>{Object.entries(errors).filter(([, msg]) => Boolean(msg)).map(([key, message]) => <View key={key} style={styles.modalErrorRow}><Text style={styles.errorCross}>×</Text><View style={styles.modalErrorCopy}><Text style={styles.modalErrorTitle}>{({ name: 'Họ và tên', account: 'Số điện thoại hoặc Email', password: 'Mật khẩu', confirm: 'Xác nhận mật khẩu', terms: 'Điều khoản dịch vụ', general: 'Thông báo chung' } as Record<string, string>)[key] || key}</Text><Text style={styles.modalErrorMessage}>{message}</Text></View></View>)}</View>
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
  const loginMutation = useLoginMutation();
  const params = useLocalSearchParams<{ account?: string }>();
  const [account, setAccount] = useState(params.account || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');



  const submit = async () => {
    const trimmedAccount = account.trim();
    if (loginMutation.isPending) return;

    if (!trimmedAccount || !password) {
      setError('Vui lòng nhập tài khoản và mật khẩu.');
      return;
    }
    setError('');
    try {
      await loginMutation.mutateAsync({ account: trimmedAccount, password });
      setPassword('');
      router.replace('/home');
    } catch (err) {
      if (err instanceof AppApiError) {
        if (err.statusCode === 401) {
          setError('Tài khoản hoặc mật khẩu không chính xác.');
        } else if (err.isNetworkError) {
          setError('Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại mạng hoặc cấu hình API.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Không thể hoàn tất đăng nhập. Vui lòng thử lại.');
      }
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
              <TextInput value={account} onChangeText={(value) => { setAccount(value); setError(''); }} placeholder="Nhập email hoặc số điện thoại" placeholderTextColor={C.mutedText} style={styles.loginInputText} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" editable={!loginMutation.isPending} />
            </View>
          </View>
          <View style={styles.loginField}>
            <Text style={styles.loginFieldLabel}>Mật khẩu</Text>
            <View style={styles.loginInput}>
              <LoginLock width={15} height={18} />
              <TextInput value={password} onChangeText={(value) => { setPassword(value); setError(''); }} placeholder="Nhập mật khẩu" placeholderTextColor={C.mutedText} style={styles.loginInputText} secureTextEntry={!showPassword} editable={!loginMutation.isPending} />
              <Pressable onPress={() => setShowPassword((value) => !value)} style={styles.loginEye}><LoginEye width={18} height={13} /></Pressable>
            </View>
          </View>
          <Pressable onPress={() => InlineUnavailable('Khôi phục mật khẩu chưa được kết nối dịch vụ xác thực.')} style={styles.forgotButton}><Text style={styles.forgotText}>Quên mật khẩu?</Text></Pressable>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Pressable disabled={loginMutation.isPending} onPress={submit} style={({ pressed }) => [styles.loginSubmit, pressed && styles.pressed, loginMutation.isPending && styles.loginSubmitDisabled]}><Text style={styles.loginSubmitLabel}>{loginMutation.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}</Text><View style={styles.loginSubmitIcon}><ProfileIcon width={15} height={15} /></View></Pressable>
          <View style={styles.successHint}><InfoIcon width={14} height={14} /><Text style={styles.helperText}>Đăng nhập an toàn với hệ thống tài khoản GoPlant và đồng bộ dữ liệu.</Text></View>

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
  input: { flex: 1, color: C.text, fontFamily: F.regular, fontSize: 14, paddingVertical: 0 },
  eyeButton: { padding: 4 },
  errorText: { color: '#B42318', fontFamily: F.regular, fontSize: 12, lineHeight: 16 },
  recoveryField: { gap: 6 },
  helperRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  helperText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 16 },
  deviceHint: { marginLeft: 'auto', color: C.mutedText, fontFamily: F.regular, fontSize: 11, lineHeight: 16 },
  deviceSelector: { flexDirection: 'row', gap: 10 },
  deviceOption: { flex: 1, minHeight: 42, paddingHorizontal: 10, borderRadius: 8, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#D9D9D9' },
  deviceOptionSelected: { borderColor: C.forest, backgroundColor: 'rgba(2,52,35,0.04)' },
  deviceLabel: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 16 },
  deviceLabelSelected: { color: C.forest, fontFamily: F.semiBold },
  strengthArea: { gap: 6 },
  strengthBars: { flexDirection: 'row', gap: 6 },
  strengthBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0' },
  strengthBarActive: { backgroundColor: '#10B981' },
  strengthLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: '#C8D5CA', backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxChecked: { backgroundColor: C.forest, borderColor: C.forest },
  checkmark: { color: '#FFFFFF', fontSize: 12, lineHeight: 14, fontWeight: 'bold' },
  termsText: { flex: 1, color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 16 },
  inlineLink: { color: C.forest, fontFamily: F.semiBold },
  submitButton: { minHeight: 48, borderRadius: 8, backgroundColor: C.forest, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitLabel: { color: '#FFFFFF', fontFamily: F.bold, fontSize: 14, lineHeight: 20 },
  submitHint: { color: C.mutedText, fontFamily: F.regular, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  gardenTip: { padding: 10, borderRadius: 12, backgroundColor: C.softSurface, flexDirection: 'row', alignItems: 'center', gap: 12 },
  gardenPhoto: { width: 64, height: 64, borderRadius: 8 },
  gardenCopy: { flex: 1, gap: 2 },
  gardenTitle: { color: C.text, fontFamily: F.bold, fontSize: 13, lineHeight: 18 },
  gardenText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 16 },
  switchAuth: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', paddingVertical: 8 },
  switchText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 13, lineHeight: 18 },
  switchAction: { color: C.forest, fontFamily: F.bold, fontSize: 13, lineHeight: 18 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  validationModal: { width: '100%', maxWidth: 360, borderRadius: 16, backgroundColor: C.surface, overflow: 'hidden' },
  modalAccent: { height: 6, backgroundColor: '#EF4444' },
  modalContent: { padding: 20, gap: 14, alignItems: 'center' },
  warningIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  warningMark: { color: '#EF4444', fontSize: 22, fontWeight: 'bold' },
  modalTitle: { color: C.text, fontFamily: F.bold, fontSize: 16, lineHeight: 22, textAlign: 'center' },
  modalDescription: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  errorList: { width: '100%', gap: 8 },
  modalErrorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 8, borderRadius: 8, backgroundColor: '#FEF2F2' },
  errorCross: { color: '#EF4444', fontSize: 16, lineHeight: 18, fontWeight: 'bold' },
  modalErrorCopy: { flex: 1 },
  modalErrorTitle: { color: '#991B1B', fontFamily: F.bold, fontSize: 12, lineHeight: 16 },
  modalErrorMessage: { color: '#B91C1C', fontFamily: F.regular, fontSize: 11, lineHeight: 15 },
  modalPrimary: { width: '100%', height: 44, borderRadius: 8, backgroundColor: C.forest, alignItems: 'center', justifyContent: 'center' },
  modalPrimaryText: { color: '#FFFFFF', fontFamily: F.bold, fontSize: 13 },
  modalSecondary: { paddingVertical: 6 },
  modalSecondaryText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12 },
  modalPrivacy: { color: C.mutedText, fontFamily: F.regular, fontSize: 10, textAlign: 'center' },
  loginContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24, gap: 20 },
  loginHero: { gap: 10 },
  loginHeroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  loginLogo: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' },
  loginHeroCopy: { flex: 1, gap: 2 },
  botanicalTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  botanicalLabel: { color: C.forest, fontFamily: F.bold, fontSize: 9, letterSpacing: 0.8 },
  loginTitle: { color: C.text, fontFamily: F.bold, fontSize: 22, lineHeight: 28 },
  loginSubtitle: { color: C.secondaryText, fontFamily: F.regular, fontSize: 13, lineHeight: 20 },
  loginForm: { gap: 14 },
  loginField: { gap: 6 },
  loginFieldLabel: { color: C.text, fontFamily: F.semiBold, fontSize: 12, lineHeight: 16 },
  loginMeta: { marginLeft: 'auto', color: C.mutedText, fontFamily: F.regular, fontSize: 11 },
  loginInput: { minHeight: 46, paddingHorizontal: 14, borderRadius: 8, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 12, elevation: 1 },
  loginInputText: { flex: 1, color: C.text, fontFamily: F.regular, fontSize: 14, paddingVertical: 0 },
  loginEye: { padding: 4 },
  forgotButton: { alignSelf: 'flex-end', paddingVertical: 2 },
  forgotText: { color: C.forest, fontFamily: F.semiBold, fontSize: 12 },
  loginSubmit: { minHeight: 48, borderRadius: 8, backgroundColor: C.forest, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  loginSubmitDisabled: { opacity: 0.6 },
  loginSubmitLabel: { color: '#FFFFFF', fontFamily: F.bold, fontSize: 14, lineHeight: 20 },
  loginSubmitIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  successHint: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, backgroundColor: C.softSurface },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  rule: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  orText: { color: C.mutedText, fontFamily: F.bold, fontSize: 10, letterSpacing: 0.8 },
  socialRow: { flexDirection: 'row', gap: 12 },
  socialButton: { flex: 1, height: 44, borderRadius: 8, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  zaloMark: { color: '#0068FF', fontFamily: F.bold, fontSize: 16 },
  googleMark: { color: '#EA4335', fontFamily: F.bold, fontSize: 16 },
  socialText: { color: C.text, fontFamily: F.semiBold, fontSize: 12 },
  createAccount: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', paddingVertical: 8 },
  loginPrivacy: { color: C.mutedText, fontFamily: F.regular, fontSize: 11, textAlign: 'center' },
  loginCopyright: { color: C.mutedText, fontFamily: F.regular, fontSize: 10, textAlign: 'center' },
  pressed: { opacity: 0.8 },
});
