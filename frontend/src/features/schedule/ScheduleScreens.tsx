import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { useUserPlantDetail, useUserPlantsList } from '@/features/plants/plantHooks';
import type { UserPlantSummaryDto } from '@/features/plants/plantTypes';
import { AppApiError } from '@/services/api/apiError';
import type { PageResponse } from '@/services/api/apiTypes';
import { getSessionGeneration } from '@/services/api/tokenStorage';
import { queryKeys } from '@/services/query/queryKeys';
import {
  DEFAULT_REMINDER_TIME,
  formatNextScheduledAtVn,
  getScheduleRuntimeState,
  getTodayVnDateString,
  TASK_LABEL_MAX_LENGTH,
  validateCreateStartDate,
  validateEndDateValue,
  validateFrequency,
  validateIntervalDays,
  validateLocalDateString,
  validateReminderTime,
  validateTaskLabel,
  validateTaskType,
} from './scheduleApi';
import { useScheduleClock } from './useScheduleClock';
import {
  useCompleteScheduleMutation,
  useCreateScheduleMutation,
  useDeleteScheduleMutation,
  usePlantSchedules,
  useSkipScheduleMutation,
  useTodaySchedules,
  useUpdateScheduleMutation,
} from './scheduleHooks';
import {
  FREQUENCY_OPTIONS,
  getFrequencyLabel,
  getScheduleStatusMeta,
  getTaskTypeMeta,
  TASK_TYPE_OPTIONS,
  type CareScheduleDto,
  type Frequency,
  type ScheduleStatus,
  type TaskType,
  type TodayScheduleItemDto,
} from './scheduleTypes';

type TodayFilterMode = 'ALL' | 'OVERDUE' | 'DUE_SOON';

interface ScheduleFieldErrors {
  userPlantId?: string;
  taskType?: string;
  taskLabel?: string;
  frequency?: string;
  intervalDays?: string;
  reminderTime?: string;
  startDate?: string;
  endDate?: string;
}

function ScheduleHeader({
  title,
  fallbackRoute = '/schedule',
}: {
  title: string;
  fallbackRoute?: string;
}) {
  return (
    <View style={sc.header}>
      <Pressable
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace(fallbackRoute as never)
        }
        accessibilityRole="button"
        accessibilityLabel="Quay lại"
        style={sc.backButton}
      >
        <Text style={sc.back}>‹</Text>
      </Pressable>
      <Text style={sc.headerTitle}>{title}</Text>
      <View style={sc.headerSpacer} />
    </View>
  );
}

function StatusTag({
  label,
  tone = 'mint',
}: {
  label: string;
  tone?: 'mint' | 'peach' | 'danger' | 'plain';
}) {
  return (
    <Text
      style={[
        sc.tag,
        tone === 'peach'
          ? sc.tagPeach
          : tone === 'danger'
            ? sc.tagDanger
            : tone === 'plain'
              ? sc.tagPlain
              : sc.tagMint,
      ]}
    >
      {label}
    </Text>
  );
}

