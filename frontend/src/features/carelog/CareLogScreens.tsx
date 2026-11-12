import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { useUserPlantDetail, useUserPlantsList } from '@/features/plants/plantHooks';
import type { UserPlantSummaryDto } from '@/features/plants/plantTypes';
import { AppApiError } from '@/services/api/apiError';
import { getSessionGeneration } from '@/services/api/tokenStorage';
import {
  assertValidCarePlantId,
  parseUiDateTimeInputToOffsetIso,
  validateCareTaskType,
} from './careLogApi';
import { useCreateCareLogMutation } from './careLogHooks';
import { TASK_TYPE_OPTIONS, type TaskType } from './careLogTypes';

interface CareLogFieldErrors {
  userPlantId?: string;
  taskType?: string;
  performedAt?: string;
}

export function CreateCareLogScreen() {
  const { plantId } = useLocalSearchParams<{ plantId?: string }>();
  const preselectedPlantId = typeof plantId === 'string' ? plantId.trim() : '';

  const { user } = useAuth();
  const currentUserId = typeof user?.id === 'string' ? user.id.trim() : '';
  const currentUserIdRef = useRef(currentUserId);
  const prevUserIdRef = useRef(currentUserId);
  const submitLockRef = useRef(false);

  const plantsQuery = useUserPlantsList({ page: 0, size: 100, sort: 'displayName,asc' });
  const preselectedPlantDetailQuery = useUserPlantDetail(preselectedPlantId, {
    enabled: Boolean(preselectedPlantId),
  });
  const createCareLogMutation = useCreateCareLogMutation();

  const [selectedPlantId, setSelectedPlantId] = useState(preselectedPlantId);
  const [taskType, setTaskType] = useState<TaskType>('WATERING');
  const [note, setNote] = useState('');
  const [performedAtInput, setPerformedAtInput] = useState('');
  const [fieldErrors, setFieldErrors] = useState<CareLogFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLocalSubmitting, setIsLocalSubmitting] = useState(false);

  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = currentUserId;
    currentUserIdRef.current = currentUserId;
    if (prevUserId && prevUserId !== currentUserId) {
      submitLockRef.current = false;
      setSelectedPlantId(preselectedPlantId);
      setTaskType('WATERING');
      setNote('');
      setPerformedAtInput('');
      setFieldErrors({});
      setSubmitError(null);
      setIsLocalSubmitting(false);
    }
  }, [currentUserId, preselectedPlantId]);

  useEffect(() => {
    setSelectedPlantId(preselectedPlantId);
    setFieldErrors({});
    setSubmitError(null);
  }, [preselectedPlantId]);

  const plantOptions = useMemo(() => {
    const items = plantsQuery.data?.content ?? [];
    const detail = preselectedPlantDetailQuery.data;
    if (!detail || items.some((item) => item.id === detail.id)) {
      return items;
    }
    const detailSummary: UserPlantSummaryDto = {
      id: detail.id,
      displayName: detail.displayName,
      speciesName: detail.species?.commonName ?? null,
      scientificName: detail.species?.scientificName ?? null,
      category: detail.species?.category ?? null,
      gardenName: detail.garden?.name ?? null,
      healthStatus: detail.healthStatus,
      imageUrl: detail.imageUrl,
      createdAt: detail.createdAt,
    };
    return [detailSummary, ...items];
  }, [plantsQuery.data, preselectedPlantDetailQuery.data]);

  const activePlantId = selectedPlantId.trim() || preselectedPlantId;
  const isSubmitting = createCareLogMutation.isPending || isLocalSubmitting;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (activePlantId) {
      router.replace({
        pathname: '/plant-detail',
        params: { plantId: activePlantId },
      } as never);
      return;
    }
    router.replace('/plants' as never);
  };

  const handleSubmit = async () => {
    if (submitLockRef.current || createCareLogMutation.isPending) {
      return;
    }

    const initiatedGeneration = getSessionGeneration();
    const initiatedByUserId = currentUserIdRef.current;
    const hasSwitchedSession = () =>
      getSessionGeneration() !== initiatedGeneration ||
      (Boolean(initiatedByUserId) && currentUserIdRef.current !== initiatedByUserId);

    setSubmitError(null);
    const nextFieldErrors: CareLogFieldErrors = {};

    let validPlantId = '';
    try {
      validPlantId = assertValidCarePlantId(activePlantId);
    } catch (err) {
      nextFieldErrors.userPlantId =
        err instanceof AppApiError ? err.message : 'Vui lòng chọn cây trồng thực tế.';
    }

    let validTaskType: TaskType = taskType;
    try {
      validTaskType = validateCareTaskType(taskType);
    } catch (err) {
      nextFieldErrors.taskType =
        err instanceof AppApiError ? err.message : 'Loại thao tác chăm sóc không hợp lệ.';
    }

    let validPerformedAt: string | undefined;
    try {
      validPerformedAt = parseUiDateTimeInputToOffsetIso(
        performedAtInput,
        'performedAt',
        'Thời điểm thực hiện'
      );
    } catch (err) {
      nextFieldErrors.performedAt =
        err instanceof AppApiError
          ? err.message
          : 'Thời điểm thực hiện không đúng định dạng.';
    }

    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0 || !validPlantId) {
      return;
    }

    submitLockRef.current = true;
    setIsLocalSubmitting(true);

    try {
      const cleanNote = note.trim();
      const created = await createCareLogMutation.mutateAsync({
        userPlantId: validPlantId,
        taskType: validTaskType,
        ...(cleanNote ? { note: cleanNote } : {}),
        ...(validPerformedAt !== undefined ? { performedAt: validPerformedAt } : {}),
      });

      if (hasSwitchedSession()) {
        return;
      }

      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace({
          pathname: '/plant-detail',
          params: { plantId: created.userPlantId || validPlantId },
        } as never);
      }
    } catch (err) {
      if (hasSwitchedSession()) {
        return;
      }
      if (err instanceof AppApiError) {
        if (err.code === 'SESSION_USER_MISMATCH') {
          return;
        }
        setSubmitError(err.message);
        return;
      }
      setSubmitError('Không thể lưu ghi nhận chăm sóc. Vui lòng thử lại.');
    } finally {
      submitLockRef.current = false;
      if (!hasSwitchedSession()) {
        setIsLocalSubmitting(false);
      }
    }
  };

  return (
    <SafeAreaView style={cl.safe} edges={['top']}>
      <View style={cl.header}>
        <Pressable
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          style={cl.backButton}
        >
          <Text style={cl.back}>‹</Text>
        </Pressable>
        <Text style={cl.headerTitle}>Ghi nhận chăm sóc</Text>
        <View style={cl.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={cl.content}>
        <View style={cl.tipCard}>
          <Text style={cl.tipTitle}>Ghi nhận thao tác chăm sóc thủ công</Text>
          <Text style={cl.body}>
            Lưu nhanh hoạt động chăm sóc thực tế vào lịch sử của cây. Máy chủ sẽ mặc định trạng
            thái hoàn thành (COMPLETED) và gắn thời điểm theo giờ Việt Nam (UTC+7).
          </Text>
        </View>

        {submitError ? (
          <View style={cl.errorBanner} accessibilityRole="alert">
            <Text style={cl.errorBannerText}>{submitError}</Text>
            <Pressable onPress={() => setSubmitError(null)} accessibilityRole="button">
              <Text style={cl.dismissText}>Đóng</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={cl.label}>
          1. Chọn cây trồng <Text style={cl.required}>*</Text>
        </Text>

        {plantsQuery.isLoading && plantOptions.length === 0 ? (
          <View style={cl.stateCard}>
            <ActivityIndicator size="small" color={C.primary} />
            <Text style={cl.body}>Đang tải danh sách cây của bạn...</Text>
          </View>
        ) : plantsQuery.isError && plantOptions.length === 0 ? (
          <View style={cl.stateCard} accessibilityRole="alert">
            <Text style={cl.errorText}>{plantsQuery.error.message}</Text>
            <Pressable
              onPress={() => {
                void plantsQuery.refetch();
              }}
              style={cl.secondaryButton}
              accessibilityRole="button"
            >
              <Text style={cl.secondaryText}>Thử lại tải cây</Text>
            </Pressable>
          </View>
        ) : plantOptions.length === 0 ? (
          <View style={cl.stateCard}>
            <Text style={cl.body}>
              Bạn chưa có cây trồng nào. Hãy thêm một cây trước khi ghi nhận lịch sử chăm sóc.
            </Text>
            <Pressable
              onPress={() => router.push('/garden/add-plant' as never)}
              style={cl.secondaryButton}
              accessibilityRole="button"
            >
              <Text style={cl.secondaryText}>＋  Thêm cây mới</Text>
            </Pressable>
          </View>
        ) : (
          <View style={cl.plantList}>
            {plantOptions.map((item) => {
              const selected = activePlantId === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    setSelectedPlantId(item.id);
                    setFieldErrors((prev) => ({ ...prev, userPlantId: undefined }));
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={[cl.plantCard, selected && cl.selectedCard]}
                >
                  <View style={cl.thumbSmall}>
                    <Text style={cl.thumbGlyph}>♧</Text>
                  </View>
                  <View style={cl.flexCopy}>
                    <Text style={cl.itemTitle}>{item.displayName}</Text>
                    <Text style={cl.body}>
                      {item.speciesName || 'Chưa gắn loài'}
                      {item.gardenName ? ` • ${item.gardenName}` : ''}
                    </Text>
                  </View>
                  <Text style={cl.radio}>{selected ? '●' : '○'}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        {fieldErrors.userPlantId ? (
          <Text style={cl.errorText}>{fieldErrors.userPlantId}</Text>
        ) : null}

        <Text style={cl.label}>
          2. Loại thao tác chăm sóc <Text style={cl.required}>*</Text>
        </Text>
        <View style={cl.chips}>
          {TASK_TYPE_OPTIONS.map((opt) => {
            const active = taskType === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  setTaskType(opt.value);
                  setFieldErrors((prev) => ({ ...prev, taskType: undefined }));
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[cl.chip, active && cl.chipActive]}
              >
                <Text style={[cl.chipText, active && cl.chipTextActive]}>
                  {opt.icon} {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {fieldErrors.taskType ? <Text style={cl.errorText}>{fieldErrors.taskType}</Text> : null}

        <Text style={cl.label}>3. Ghi chú chăm sóc (tùy chọn)</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          placeholder="Ví dụ: Tưới 300ml nước quanh gốc, đất khô nhẹ..."
          placeholderTextColor={C.mutedText}
          style={[cl.input, cl.multiline]}
          accessibilityLabel="Ghi chú chăm sóc"
        />

        <Text style={cl.label}>4. Thời điểm thực hiện (tùy chọn)</Text>
        <TextInput
          value={performedAtInput}
          onChangeText={(value) => {
            setPerformedAtInput(value);
            setFieldErrors((prev) => ({ ...prev, performedAt: undefined }));
          }}
          placeholder="Để trống nếu là bây giờ • VD: 2026-11-12 08:30 hoặc 2026-11-12T08:30:00+07:00"
          placeholderTextColor={C.mutedText}
          autoCapitalize="none"
          style={[cl.input, fieldErrors.performedAt && cl.errorBorder]}
          accessibilityLabel="Thời điểm thực hiện"
        />
        <Text style={cl.helperText}>
          Bỏ trống để máy chủ tự ghi nhận thời điểm hiện tại. Khi nhập tay theo giờ VN
          (YYYY-MM-DD HH:mm) hệ thống tự quy đổi +07:00; mọi chuỗi ISO phải có múi giờ (+07:00
          hoặc Z).
        </Text>
        {fieldErrors.performedAt ? (
          <Text style={cl.errorText}>{fieldErrors.performedAt}</Text>
        ) : null}

        <View style={cl.scopeNoticeCard}>
          <Text style={cl.scopeNoticeTitle}>Ảnh đính kèm</Text>
          <Text style={cl.helperText}>
            Camera và tải ảnh từ thiết bị chưa bật trong giai đoạn G5.4.3 (dự kiến triển khai ở
            G5.5). Bạn vẫn có thể lưu lịch sử chăm sóc ngay lúc này.
          </Text>
        </View>

        <Pressable
          disabled={isSubmitting}
          onPress={() => {
            void handleSubmit();
          }}
          accessibilityRole="button"
          accessibilityState={{ disabled: isSubmitting }}
          style={[cl.submitButton, isSubmitting && cl.disabled]}
        >
          <Text style={cl.submitText}>
            {isSubmitting ? 'Đang lưu ghi nhận...' : 'Lưu ghi nhận chăm sóc'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const cl = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: {
    height: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DDE8E0',
  },
  backButton: { width: 36, height: 36, justifyContent: 'center' },
  back: { color: C.forest, fontSize: 29 },
  headerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 15 },
  headerSpacer: { width: 36 },
  content: { padding: 14, gap: 10, paddingBottom: 28 },
  tipCard: { padding: 12, borderRadius: 12, backgroundColor: C.softSurface, gap: 4 },
  tipTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 13 },
  body: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 16 },
  label: { marginTop: 4, color: C.text, fontFamily: F.semiBold, fontSize: 12 },
  required: { color: C.terracotta },
  plantList: { gap: 7 },
  plantCard: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: '#E1EBE3',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  selectedCard: { borderColor: C.primary, backgroundColor: '#E5F4E9' },
  thumbSmall: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: C.softSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbGlyph: { color: C.forest, fontSize: 18 },
  flexCopy: { flex: 1, gap: 2 },
  itemTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 12 },
  radio: { color: C.primary, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: '#DDE8E0',
  },
  chipActive: { backgroundColor: C.forest, borderColor: C.forest },
  chipText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11 },
  chipTextActive: { color: C.surface, fontFamily: F.semiBold },
  input: {
    minHeight: 42,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: '#DDE8E0',
    color: C.text,
    fontFamily: F.regular,
    fontSize: 12,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  helperText: { color: C.mutedText, fontFamily: F.regular, fontSize: 10, lineHeight: 15 },
  errorBorder: { borderColor: '#B42318' },
  errorText: { color: '#B42318', fontFamily: F.regular, fontSize: 11 },
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
  stateCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: C.surface,
    alignItems: 'center',
    gap: 8,
  },
  secondaryButton: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: C.softSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  scopeNoticeCard: {
    padding: 11,
    borderRadius: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D5E3D8',
    gap: 3,
  },
  scopeNoticeTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  submitButton: {
    marginTop: 6,
    minHeight: 45,
    borderRadius: 11,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { color: C.surface, fontFamily: F.semiBold, fontSize: 13 },
  disabled: { opacity: 0.55 },
});