export function ScheduleOverviewContent() {
  const { user, status } = useAuth();
  const isAuthenticated = status === 'authenticated';
  const currentUserId = typeof user?.id === 'string' ? user.id.trim() : '';
  const currentUserIdRef = useRef(currentUserId);
  const prevUserIdRef = useRef(currentUserId);

  const todayQuery = useTodaySchedules();
  const todayRefetch = todayQuery.refetch;
  const todayRefetchRef = useRef(todayRefetch);
  useEffect(() => {
    todayRefetchRef.current = todayRefetch;
  }, [todayRefetch]);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const completeMutation = useCompleteScheduleMutation();
  const skipMutation = useSkipScheduleMutation();

  const [filterMode, setFilterMode] = useState<TodayFilterMode>('ALL');
  const [activeScheduleActionId, setActiveScheduleActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = currentUserId;
    currentUserIdRef.current = currentUserId;
    if (prevUserId && prevUserId !== currentUserId) {
      setFilterMode('ALL');
      setActiveScheduleActionId(null);
      setActionError(null);
      setActionSuccess(null);
    }
  }, [currentUserId]);

  const items = useMemo(() => todayQuery.data ?? [], [todayQuery.data]);
  const activeTransitionTimestamps = useMemo(
    () =>
      items
        .filter((item) => item.status === 'ACTIVE')
        .map((item) => item.nextScheduledAt),
    [items]
  );

  const handleClockRefresh = useCallback(() => {
    if (!isMountedRef.current || !isAuthenticated || !currentUserIdRef.current) {
      return;
    }
    void todayRefetchRef.current();
  }, [isAuthenticated]);

  const { nowMs } = useScheduleClock({
    enabled: isAuthenticated && Boolean(currentUserId),
    transitionIsoTimestamps: activeTransitionTimestamps,
    trackVnMidnight: true,
    onActiveRefresh: handleClockRefresh,
  });

  const overdueItems = useMemo(
    () => items.filter((item) => getScheduleRuntimeState(item, nowMs).isOverdue),
    [items, nowMs]
  );
  const nonOverdueItems = useMemo(
    () => items.filter((item) => !getScheduleRuntimeState(item, nowMs).isOverdue),
    [items, nowMs]
  );

  const visibleItems = useMemo(() => {
    if (filterMode === 'OVERDUE') {
      return overdueItems;
    }
    if (filterMode === 'DUE_SOON') {
      return nonOverdueItems;
    }
    return items;
  }, [filterMode, items, overdueItems, nonOverdueItems]);

  const isAnyCareActionPending =
    completeMutation.isPending || skipMutation.isPending;

  const handleCareAction = async (
    item: TodayScheduleItemDto,
    mode: 'complete' | 'skip'
  ) => {
    const initiatedGeneration = getSessionGeneration();
    const initiatedByUserId = currentUserIdRef.current;
    const hasSwitchedSession = () =>
      getSessionGeneration() !== initiatedGeneration ||
      (Boolean(initiatedByUserId) && currentUserIdRef.current !== initiatedByUserId);

    if (!getScheduleRuntimeState(item, nowMs).isDue) {
      setActionError('Lượt chăm sóc này chưa đến giờ thực hiện.');
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setActiveScheduleActionId(item.scheduleId);

    try {
      const result =
        mode === 'complete'
          ? await completeMutation.mutateAsync({
              scheduleId: item.scheduleId,
              plantId: item.plantId,
            })
          : await skipMutation.mutateAsync({
              scheduleId: item.scheduleId,
              plantId: item.plantId,
            });

      if (hasSwitchedSession()) {
        return;
      }

      const taskLabel = getTaskTypeMeta(item.taskType).label;
      if (result.scheduleStatus === 'COMPLETED') {
        setActionSuccess(
          mode === 'complete'
            ? `Đã hoàn thành "${taskLabel}" và kết thúc chu kỳ lịch của ${item.plantName}.`
            : `Đã bỏ qua "${taskLabel}" và kết thúc chu kỳ lịch của ${item.plantName}.`
        );
      } else {
        setActionSuccess(
          mode === 'complete'
            ? `Đã ghi nhận hoàn thành "${taskLabel}" cho ${item.plantName}.`
            : `Đã bỏ qua lượt "${taskLabel}" của ${item.plantName} và chuyển sang kỳ tiếp theo.`
        );
      }
    } catch (err) {
      if (hasSwitchedSession()) {
        return;
      }
      if (err instanceof AppApiError) {
        if (err.code === 'SESSION_USER_MISMATCH') {
          return;
        }
        setActionError(err.message);
        return;
      }
      setActionError('Không thể cập nhật trạng thái lượt chăm sóc. Vui lòng thử lại.');
    } finally {
      if (!hasSwitchedSession()) {
        setActiveScheduleActionId(null);
      }
    }
  };

  return (
    <>
      <View style={sc.scheduleBanner}>
        <Text style={sc.bannerIcon}>◷</Text>
        <View style={sc.flexCopy}>
          <Text style={sc.sectionTitle}>Lịch chăm sóc hôm nay</Text>
          <Text style={sc.body}>
            Hiển thị các lịch đang hoạt động đến hạn trong ngày hoặc quá hạn theo giờ Việt Nam (UTC+7).
          </Text>
        </View>
      </View>

      <View style={sc.toolbarRow}>
        <Pressable
          onPress={() => router.push('/schedule/create' as never)}
          accessibilityRole="button"
          accessibilityLabel="Tạo lịch chăm sóc mới"
          style={[sc.primaryToolbarButton, { flex: 1 }]}
        >
          <Text style={sc.submitText}>＋  Tạo lịch chăm sóc</Text>
        </Pressable>
        <Pressable
          disabled={todayQuery.isFetching}
          onPress={() => {
            void todayQuery.refetch();
          }}
          accessibilityRole="button"
          accessibilityLabel="Làm mới lịch hôm nay"
          accessibilityState={{ disabled: todayQuery.isFetching }}
          style={[sc.refreshBtn, todayQuery.isFetching && sc.disabled]}
        >
          <Text style={sc.refreshBtnText}>
            {todayQuery.isFetching ? 'Đang tải...' : 'Làm mới'}
          </Text>
        </Pressable>
      </View>

      {!todayQuery.isLoading && !todayQuery.isError ? (
        <View style={sc.metrics}>
          <View style={sc.metric}>
            <Text style={sc.metricValue}>{items.length}</Text>
            <Text style={sc.body}>Việc cần làm hôm nay</Text>
          </View>
          <View style={sc.metric}>
            <Text style={sc.metricValue}>{overdueItems.length}</Text>
            <Text style={sc.body}>Việc đang quá hạn</Text>
          </View>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sc.pills}>
        {(
          [
            ['ALL', `Tất cả hôm nay (${items.length})`],
            ['OVERDUE', `Quá hạn (${overdueItems.length})`],
            ['DUE_SOON', `Trong ngày (${nonOverdueItems.length})`],
          ] as [TodayFilterMode, string][]
        ).map(([mode, label]) => {
          const active = filterMode === mode;
          return (
            <Pressable
              key={mode}
              onPress={() => setFilterMode(mode)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[sc.filterPill, active && sc.filterPillActive]}
            >
              <Text style={[sc.filterPillText, active && sc.filterPillTextActive]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {actionError ? (
        <View style={sc.errorBanner} accessibilityRole="alert">
          <Text style={sc.errorBannerText}>{actionError}</Text>
          <Pressable onPress={() => setActionError(null)} accessibilityRole="button">
            <Text style={sc.dismissText}>Đóng</Text>
          </Pressable>
        </View>
      ) : null}

      {actionSuccess ? (
        <View style={sc.successBanner} accessibilityLiveRegion="polite">
          <Text style={sc.successBannerText}>{actionSuccess}</Text>
          <Pressable onPress={() => setActionSuccess(null)} accessibilityRole="button">
            <Text style={sc.successDismissText}>Đóng</Text>
          </Pressable>
        </View>
      ) : null}

      {todayQuery.isLoading ? (
        <View style={sc.stateCard}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={sc.bodyCenter}>Đang tải lịch chăm sóc hôm nay từ máy chủ...</Text>
        </View>
      ) : todayQuery.isError ? (
        <View style={sc.stateCard} accessibilityRole="alert">
          <Text style={sc.sectionTitle}>Không thể tải lịch chăm sóc hôm nay</Text>
          <Text style={sc.bodyCenter}>{todayQuery.error.message}</Text>
          <Pressable
            onPress={() => {
              void todayQuery.refetch();
            }}
            accessibilityRole="button"
            style={sc.submit}
          >
            <Text style={sc.submitText}>Thử lại</Text>
          </Pressable>
        </View>
      ) : visibleItems.length === 0 ? (
        <View style={sc.stateCard}>
          <Text style={sc.sectionTitle}>
            {items.length === 0
              ? 'Không có lịch chăm sóc cần thực hiện hôm nay'
              : 'Không có lịch thuộc nhóm lọc này'}
          </Text>
          <Text style={sc.bodyCenter}>
            {items.length === 0
              ? 'Các lịch đang tạm ngưng, đã hủy, đã hoàn thành hoặc có ngày bắt đầu trong tương lai sẽ không hiển thị ở danh sách hôm nay.'
              : 'Thử chuyển bộ lọc để xem toàn bộ lịch hôm nay.'}
          </Text>
          {items.length === 0 ? (
            <Pressable
              onPress={() => router.push('/schedule/create' as never)}
              accessibilityRole="button"
              style={sc.submit}
            >
              <Text style={sc.submitText}>＋  Tạo lịch chăm sóc mới</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => setFilterMode('ALL')}
              accessibilityRole="button"
              style={sc.secondaryButton}
            >
              <Text style={sc.secondaryText}>Xem tất cả hôm nay</Text>
            </Pressable>
          )}
        </View>
      ) : (
        visibleItems.map((item) => {
          const taskMeta = getTaskTypeMeta(item.taskType);
          const timeInfo = formatNextScheduledAtVn(item.nextScheduledAt, new Date(nowMs));
          const runtimeState = getScheduleRuntimeState(item, nowMs);
          const dueNow = runtimeState.isDue;
          const overdueNow = runtimeState.isOverdue;
          const isPendingThis =
            isAnyCareActionPending && activeScheduleActionId === item.scheduleId;
          const actionsDisabled = isAnyCareActionPending || !dueNow;

          return (
            <View key={item.scheduleId} style={sc.scheduleItemCard}>
              <View style={sc.row}>
                <View style={sc.rowLeft}>
                  <View style={sc.plantIcon}>
                    <Text>{taskMeta.icon}</Text>
                  </View>
                  <View style={sc.flexCopy}>
                    <Text style={sc.sectionTitle}>{taskMeta.label}</Text>
                    {item.taskLabel ? (
                      <Text style={sc.bodyStrong}>{item.taskLabel}</Text>
                    ) : null}
                  </View>
                </View>
                {overdueNow ? (
                  <StatusTag label="Quá hạn" tone="peach" />
                ) : dueNow ? (
                  <StatusTag label="Đến hạn" tone="mint" />
                ) : (
                  <StatusTag label="Chưa đến giờ" tone="plain" />
                )}
              </View>

              <Text style={sc.bodyStrong}>
                Cây: {item.plantName}
                {item.gardenName ? ` • ${item.gardenName}` : ''}
              </Text>
              <Text style={sc.body}>Giờ hẹn: {timeInfo.dateTimeLabel}</Text>
              {!dueNow ? (
                <Text style={sc.helperText}>
                  Chưa đến giờ thực hiện — nút Hoàn thành/Bỏ qua sẽ mở khi đến hạn.
                </Text>
              ) : null}

              <View style={sc.actionRow}>
                <Pressable
                  disabled={actionsDisabled}
                  onPress={() => {
                    void handleCareAction(item, 'complete');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Hoàn thành ${taskMeta.label} cho ${item.plantName}`}
                  accessibilityState={{ disabled: actionsDisabled }}
                  style={[
                    sc.smallPrimaryButton,
                    actionsDisabled && sc.disabled,
                  ]}
                >
                  <Text style={sc.smallPrimaryText}>
                    {isPendingThis && completeMutation.isPending
                      ? 'Đang lưu...'
                      : 'Hoàn thành'}
                  </Text>
                </Pressable>

                <Pressable
                  disabled={actionsDisabled}
                  onPress={() => {
                    void handleCareAction(item, 'skip');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Bỏ qua ${taskMeta.label} cho ${item.plantName}`}
                  accessibilityState={{ disabled: actionsDisabled }}
                  style={[
                    sc.smallSecondaryButton,
                    actionsDisabled && sc.disabled,
                  ]}
                >
                  <Text style={sc.smallSecondaryText}>
                    {isPendingThis && skipMutation.isPending ? 'Đang lưu...' : 'Bỏ qua'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/plant-detail',
                      params: { plantId: item.plantId },
                    } as never)
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Xem cây ${item.plantName}`}
                  style={sc.smallGhostButton}
                >
                  <Text style={sc.link}>Xem cây</Text>
                </Pressable>

                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/schedule/detail',
                      params: {
                        plantId: item.plantId,
                        scheduleId: item.scheduleId,
                      },
                    } as never)
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Chi tiết lịch ${item.plantName}`}
                  style={sc.smallGhostButton}
                >
                  <Text style={sc.link}>Chi tiết ›</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </>
  );
}

export function CreateScheduleScreen() {
  const { plantId } = useLocalSearchParams<{ plantId?: string }>();
  const cleanPreselectedPlantId = typeof plantId === 'string' ? plantId.trim() : '';

  const { user } = useAuth();
  const currentUserId = typeof user?.id === 'string' ? user.id.trim() : '';
  const currentUserIdRef = useRef(currentUserId);
  const prevUserIdRef = useRef(currentUserId);
  const autoAppliedPlantRef = useRef(false);

  const plantsQuery = useUserPlantsList({ page: 0, size: 100, sort: 'displayName,asc' });
  const preselectedPlantQuery = useUserPlantDetail(cleanPreselectedPlantId, {
    enabled: Boolean(cleanPreselectedPlantId),
  });
  const createMutation = useCreateScheduleMutation();

  const [selectedPlantId, setSelectedPlantId] = useState(cleanPreselectedPlantId);
  const [taskType, setTaskType] = useState<TaskType>('WATERING');
  const [taskLabel, setTaskLabel] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('DAILY');
  const [intervalDaysText, setIntervalDaysText] = useState('3');
  const [startDate, setStartDate] = useState(() => getTodayVnDateString());
  const [endDate, setEndDate] = useState('');
  const [reminderTime, setReminderTime] = useState(DEFAULT_REMINDER_TIME);
  const [fieldErrors, setFieldErrors] = useState<ScheduleFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = currentUserId;
    currentUserIdRef.current = currentUserId;
    if (prevUserId && prevUserId !== currentUserId) {
      autoAppliedPlantRef.current = false;
      setSelectedPlantId(cleanPreselectedPlantId);
      setTaskType('WATERING');
      setTaskLabel('');
      setFrequency('DAILY');
      setIntervalDaysText('3');
      setStartDate(getTodayVnDateString());
      setEndDate('');
      setReminderTime(DEFAULT_REMINDER_TIME);
      setFieldErrors({});
      setSubmitError(null);
    }
  }, [currentUserId, cleanPreselectedPlantId]);

  const plantOptions = useMemo<UserPlantSummaryDto[]>(() => {
    const baseList = plantsQuery.data?.content ?? [];
    const pre = preselectedPlantQuery.data;
    if (!pre || baseList.some((p) => p.id === pre.id)) {
      return baseList;
    }
    return [
      {
        id: pre.id,
        displayName: pre.displayName,
        speciesName: pre.species?.commonName ?? null,
        scientificName: pre.species?.scientificName ?? null,
        category: pre.species?.category ?? null,
        gardenName: pre.garden?.name ?? null,
        healthStatus: pre.healthStatus,
        imageUrl: pre.imageUrl,
        createdAt: pre.createdAt,
      },
      ...baseList,
    ];
  }, [plantsQuery.data, preselectedPlantQuery.data]);

  useEffect(() => {
    if (autoAppliedPlantRef.current || !cleanPreselectedPlantId) {
      return;
    }
    if (plantOptions.some((p) => p.id === cleanPreselectedPlantId)) {
      autoAppliedPlantRef.current = true;
      setSelectedPlantId(cleanPreselectedPlantId);
    }
  }, [cleanPreselectedPlantId, plantOptions]);

  const validateLocal = (): boolean => {
    const nextErrors: ScheduleFieldErrors = {};

    if (!selectedPlantId.trim()) {
      nextErrors.userPlantId = 'Vui lòng chọn cây trồng thực tế trước khi tạo lịch.';
    }

    try {
      validateTaskType(taskType);
    } catch (err) {
      nextErrors.taskType =
        err instanceof AppApiError ? err.message : 'Loại công việc không hợp lệ.';
    }

    try {
      validateTaskLabel(taskLabel);
    } catch (err) {
      nextErrors.taskLabel =
        err instanceof AppApiError ? err.message : 'Nhãn công việc không hợp lệ.';
    }

    try {
      validateFrequency(frequency);
    } catch (err) {
      nextErrors.frequency =
        err instanceof AppApiError ? err.message : 'Chu kỳ lặp không hợp lệ.';
    }

    if (frequency === 'CUSTOM') {
      const cleanInt = intervalDaysText.trim();
      const parsed = /^\d+$/.test(cleanInt) ? Number(cleanInt) : Number.NaN;
      try {
        validateIntervalDays('CUSTOM', parsed);
      } catch (err) {
        nextErrors.intervalDays =
          err instanceof AppApiError ? err.message : 'Số ngày lặp phải là số nguyên lớn hơn 0.';
      }
    }

    const cleanReminder = reminderTime.trim();
    if (cleanReminder) {
      try {
        validateReminderTime(cleanReminder);
      } catch (err) {
        nextErrors.reminderTime =
          err instanceof AppApiError ? err.message : 'Giờ nhắc phải theo định dạng HH:mm:ss.';
      }
    }

    let validStartDate = '';
    try {
      validStartDate = validateCreateStartDate(startDate);
    } catch (err) {
      nextErrors.startDate =
        err instanceof AppApiError ? err.message : 'Ngày bắt đầu không hợp lệ.';
    }

    const cleanEndDate = endDate.trim();
    if (cleanEndDate) {
      try {
        validateEndDateValue(cleanEndDate, validStartDate || undefined);
      } catch (err) {
        nextErrors.endDate =
          err instanceof AppApiError ? err.message : 'Ngày kết thúc không hợp lệ.';
      }
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    const initiatedGeneration = getSessionGeneration();
    const initiatedByUserId = currentUserIdRef.current;
    const hasSwitchedSession = () =>
      getSessionGeneration() !== initiatedGeneration ||
      (Boolean(initiatedByUserId) && currentUserIdRef.current !== initiatedByUserId);

    setSubmitError(null);
    if (!validateLocal()) {
      return;
    }

    const cleanLabel = taskLabel.trim();
    const cleanReminder = reminderTime.trim();
    const normalizedReminder = cleanReminder
      ? (validateReminderTime(cleanReminder) ?? undefined)
      : undefined;
    const cleanEndDate = endDate.trim();

    try {
      const created = await createMutation.mutateAsync({
        userPlantId: selectedPlantId.trim(),
        taskType,
        ...(cleanLabel ? { taskLabel: cleanLabel } : {}),
        frequency,
        intervalDays:
          frequency === 'CUSTOM' ? Number(intervalDaysText.trim()) : null,
        ...(normalizedReminder ? { reminderTime: normalizedReminder } : {}),
        startDate: startDate.trim(),
        ...(cleanEndDate ? { endDate: cleanEndDate } : {}),
      });

      if (hasSwitchedSession()) {
        return;
      }

      router.replace({
        pathname: '/schedule/detail',
        params: {
          plantId: created.userPlantId,
          scheduleId: created.id,
        },
      } as never);
    } catch (err) {
      if (hasSwitchedSession()) {
        return;
      }
      if (err instanceof AppApiError) {
        if (err.code === 'SESSION_USER_MISMATCH') {
          return;
        }
        if (err.field && err.field in ({
          userPlantId: true,
          taskType: true,
          taskLabel: true,
          frequency: true,
          intervalDays: true,
          reminderTime: true,
          startDate: true,
          endDate: true,
        } satisfies Record<keyof ScheduleFieldErrors, boolean>)) {
          setFieldErrors((prev) => ({
            ...prev,
            [err.field as keyof ScheduleFieldErrors]: err.message,
          }));
        }
        setSubmitError(err.message);
        return;
      }
      setSubmitError('Không thể tạo lịch chăm sóc mới. Vui lòng thử lại.');
    }
  };

  return (
    <SafeAreaView style={sc.safe} edges={['top']}>
      <ScheduleHeader title="Tạo lịch chăm sóc" />
      <ScrollView contentContainerStyle={sc.content} keyboardShouldPersistTaps="handled">
        <View style={sc.tip}>
          <Text style={sc.title}>Lập lịch chăm sóc cây</Text>
          <Text style={sc.body}>
            Chọn cây của bạn, công việc, chu kỳ và giờ nhắc (tính theo giờ Việt Nam Asia/Ho_Chi_Minh).
          </Text>
        </View>

        {submitError ? (
          <View style={sc.errorBanner} accessibilityRole="alert">
            <Text style={sc.errorBannerText}>{submitError}</Text>
            <Pressable onPress={() => setSubmitError(null)} accessibilityRole="button">
              <Text style={sc.dismissText}>Đóng</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={sc.label}>
          1. Chọn cây cần chăm sóc <Text style={sc.required}>*</Text>
        </Text>
        {plantsQuery.isLoading && plantOptions.length === 0 ? (
          <View style={sc.stateCard}>
            <ActivityIndicator size="small" color={C.primary} />
            <Text style={sc.bodyCenter}>Đang tải danh sách cây của bạn...</Text>
          </View>
        ) : plantsQuery.isError && plantOptions.length === 0 ? (
          <View style={sc.stateCard} accessibilityRole="alert">
            <Text style={sc.error}>{plantsQuery.error.message}</Text>
            <Pressable
              onPress={() => {
                void plantsQuery.refetch();
              }}
              accessibilityRole="button"
              style={sc.secondaryButton}
            >
              <Text style={sc.secondaryText}>Thử lại</Text>
            </Pressable>
          </View>
        ) : plantOptions.length === 0 ? (
          <View style={sc.stateCard}>
            <Text style={sc.sectionTitle}>Bạn chưa có cây trồng nào</Text>
            <Text style={sc.bodyCenter}>
              Hãy thêm ít nhất một cây trồng vào khu vườn trước khi lập lịch chăm sóc.
            </Text>
            <Pressable
              onPress={() => router.push('/garden/add-plant' as never)}
              accessibilityRole="button"
              style={sc.submit}
            >
              <Text style={sc.submitText}>＋  Thêm cây mới</Text>
            </Pressable>
          </View>
        ) : (
          plantOptions.map((item) => {
            const active = selectedPlantId === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`Chọn cây ${item.displayName}`}
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setSelectedPlantId(item.id);
                  if (fieldErrors.userPlantId) {
                    setFieldErrors((prev) => ({ ...prev, userPlantId: undefined }));
                  }
                }}
                style={[sc.plant, active && sc.selected]}
              >
                <View style={sc.plantIcon}>
                  <Text>♧</Text>
                </View>
                <View style={sc.flexCopy}>
                  <Text style={sc.bodyStrong}>{item.displayName}</Text>
                  <Text style={sc.body}>
                    {item.speciesName || 'Cây trồng'}
                    {item.gardenName ? ` • ${item.gardenName}` : ''}
                  </Text>
                </View>
                <Text style={sc.radio}>{active ? '●' : '○'}</Text>
              </Pressable>
            );
          })
        )}
        {fieldErrors.userPlantId ? (
          <Text style={sc.error}>{fieldErrors.userPlantId}</Text>
        ) : null}

        <Text style={sc.label}>
          2. Chọn loại công việc <Text style={sc.required}>*</Text>
        </Text>
        <View style={sc.grid}>
          {TASK_TYPE_OPTIONS.map((opt) => {
            const active = taskType === opt.value;
            return (
              <Pressable
                key={opt.value}
                accessibilityRole="button"
                accessibilityLabel={`Chọn công việc ${opt.label}`}
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setTaskType(opt.value);
                  if (fieldErrors.taskType) {
                    setFieldErrors((prev) => ({ ...prev, taskType: undefined }));
                  }
                }}
                style={[sc.task, active && sc.selected]}
              >
                <Text style={[sc.bodyStrong, !active && sc.choiceMutedText]}>
                  {opt.icon} {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {fieldErrors.taskType ? <Text style={sc.error}>{fieldErrors.taskType}</Text> : null}

        <Text style={sc.label}>Nhãn mô tả công việc (không bắt buộc)</Text>
        <TextInput
          value={taskLabel}
          onChangeText={(text) => {
            setTaskLabel(text);
            if (fieldErrors.taskLabel) {
              setFieldErrors((prev) => ({ ...prev, taskLabel: undefined }));
            }
          }}
          placeholder="Ví dụ: Tưới 300ml nước quanh gốc vào buổi sáng"
          maxLength={220}
          accessibilityLabel="Nhãn mô tả công việc"
          style={[sc.input, fieldErrors.taskLabel && sc.inputError]}
        />
        <Text style={sc.helperText}>
          {taskLabel.trim().length}/{TASK_LABEL_MAX_LENGTH} ký tự
        </Text>
        {fieldErrors.taskLabel ? <Text style={sc.error}>{fieldErrors.taskLabel}</Text> : null}

        <Text style={sc.label}>
          3. Chu kỳ lặp lại <Text style={sc.required}>*</Text>
        </Text>
        <View style={sc.grid}>
          {FREQUENCY_OPTIONS.map((opt) => {
            const active = frequency === opt.value;
            return (
              <Pressable
                key={opt.value}
                accessibilityRole="button"
                accessibilityLabel={`Chọn chu kỳ ${opt.label}`}
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setFrequency(opt.value);
                  if (fieldErrors.frequency || fieldErrors.intervalDays) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      frequency: undefined,
                      intervalDays: undefined,
                    }));
                  }
                }}
                style={[sc.task, active && sc.selected]}
              >
                <Text style={[sc.bodyStrong, !active && sc.choiceMutedText]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {fieldErrors.frequency ? <Text style={sc.error}>{fieldErrors.frequency}</Text> : null}

        {frequency === 'CUSTOM' ? (
          <View style={sc.fieldBlock}>
            <Text style={sc.label}>
              Số ngày giữa các lần lặp <Text style={sc.required}>*</Text>
            </Text>
            <TextInput
              value={intervalDaysText}
              onChangeText={(text) => {
                setIntervalDaysText(text);
                if (fieldErrors.intervalDays) {
                  setFieldErrors((prev) => ({ ...prev, intervalDays: undefined }));
                }
              }}
              keyboardType="number-pad"
              placeholder="Ví dụ: 3"
              accessibilityLabel="Khoảng cách ngày"
              style={[sc.input, fieldErrors.intervalDays && sc.inputError]}
            />
            {fieldErrors.intervalDays ? (
              <Text style={sc.error}>{fieldErrors.intervalDays}</Text>
            ) : null}
          </View>
        ) : null}

        <Text style={sc.label}>
          4. Thời gian áp dụng <Text style={sc.required}>*</Text>
        </Text>
        <View style={sc.row}>
          <View style={[sc.flexCopy, sc.fieldBlock]}>
            <Text style={sc.helperStrong}>Ngày bắt đầu (YYYY-MM-DD)</Text>
            <TextInput
              value={startDate}
              onChangeText={(text) => {
                setStartDate(text);
                if (fieldErrors.startDate) {
                  setFieldErrors((prev) => ({ ...prev, startDate: undefined }));
                }
              }}
              placeholder={getTodayVnDateString()}
              autoCapitalize="none"
              accessibilityLabel="Ngày bắt đầu"
              style={[sc.input, fieldErrors.startDate && sc.inputError]}
            />
          </View>

          <View style={[sc.flexCopy, sc.fieldBlock]}>
            <Text style={sc.helperStrong}>Giờ nhắc (HH:mm:ss)</Text>
            <TextInput
              value={reminderTime}
              onChangeText={(text) => {
                setReminderTime(text);
                if (fieldErrors.reminderTime) {
                  setFieldErrors((prev) => ({ ...prev, reminderTime: undefined }));
                }
              }}
              placeholder={DEFAULT_REMINDER_TIME}
              autoCapitalize="none"
              accessibilityLabel="Giờ nhắc"
              style={[sc.input, fieldErrors.reminderTime && sc.inputError]}
            />
          </View>
        </View>
        {fieldErrors.startDate ? <Text style={sc.error}>{fieldErrors.startDate}</Text> : null}
        {fieldErrors.reminderTime ? (
          <Text style={sc.error}>{fieldErrors.reminderTime}</Text>
        ) : null}
        <Text style={sc.helperText}>
          Nếu bỏ trống giờ nhắc, máy chủ sẽ dùng mặc định 08:00:00 (giờ Việt Nam).
        </Text>

        <Text style={sc.label}>Ngày kết thúc (YYYY-MM-DD, không bắt buộc)</Text>
        <TextInput
          value={endDate}
          onChangeText={(text) => {
            setEndDate(text);
            if (fieldErrors.endDate) {
              setFieldErrors((prev) => ({ ...prev, endDate: undefined }));
            }
          }}
          placeholder="Để trống nếu lặp vô thời hạn"
          autoCapitalize="none"
          accessibilityLabel="Ngày kết thúc"
          style={[sc.input, fieldErrors.endDate && sc.inputError]}
        />
        {fieldErrors.endDate ? <Text style={sc.error}>{fieldErrors.endDate}</Text> : null}

        <Pressable
          disabled={createMutation.isPending || plantOptions.length === 0}
          onPress={() => {
            void handleSubmit();
          }}
          accessibilityRole="button"
          accessibilityState={{
            disabled: createMutation.isPending || plantOptions.length === 0,
          }}
          style={[
            sc.submit,
            (createMutation.isPending || plantOptions.length === 0) && sc.disabled,
          ]}
        >
          <Text style={sc.submitText}>
            {createMutation.isPending ? 'Đang tạo lịch...' : '✓  Tạo lịch chăm sóc'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

export function ScheduleDetailScreen() {
  const { scheduleId, plantId } = useLocalSearchParams<{
    scheduleId?: string;
    plantId?: string;
  }>();
  const cleanScheduleId = typeof scheduleId === 'string' ? scheduleId.trim() : '';
  const cleanPlantIdParam = typeof plantId === 'string' ? plantId.trim() : '';

  const qc = useQueryClient();
  const { user, status } = useAuth();
  const isAuthenticated = status === 'authenticated';
  const currentUserId = typeof user?.id === 'string' ? user.id.trim() : '';
  const currentSessionOwnerKey = currentUserId
    ? `${currentUserId}:${getSessionGeneration()}`
    : '';
  const currentUserIdRef = useRef(currentUserId);
  const prevUserIdRef = useRef(currentUserId);

  const updateMutation = useUpdateScheduleMutation();
  const deleteMutation = useDeleteScheduleMutation();
  const completeMutation = useCompleteScheduleMutation();
  const skipMutation = useSkipScheduleMutation();

  const [scanPage, setScanPage] = useState(0);
  const [deletedOwnerKey, setDeletedOwnerKey] = useState<string | null>(null);
  const [deletingSnapshotState, setDeletingSnapshotState] = useState<{
    ownerKey: string;
    schedule: CareScheduleDto;
  } | null>(null);
  const [localSnapshotState, setLocalSnapshotState] = useState<{
    ownerKey: string;
    schedule: CareScheduleDto;
  } | null>(null);
  const [hydratedKey, setHydratedKey] = useState('');

  const isDeleted =
    Boolean(currentSessionOwnerKey) && deletedOwnerKey === currentSessionOwnerKey;
  const deletingSnapshot =
    currentSessionOwnerKey && deletingSnapshotState?.ownerKey === currentSessionOwnerKey
      ? deletingSnapshotState.schedule
      : null;
  const localSnapshot =
    currentSessionOwnerKey && localSnapshotState?.ownerKey === currentSessionOwnerKey
      ? localSnapshotState.schedule
      : null;

  const [taskType, setTaskType] = useState<TaskType>('WATERING');
  const [taskLabel, setTaskLabel] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('DAILY');
  const [intervalDaysText, setIntervalDaysText] = useState('');
  const [reminderTime, setReminderTime] = useState(DEFAULT_REMINDER_TIME);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ScheduleFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = currentUserId;
    currentUserIdRef.current = currentUserId;
    if (prevUserId && prevUserId !== currentUserId) {
      setScanPage(0);
      setDeletedOwnerKey(null);
      setDeletingSnapshotState(null);
      setLocalSnapshotState(null);
      setHydratedKey('');
      setFieldErrors({});
      setSubmitError(null);
      setStatusMessage(null);
    }
  }, [currentUserId]);

  useEffect(() => {
    setScanPage(0);
    setDeletedOwnerKey(null);
    setDeletingSnapshotState(null);
    setLocalSnapshotState(null);
    setHydratedKey('');
    setFieldErrors({});
    setSubmitError(null);
    setStatusMessage(null);
  }, [cleanScheduleId, cleanPlantIdParam]);

  const resolvedPlantIdFromCache = useMemo(() => {
    if (cleanPlantIdParam) {
      return cleanPlantIdParam;
    }
    if (!currentUserId || !cleanScheduleId) {
      return '';
    }
    const todayCached = qc.getQueryData<TodayScheduleItemDto[]>(
      queryKeys.schedules.today(currentUserId)
    );
    const matchedToday = todayCached?.find((item) => item.scheduleId === cleanScheduleId);
    if (matchedToday?.plantId) {
      return matchedToday.plantId;
    }
    const plantEntries = qc.getQueriesData<PageResponse<CareScheduleDto>>({
      queryKey: queryKeys.plants.details(currentUserId),
    });
    for (const [key, pageData] of plantEntries) {
      if (!Array.isArray(key) || key[4] !== 'schedules' || !Array.isArray(pageData?.content)) {
        continue;
      }
      const match = pageData.content.find((item) => item.id === cleanScheduleId);
      if (match?.userPlantId) {
        return match.userPlantId;
      }
    }
    return '';
  }, [cleanPlantIdParam, cleanScheduleId, currentUserId, qc]);

  const effectivePlantId = resolvedPlantIdFromCache;

  const plantSchedulesQuery = usePlantSchedules(
    effectivePlantId,
    { page: scanPage, size: 100 },
    {
      enabled:
        Boolean(effectivePlantId) &&
        Boolean(cleanScheduleId) &&
        !isDeleted &&
        !deleteMutation.isPending,
      keepPreviousData: false,
    }
  );

  const scheduleFromQuery = useMemo(() => {
    if (!cleanScheduleId) {
      return undefined;
    }
    const fromCurrentPage = plantSchedulesQuery.data?.content.find(
      (item) => item.id === cleanScheduleId
    );
    if (fromCurrentPage) {
      return fromCurrentPage;
    }
    if (currentUserId && effectivePlantId) {
      const cachedPages = qc.getQueriesData<PageResponse<CareScheduleDto>>({
        queryKey: queryKeys.plants.schedulesBase(currentUserId, effectivePlantId),
      });
      for (const [, pageData] of cachedPages) {
        const match = pageData?.content.find((item) => item.id === cleanScheduleId);
        if (match) {
          return match;
        }
      }
    }
    return undefined;
  }, [cleanScheduleId, currentUserId, effectivePlantId, plantSchedulesQuery.data, qc]);

  useEffect(() => {
    if (
      isDeleted ||
      deleteMutation.isPending ||
      scheduleFromQuery ||
      plantSchedulesQuery.isFetching ||
      plantSchedulesQuery.isError ||
      !plantSchedulesQuery.data
    ) {
      return;
    }
    const totalPages = Math.max(0, Math.trunc(plantSchedulesQuery.data.totalPages || 0));
    if (scanPage + 1 < totalPages) {
      setScanPage((prev) => prev + 1);
    }
  }, [
    isDeleted,
    deleteMutation.isPending,
    scheduleFromQuery,
    plantSchedulesQuery.isFetching,
    plantSchedulesQuery.isError,
    plantSchedulesQuery.data,
    scanPage,
  ]);

  const activeSchedule = deletingSnapshot ?? scheduleFromQuery ?? localSnapshot;
  const isDetailClockEnabled =
    isAuthenticated &&
    Boolean(currentUserId) &&
    Boolean(activeSchedule) &&
    activeSchedule?.status === 'ACTIVE' &&
    !isDeleted &&
    !deleteMutation.isPending;
  const activeNextScheduledAt =
    isDetailClockEnabled && activeSchedule?.nextScheduledAt
      ? activeSchedule.nextScheduledAt
      : undefined;
  const detailTransitionTimestamps = useMemo(
    () => (activeNextScheduledAt ? [activeNextScheduledAt] : []),
    [activeNextScheduledAt]
  );
  const { nowMs: scheduleNowMs } = useScheduleClock({
    enabled: isDetailClockEnabled,
    transitionIsoTimestamps: detailTransitionTimestamps,
    trackVnMidnight: false,
  });

  useEffect(() => {
    if (!activeSchedule || !currentSessionOwnerKey) {
      return;
    }
    const nextKey = `${currentSessionOwnerKey}:${activeSchedule.id}`;
    if (hydratedKey === nextKey) {
      return;
    }
    setHydratedKey(nextKey);
    setTaskType(activeSchedule.taskType);
    setTaskLabel(activeSchedule.taskLabel ?? '');
    setFrequency(activeSchedule.frequency);
    setIntervalDaysText(
      activeSchedule.intervalDays !== null && activeSchedule.intervalDays !== undefined
        ? String(activeSchedule.intervalDays)
        : '3'
    );
    setReminderTime(activeSchedule.reminderTime ?? DEFAULT_REMINDER_TIME);
    setStartDate(activeSchedule.startDate);
    setEndDate(activeSchedule.endDate ?? '');
  }, [activeSchedule, currentSessionOwnerKey, hydratedKey]);

  const anyPending =
    updateMutation.isPending ||
    deleteMutation.isPending ||
    completeMutation.isPending ||
    skipMutation.isPending;

  if (!cleanScheduleId) {
    return (
      <SafeAreaView style={sc.safe} edges={['top']}>
        <ScheduleHeader title="Chi tiết lịch chăm sóc" />
        <View style={sc.centerState}>
          <Text style={sc.sectionTitle}>Không tìm thấy mã lịch chăm sóc</Text>
          <Text style={sc.bodyCenter}>
            Vui lòng chọn một lịch từ Lịch hôm nay hoặc từ trang Chi tiết cây trồng.
          </Text>
          <Pressable
            onPress={() => router.replace('/schedule' as never)}
            accessibilityRole="button"
            style={sc.submit}
          >
            <Text style={sc.submitText}>Mở Lịch chăm sóc</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!effectivePlantId) {
    return (
      <SafeAreaView style={sc.safe} edges={['top']}>
        <ScheduleHeader title="Chi tiết lịch chăm sóc" />
        <View style={sc.centerState}>
          <Text style={sc.sectionTitle}>Thiếu thông tin cây trồng của lịch</Text>
          <Text style={sc.bodyCenter}>
            Cần mã cây trồng (plantId) để đồng bộ lịch chăm sóc từ máy chủ.
          </Text>
          <Pressable
            onPress={() => router.replace('/schedule' as never)}
            accessibilityRole="button"
            style={sc.submit}
          >
            <Text style={sc.submitText}>Quay lại Lịch chăm sóc</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!activeSchedule && (plantSchedulesQuery.isLoading || plantSchedulesQuery.isFetching)) {
    return (
      <SafeAreaView style={sc.safe} edges={['top']}>
        <ScheduleHeader title="Chi tiết lịch chăm sóc" />
        <View style={sc.centerState}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={sc.bodyCenter}>Đang tải chi tiết lịch chăm sóc từ máy chủ...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!activeSchedule || (plantSchedulesQuery.isError && !activeSchedule)) {
    const errStatus = plantSchedulesQuery.error?.statusCode;
    return (
      <SafeAreaView style={sc.safe} edges={['top']}>
        <ScheduleHeader title="Chi tiết lịch chăm sóc" />
        <View style={sc.centerState} accessibilityRole="alert">
          <Text style={sc.sectionTitle}>
            {errStatus === 403
              ? 'Không có quyền truy cập lịch chăm sóc'
              : 'Không tìm thấy lịch chăm sóc'}
          </Text>
          <Text style={sc.bodyCenter}>
            {plantSchedulesQuery.error?.message ||
              'Lịch chăm sóc không tồn tại hoặc đã bị xóa khỏi cây trồng.'}
          </Text>
          <View style={sc.row}>
            {errStatus !== 403 && errStatus !== 404 ? (
              <Pressable
                onPress={() => {
                  void plantSchedulesQuery.refetch();
                }}
                accessibilityRole="button"
                style={sc.submit}
              >
                <Text style={sc.submitText}>Thử lại</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() =>
                router.replace({
                  pathname: '/plant-detail',
                  params: { plantId: effectivePlantId },
                } as never)
              }
              accessibilityRole="button"
              style={sc.secondaryButton}
            >
              <Text style={sc.secondaryText}>Về chi tiết cây</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const taskMeta = getTaskTypeMeta(activeSchedule.taskType);
  const statusMeta = getScheduleStatusMeta(activeSchedule.status);
  const nextTimeInfo = formatNextScheduledAtVn(
    activeSchedule.nextScheduledAt,
    new Date(scheduleNowMs)
  );
  const runtimeState = getScheduleRuntimeState(activeSchedule, scheduleNowMs);
  const dueNow = runtimeState.isDue;
  const overdueNow = runtimeState.isOverdue;

  const buildSessionGuard = () => {
    const initiatedGeneration = getSessionGeneration();
    const initiatedByUserId = currentUserIdRef.current;
    return () =>
      getSessionGeneration() !== initiatedGeneration ||
      (Boolean(initiatedByUserId) && currentUserIdRef.current !== initiatedByUserId);
  };

  const handleEditSave = async () => {
    const hasSwitchedSession = buildSessionGuard();
    setSubmitError(null);
    setStatusMessage(null);

    const nextErrors: ScheduleFieldErrors = {};

    try {
      validateTaskType(taskType);
    } catch (err) {
      nextErrors.taskType =
        err instanceof AppApiError ? err.message : 'Loại công việc không hợp lệ.';
    }

    try {
      validateTaskLabel(taskLabel);
    } catch (err) {
      nextErrors.taskLabel =
        err instanceof AppApiError ? err.message : 'Nhãn công việc không hợp lệ.';
    }

    try {
      validateFrequency(frequency);
    } catch (err) {
      nextErrors.frequency =
        err instanceof AppApiError ? err.message : 'Chu kỳ lặp không hợp lệ.';
    }

    if (frequency === 'CUSTOM') {
      const cleanInt = intervalDaysText.trim();
      const parsed = /^\d+$/.test(cleanInt) ? Number(cleanInt) : Number.NaN;
      try {
        validateIntervalDays('CUSTOM', parsed);
      } catch (err) {
        nextErrors.intervalDays =
          err instanceof AppApiError ? err.message : 'Số ngày lặp phải là số nguyên lớn hơn 0.';
      }
    }

    const cleanReminder = reminderTime.trim();
    if (cleanReminder) {
      try {
        validateReminderTime(cleanReminder);
      } catch (err) {
        nextErrors.reminderTime =
          err instanceof AppApiError ? err.message : 'Giờ nhắc phải theo định dạng HH:mm:ss.';
      }
    }

    const cleanStart = startDate.trim();
    let validStartDate = activeSchedule.startDate;
    if (!cleanStart) {
      nextErrors.startDate = 'Ngày bắt đầu không được để trống.';
    } else {
      try {
        validStartDate = validateLocalDateString(cleanStart, 'startDate', 'Ngày bắt đầu');
      } catch (err) {
        nextErrors.startDate =
          err instanceof AppApiError ? err.message : 'Ngày bắt đầu không hợp lệ.';
      }
    }

    const cleanEnd = endDate.trim();
    if (cleanEnd) {
      try {
        validateEndDateValue(cleanEnd, validStartDate);
      } catch (err) {
        nextErrors.endDate =
          err instanceof AppApiError ? err.message : 'Ngày kết thúc không hợp lệ.';
      }
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const cleanLabel = taskLabel.trim();
    const normalizedReminder = cleanReminder
      ? (validateReminderTime(cleanReminder) ?? null)
      : null;

    try {
      const updated = await updateMutation.mutateAsync({
        scheduleId: activeSchedule.id,
        plantId: activeSchedule.userPlantId,
        data: {
          taskType,
          taskLabel: cleanLabel ? cleanLabel : null,
          frequency,
          intervalDays:
            frequency === 'CUSTOM' ? Number(intervalDaysText.trim()) : null,
          reminderTime: normalizedReminder,
          startDate: validStartDate,
          endDate: cleanEnd ? cleanEnd : null,
        },
      });
      if (hasSwitchedSession()) {
        return;
      }
      setLocalSnapshotState(
        currentSessionOwnerKey
          ? { ownerKey: currentSessionOwnerKey, schedule: updated }
          : null
      );
      setTaskType(updated.taskType);
      setTaskLabel(updated.taskLabel ?? '');
      setFrequency(updated.frequency);
      setIntervalDaysText(
        updated.intervalDays !== null && updated.intervalDays !== undefined
          ? String(updated.intervalDays)
          : '3'
      );
      setReminderTime(updated.reminderTime ?? DEFAULT_REMINDER_TIME);
      setStartDate(updated.startDate);
      setEndDate(updated.endDate ?? '');
      setStatusMessage('Đã cập nhật thông tin lịch chăm sóc.');
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
      setSubmitError('Không thể cập nhật lịch chăm sóc. Vui lòng thử lại.');
    }
  };

  const handleStatusChange = async (nextStatus: ScheduleStatus, successText: string) => {
    const hasSwitchedSession = buildSessionGuard();
    setSubmitError(null);
    setStatusMessage(null);
    try {
      const updated = await updateMutation.mutateAsync({
        scheduleId: activeSchedule.id,
        plantId: activeSchedule.userPlantId,
        data: { status: nextStatus },
      });
      if (hasSwitchedSession()) {
        return;
      }
      setLocalSnapshotState(
        currentSessionOwnerKey
          ? { ownerKey: currentSessionOwnerKey, schedule: updated }
          : null
      );
      setStatusMessage(successText);
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
      setSubmitError('Không thể thay đổi trạng thái lịch. Vui lòng thử lại.');
    }
  };

  const handleRequestCancelSchedule = () => {
    Alert.alert(
      'Xác nhận hủy lịch chăm sóc',
      'Hủy lịch sẽ chuyển trạng thái lịch sang ĐÃ HỦY (CANCELLED) nhưng vẫn giữ nguyên cấu hình và lịch sử chăm sóc.',
      [
        { text: 'Đóng', style: 'cancel' },
        {
          text: 'Hủy lịch',
          style: 'destructive',
          onPress: () => {
            void handleStatusChange('CANCELLED', 'Lịch chăm sóc đã được chuyển sang trạng thái Đã hủy.');
          },
        },
      ]
    );
  };

  const handleCareExecution = async (mode: 'complete' | 'skip') => {
    const hasSwitchedSession = buildSessionGuard();
    if (!getScheduleRuntimeState(activeSchedule, scheduleNowMs).isDue) {
      setSubmitError('Lượt chăm sóc hiện tại chưa đến hạn thực hiện.');
      return;
    }

    setSubmitError(null);
    setStatusMessage(null);
    try {
      const result =
        mode === 'complete'
          ? await completeMutation.mutateAsync({
              scheduleId: activeSchedule.id,
              plantId: activeSchedule.userPlantId,
            })
          : await skipMutation.mutateAsync({
              scheduleId: activeSchedule.id,
              plantId: activeSchedule.userPlantId,
            });
      if (hasSwitchedSession()) {
        return;
      }
      const nextStatus = result.scheduleStatus as ScheduleStatus;
      setLocalSnapshotState(
        currentSessionOwnerKey
          ? {
              ownerKey: currentSessionOwnerKey,
              schedule: {
                ...activeSchedule,
                status: nextStatus,
                nextScheduledAt: result.nextScheduledAt ?? activeSchedule.nextScheduledAt,
                isOverdue: false,
              },
            }
          : null
      );
      setStatusMessage(
        mode === 'complete'
          ? 'Đã đánh dấu hoàn thành lượt chăm sóc và cập nhật kỳ tiếp theo.'
          : 'Đã bỏ qua lượt chăm sóc này và chuyển sang chu kỳ tiếp theo.'
      );
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
      setSubmitError('Không thể thực hiện thao tác trên lượt chăm sóc này.');
    }
  };

  const handleRequestDeleteSchedule = () => {
    const hasSwitchedSession = buildSessionGuard();
    Alert.alert(
      'Xác nhận xóa vĩnh viễn lịch',
      'Bạn có chắc chắn muốn xóa lịch chăm sóc này? Các bản ghi lịch sử chăm sóc (Care Logs) trước đó vẫn được bảo toàn trên máy chủ (schedule_id = NULL). Thao tác xóa lịch không thể hoàn tác.',
      [
        { text: 'Giữ lại', style: 'cancel' },
        {
          text: 'Xóa lịch',
          style: 'destructive',
          onPress: () => {
            if (hasSwitchedSession()) {
              return;
            }
            setSubmitError(null);
            setStatusMessage(null);
            setDeletingSnapshotState(
              currentSessionOwnerKey
                ? { ownerKey: currentSessionOwnerKey, schedule: activeSchedule }
                : null
            );
            setDeletedOwnerKey(currentSessionOwnerKey || null);
            void deleteMutation
              .mutateAsync({
                scheduleId: activeSchedule.id,
                plantId: activeSchedule.userPlantId,
              })
              .then(() => {
                if (hasSwitchedSession()) {
                  return;
                }
                router.replace({
                  pathname: '/plant-detail',
                  params: { plantId: activeSchedule.userPlantId },
                } as never);
              })
              .catch((err) => {
                if (hasSwitchedSession()) {
                  return;
                }
                setDeletedOwnerKey(null);
                setDeletingSnapshotState(null);
                if (err instanceof AppApiError) {
                  if (err.code === 'SESSION_USER_MISMATCH') {
                    return;
                  }
                  setSubmitError(err.message);
                  return;
                }
                setSubmitError('Không thể xóa lịch chăm sóc. Vui lòng thử lại.');
              });
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={sc.safe} edges={['top']}>
      <ScheduleHeader
        title="Chi tiết lịch chăm sóc"
        fallbackRoute={`/plant-detail?plantId=${encodeURIComponent(activeSchedule.userPlantId)}`}
      />
      <ScrollView contentContainerStyle={sc.content} keyboardShouldPersistTaps="handled">
        {submitError ? (
          <View style={sc.errorBanner} accessibilityRole="alert">
            <Text style={sc.errorBannerText}>{submitError}</Text>
            <Pressable onPress={() => setSubmitError(null)} accessibilityRole="button">
              <Text style={sc.dismissText}>Đóng</Text>
            </Pressable>
          </View>
        ) : null}

        {statusMessage ? (
          <View style={sc.successBanner} accessibilityLiveRegion="polite">
            <Text style={sc.successBannerText}>{statusMessage}</Text>
            <Pressable onPress={() => setStatusMessage(null)} accessibilityRole="button">
              <Text style={sc.successDismissText}>Đóng</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={sc.plantHero}>
          <View style={sc.plantIconLarge}>
            <Text style={sc.heroGlyph}>{taskMeta.icon}</Text>
          </View>
          <View style={sc.plantHeroCopy}>
            <Text style={sc.title}>{taskMeta.label}</Text>
            <Text style={sc.bodyStrong}>{activeSchedule.plantName}</Text>
            {activeSchedule.taskLabel ? (
              <Text style={sc.body}>{activeSchedule.taskLabel}</Text>
            ) : null}
            <View style={sc.pills}>
              <StatusTag label={statusMeta.label} tone={statusMeta.tone} />
              {activeSchedule.status === 'ACTIVE' ? (
                overdueNow ? (
                  <StatusTag label="Quá hạn" tone="peach" />
                ) : dueNow ? (
                  <StatusTag label="Đến hạn" tone="mint" />
                ) : (
                  <StatusTag label="Chưa đến giờ" tone="plain" />
                )
              ) : null}
            </View>
          </View>
        </View>

        <View style={sc.detailTask}>
          <Text style={sc.sectionTitle}>Thông tin hiện tại</Text>
          <Text style={sc.body}>
            Cây trồng: {activeSchedule.plantName} (cố định sau khi tạo)
          </Text>
          <Text style={sc.body}>
            Chu kỳ: {getFrequencyLabel(activeSchedule.frequency, activeSchedule.intervalDays)}
          </Text>
          <Text style={sc.body}>
            Giờ nhắc: {activeSchedule.reminderTime ?? DEFAULT_REMINDER_TIME} (Asia/Ho_Chi_Minh)
          </Text>
          <Text style={sc.body}>
            Thời hạn: {activeSchedule.startDate}
            {activeSchedule.endDate ? ` → ${activeSchedule.endDate}` : ' (Không giới hạn)'}
          </Text>
          <Text style={sc.bodyStrong}>
            Lần thực hiện tiếp theo: {nextTimeInfo.dateTimeLabel}
          </Text>

          <Pressable
            onPress={() =>
              router.push({
                pathname: '/plant-detail',
                params: { plantId: activeSchedule.userPlantId },
              } as never)
            }
            accessibilityRole="button"
            style={sc.inlineLinkButton}
          >
            <Text style={sc.link}>Mở chi tiết cây {activeSchedule.plantName} ›</Text>
          </Pressable>
        </View>

        <View style={sc.detailTask}>
          <Text style={sc.sectionTitle}>Thực hiện lượt chăm sóc</Text>
          <Text style={sc.body}>
            {activeSchedule.status !== 'ACTIVE'
              ? 'Lịch không ở trạng thái Đang hoạt động nên không thể Hoàn thành hoặc Bỏ qua.'
              : overdueNow
                ? 'Lượt chăm sóc này đã quá hạn. Bạn có thể đánh dấu hoàn thành hoặc bỏ qua chu kỳ hiện tại.'
                : dueNow
                  ? 'Lượt chăm sóc này đã đến hạn. Bạn có thể đánh dấu hoàn thành hoặc bỏ qua chu kỳ hiện tại.'
                  : `Chưa đến hạn thực hiện (${nextTimeInfo.dateTimeLabel}).`}
          </Text>
          <View style={sc.row}>
            <Pressable
              disabled={anyPending || !dueNow}
              onPress={() => {
                void handleCareExecution('complete');
              }}
              accessibilityRole="button"
              accessibilityLabel="Hoàn thành lượt chăm sóc"
              accessibilityState={{ disabled: anyPending || !dueNow }}
              style={[sc.smallPrimaryButton, { flex: 1 }, (anyPending || !dueNow) && sc.disabled]}
            >
              <Text style={sc.smallPrimaryText}>
                {completeMutation.isPending ? 'Đang xử lý...' : '✓ Hoàn thành lượt này'}
              </Text>
            </Pressable>
            <Pressable
              disabled={anyPending || !dueNow}
              onPress={() => {
                void handleCareExecution('skip');
              }}
              accessibilityRole="button"
              accessibilityLabel="Bỏ qua lượt chăm sóc"
              accessibilityState={{ disabled: anyPending || !dueNow }}
              style={[
                sc.smallSecondaryButton,
                { flex: 1 },
                (anyPending || !dueNow) && sc.disabled,
              ]}
            >
              <Text style={sc.smallSecondaryText}>
                {skipMutation.isPending ? 'Đang xử lý...' : 'Bỏ qua lượt này'}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={sc.detailTask}>
          <Text style={sc.sectionTitle}>Điều khiển trạng thái lịch</Text>
          <View style={sc.row}>
            {activeSchedule.status === 'ACTIVE' ? (
              <Pressable
                disabled={anyPending}
                onPress={() => {
                  void handleStatusChange('PAUSED', 'Đã tạm ngưng lịch chăm sóc.');
                }}
                accessibilityRole="button"
                accessibilityState={{ disabled: anyPending }}
                style={[sc.smallSecondaryButton, { flex: 1 }, anyPending && sc.disabled]}
              >
                <Text style={sc.smallSecondaryText}>Tạm ngưng</Text>
              </Pressable>
            ) : null}

            {activeSchedule.status === 'PAUSED' ? (
              <Pressable
                disabled={anyPending}
                onPress={() => {
                  void handleStatusChange('ACTIVE', 'Đã tiếp tục kích hoạt lịch chăm sóc.');
                }}
                accessibilityRole="button"
                accessibilityState={{ disabled: anyPending }}
                style={[sc.smallPrimaryButton, { flex: 1 }, anyPending && sc.disabled]}
              >
                <Text style={sc.smallPrimaryText}>Tiếp tục lịch</Text>
              </Pressable>
            ) : null}

            {activeSchedule.status === 'ACTIVE' || activeSchedule.status === 'PAUSED' ? (
              <Pressable
                disabled={anyPending}
                onPress={handleRequestCancelSchedule}
                accessibilityRole="button"
                accessibilityState={{ disabled: anyPending }}
                style={[sc.smallWarningButton, { flex: 1 }, anyPending && sc.disabled]}
              >
                <Text style={sc.smallWarningText}>Hủy lịch (CANCELLED)</Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable
            disabled={anyPending}
            onPress={handleRequestDeleteSchedule}
            accessibilityRole="button"
            accessibilityState={{ disabled: anyPending }}
            style={[sc.dangerButton, anyPending && sc.disabled]}
          >
            <Text style={sc.dangerText}>
              {deleteMutation.isPending ? 'Đang xóa lịch...' : 'Xóa vĩnh viễn lịch'}
            </Text>
          </Pressable>
        </View>

        <View style={sc.detailTask}>
          <Text style={sc.sectionTitle}>Chỉnh sửa thông tin lịch</Text>

          <Text style={sc.label}>Loại công việc</Text>
          <View style={sc.grid}>
            {TASK_TYPE_OPTIONS.map((opt) => {
              const active = taskType === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  accessibilityRole="button"
                  accessibilityLabel={`Sửa công việc ${opt.label}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    setTaskType(opt.value);
                    if (fieldErrors.taskType) {
                      setFieldErrors((prev) => ({ ...prev, taskType: undefined }));
                    }
                  }}
                  style={[sc.task, active && sc.selected]}
                >
                  <Text style={[sc.bodyStrong, !active && sc.choiceMutedText]}>
                    {opt.icon} {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {fieldErrors.taskType ? <Text style={sc.error}>{fieldErrors.taskType}</Text> : null}

          <View style={sc.labelRow}>
            <Text style={sc.label}>Nhãn mô tả</Text>
            <Pressable
              onPress={() => {
                setTaskLabel('');
                setFieldErrors((prev) => ({ ...prev, taskLabel: undefined }));
              }}
              accessibilityRole="button"
            >
              <Text style={sc.link}>Xóa nhãn</Text>
            </Pressable>
          </View>
          <TextInput
            value={taskLabel}
            onChangeText={(text) => {
              setTaskLabel(text);
              if (fieldErrors.taskLabel) {
                setFieldErrors((prev) => ({ ...prev, taskLabel: undefined }));
              }
            }}
            placeholder="Để trống để xóa nhãn (gửi null)"
            maxLength={220}
            accessibilityLabel="Sửa nhãn mô tả công việc"
            style={[sc.input, fieldErrors.taskLabel && sc.inputError]}
          />
          {fieldErrors.taskLabel ? <Text style={sc.error}>{fieldErrors.taskLabel}</Text> : null}

          <Text style={sc.label}>Chu kỳ lặp lại</Text>
          <View style={sc.grid}>
            {FREQUENCY_OPTIONS.map((opt) => {
              const active = frequency === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  accessibilityRole="button"
                  accessibilityLabel={`Sửa chu kỳ ${opt.label}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    setFrequency(opt.value);
                    if (opt.value === 'CUSTOM' && !intervalDaysText.trim()) {
                      setIntervalDaysText('3');
                    }
                    setFieldErrors((prev) => ({
                      ...prev,
                      frequency: undefined,
                      intervalDays: undefined,
                    }));
                  }}
                  style={[sc.task, active && sc.selected]}
                >
                  <Text style={[sc.bodyStrong, !active && sc.choiceMutedText]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {fieldErrors.frequency ? <Text style={sc.error}>{fieldErrors.frequency}</Text> : null}

          {frequency === 'CUSTOM' ? (
            <View style={sc.fieldBlock}>
              <Text style={sc.label}>Số ngày giữa các lần lặp</Text>
              <TextInput
                value={intervalDaysText}
                onChangeText={(text) => {
                  setIntervalDaysText(text);
                  if (fieldErrors.intervalDays) {
                    setFieldErrors((prev) => ({ ...prev, intervalDays: undefined }));
                  }
                }}
                keyboardType="number-pad"
                placeholder="Ví dụ: 3"
                accessibilityLabel="Sửa khoảng cách ngày"
                style={[sc.input, fieldErrors.intervalDays && sc.inputError]}
              />
              {fieldErrors.intervalDays ? (
                <Text style={sc.error}>{fieldErrors.intervalDays}</Text>
              ) : null}
            </View>
          ) : null}

          <View style={sc.labelRow}>
            <Text style={sc.label}>Giờ nhắc (HH:mm:ss)</Text>
            <Pressable
              onPress={() => {
                setReminderTime('');
                setFieldErrors((prev) => ({ ...prev, reminderTime: undefined }));
              }}
              accessibilityRole="button"
            >
              <Text style={sc.link}>Đặt mặc định 08:00:00</Text>
            </Pressable>
          </View>
          <TextInput
            value={reminderTime}
            onChangeText={(text) => {
              setReminderTime(text);
              if (fieldErrors.reminderTime) {
                setFieldErrors((prev) => ({ ...prev, reminderTime: undefined }));
              }
            }}
            placeholder="Để trống để khôi phục 08:00:00 (gửi null)"
            autoCapitalize="none"
            accessibilityLabel="Sửa giờ nhắc"
            style={[sc.input, fieldErrors.reminderTime && sc.inputError]}
          />
          {fieldErrors.reminderTime ? (
            <Text style={sc.error}>{fieldErrors.reminderTime}</Text>
          ) : null}

          <Text style={sc.label}>Ngày bắt đầu (YYYY-MM-DD)</Text>
          <TextInput
            value={startDate}
            onChangeText={(text) => {
              setStartDate(text);
              if (fieldErrors.startDate) {
                setFieldErrors((prev) => ({ ...prev, startDate: undefined }));
              }
            }}
            autoCapitalize="none"
            accessibilityLabel="Sửa ngày bắt đầu"
            style={[sc.input, fieldErrors.startDate && sc.inputError]}
          />
          {fieldErrors.startDate ? <Text style={sc.error}>{fieldErrors.startDate}</Text> : null}

          <View style={sc.labelRow}>
            <Text style={sc.label}>Ngày kết thúc (YYYY-MM-DD)</Text>
            <Pressable
              onPress={() => {
                setEndDate('');
                setFieldErrors((prev) => ({ ...prev, endDate: undefined }));
              }}
              accessibilityRole="button"
            >
              <Text style={sc.link}>Xóa ngày kết thúc</Text>
            </Pressable>
          </View>
          <TextInput
            value={endDate}
            onChangeText={(text) => {
              setEndDate(text);
              if (fieldErrors.endDate) {
                setFieldErrors((prev) => ({ ...prev, endDate: undefined }));
              }
            }}
            placeholder="Để trống nếu vô thời hạn (gửi null)"
            autoCapitalize="none"
            accessibilityLabel="Sửa ngày kết thúc"
            style={[sc.input, fieldErrors.endDate && sc.inputError]}
          />
          {fieldErrors.endDate ? <Text style={sc.error}>{fieldErrors.endDate}</Text> : null}

          <Pressable
            disabled={anyPending}
            onPress={() => {
              void handleEditSave();
            }}
            accessibilityRole="button"
            accessibilityState={{ disabled: anyPending }}
            style={[sc.submit, anyPending && sc.disabled]}
          >
            <Text style={sc.submitText}>
              {updateMutation.isPending ? 'Đang lưu thay đổi...' : 'Lưu cập nhật lịch'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const sc = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: {
    height: 52,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DDE8E0',
  },
  backButton: { width: 34, justifyContent: 'center' },
  back: { color: C.forest, fontSize: 29 },
  headerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 15 },
  headerSpacer: { width: 34 },
  content: { padding: 13, gap: 10, paddingBottom: 28 },
  tip: { padding: 12, borderRadius: 12, backgroundColor: C.softSurface, gap: 4 },
  title: { color: C.forest, fontFamily: F.bold, fontSize: 17 },
  body: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 17 },
  bodyCenter: {
    color: C.secondaryText,
    fontFamily: F.regular,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },
  bodyStrong: { color: C.forest, fontFamily: F.semiBold, fontSize: 12 },
  choiceMutedText: { color: C.secondaryText },
  flexCopy: { flex: 1, gap: 2 },
  fieldBlock: { gap: 4 },
  label: { marginTop: 4, color: C.text, fontFamily: F.semiBold, fontSize: 12 },
  labelRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  required: { color: C.terracotta },
  plant: {
    minHeight: 50,
    padding: 8,
    borderRadius: 10,
    backgroundColor: C.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  plantIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: C.softSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plantIconLarge: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: C.softSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGlyph: { fontSize: 24, color: C.forest },
  selected: { borderWidth: 1, borderColor: C.primary, backgroundColor: '#E1F2E7' },
  radio: { marginLeft: 'auto', color: C.primary, fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  task: {
    minHeight: 37,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: '#E2EAE3',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  input: {
    minHeight: 42,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: '#DDE8E0',
    color: C.text,
    fontFamily: F.regular,
    fontSize: 12,
  },
  inputError: { borderColor: '#B42318' },
  helperText: { color: C.mutedText, fontFamily: F.regular, fontSize: 10 },
  helperStrong: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 10 },
  error: { color: '#B42318', fontFamily: F.regular, fontSize: 11 },
  submit: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitText: { color: C.surface, fontFamily: F.semiBold, fontSize: 12 },
  secondaryButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: C.softSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: C.forest, fontFamily: F.semiBold, fontSize: 12 },
  dangerButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: '#F5C2C0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerText: { color: '#B42318', fontFamily: F.semiBold, fontSize: 12 },
  smallPrimaryButton: {
    minHeight: 34,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallPrimaryText: { color: C.surface, fontFamily: F.semiBold, fontSize: 11 },
  smallSecondaryButton: {
    minHeight: 34,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: C.softSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallSecondaryText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  smallWarningButton: {
    minHeight: 34,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: '#FFF4E5',
    borderWidth: 1,
    borderColor: '#F7CE99',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallWarningText: { color: '#914218', fontFamily: F.semiBold, fontSize: 11 },
  smallGhostButton: {
    minHeight: 34,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
  plantHero: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: C.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  plantHeroCopy: { flex: 1, gap: 4 },
  tag: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 99,
    fontFamily: F.semiBold,
    fontSize: 10,
  },
  tagMint: { backgroundColor: '#D5F2E1', color: C.forest },
  tagPeach: { backgroundColor: '#FFE0CF', color: '#914218' },
  tagDanger: { backgroundColor: '#FDECEC', color: '#B42318' },
  tagPlain: { backgroundColor: '#E7EEE8', color: C.secondaryText },
  sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 13 },
  detailTask: { padding: 12, borderRadius: 12, backgroundColor: C.surface, gap: 7 },
  scheduleItemCard: { padding: 11, borderRadius: 12, backgroundColor: C.surface, gap: 6 },
  inlineLinkButton: { paddingTop: 4, alignSelf: 'flex-start' },
  link: { color: C.primary, fontFamily: F.semiBold, fontSize: 11 },
  stateCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: C.surface,
    alignItems: 'center',
    gap: 8,
  },
  centerState: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  scheduleBanner: {
    padding: 12,
    borderRadius: 13,
    backgroundColor: C.softSurface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  bannerIcon: { color: C.forest, fontSize: 22 },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryToolbarButton: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBtn: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: '#E7EEE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBtnText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: {
    flex: 1,
    minWidth: '46%',
    minHeight: 54,
    padding: 10,
    borderRadius: 12,
    backgroundColor: C.surface,
  },
  metricValue: { color: C.forest, fontFamily: F.bold, fontSize: 16 },
  pills: { flexDirection: 'row', gap: 7, paddingVertical: 2 },
  filterPill: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: '#DDE8E0',
  },
  filterPillActive: { backgroundColor: C.forest, borderColor: C.forest },
  filterPillText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 10 },
  filterPillTextActive: { color: C.surface, fontFamily: F.semiBold },
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
  successBanner: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#E6F7ED',
    borderWidth: 1,
    borderColor: '#B5E4C8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  successBannerText: { flex: 1, color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  successDismissText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
});
