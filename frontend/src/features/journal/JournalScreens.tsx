import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  formatIsoDateTimeVn,
  formatIsoToVnInputValue,
  parseUiDateTimeInputToOffsetIso,
} from '@/features/carelog/careLogApi';
import { useUserPlantDetail, useUserPlantsList } from '@/features/plants/plantHooks';
import type { UserPlantSummaryDto } from '@/features/plants/plantTypes';
import { AppApiError } from '@/services/api/apiError';
import type { PageResponse } from '@/services/api/apiTypes';
import { getSessionGeneration } from '@/services/api/tokenStorage';
import {
  assertValidJournalPlantId,
  validateEntryType,
  validateJournalHealthStatus,
  validateJournalNote,
} from './journalApi';
import {
  useCreateJournalMutation,
  useDeleteJournalMutation,
  usePlantJournals,
  useResolvedPlantJournal,
  useUpdateJournalMutation,
} from './journalHooks';
import {
  ENTRY_TYPE_OPTIONS,
  getEntryTypeMeta,
  getJournalHealthStatusMeta,
  JOURNAL_HEALTH_STATUS_OPTIONS,
  type EntryType,
  type GrowthJournalDto,
  type JournalHealthStatus,
  type UpdateGrowthJournalRequestDto,
} from './journalTypes';

interface JournalFieldErrors {
  userPlantId?: string;
  entryType?: string;
  healthStatus?: string;
  note?: string;
  recordedAt?: string;
}

function JournalHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <View style={j.header}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Quay lại"
        style={j.backButton}
      >
        <Text style={j.back}>‹</Text>
      </Pressable>
      <Text style={j.headerTitle}>{title}</Text>
      <View style={j.headerSpacer} />
    </View>
  );
}

function JournalHealthBadge({ status }: { status: JournalHealthStatus }) {
  const meta = getJournalHealthStatusMeta(status);
  return (
    <Text
      style={[
        j.tag,
        meta.tone === 'peach'
          ? j.tagPeach
          : meta.tone === 'danger'
            ? j.tagDanger
            : j.tagMint,
      ]}
    >
      {meta.label}
    </Text>
  );
}

export interface JournalOverviewContentProps {
  plants: UserPlantSummaryDto[];
  isPlantsLoading: boolean;
  isPlantsFetching: boolean;
  isPlantsError: boolean;
  plantsErrorMessage?: string;
  onRetryPlants: () => void;
  selectedPlantId: string;
  onSelectPlant: (plantId: string) => void;
  effectivePlant: UserPlantSummaryDto | null;
  journalsData: PageResponse<GrowthJournalDto> | undefined;
  isJournalsLoading: boolean;
  isJournalsFetching: boolean;
  isJournalsPlaceholder: boolean;
  isJournalsError: boolean;
  journalsErrorMessage?: string;
  onRetryJournals: () => void;
  journalPage: number;
  onChangeJournalPage: (page: number) => void;
  onRefreshAll: () => void;
}

export function JournalOverviewContent({
  plants,
  isPlantsLoading,
  isPlantsFetching,
  isPlantsError,
  plantsErrorMessage,
  onRetryPlants,
  selectedPlantId,
  onSelectPlant,
  effectivePlant,
  journalsData,
  isJournalsLoading,
  isJournalsFetching,
  isJournalsPlaceholder,
  isJournalsError,
  journalsErrorMessage,
  onRetryJournals,
  journalPage,
  onChangeJournalPage,
  onRefreshAll,
}: JournalOverviewContentProps) {
  const { user } = useAuth();
  const currentUserId = typeof user?.id === 'string' ? user.id.trim() : '';
  const currentUserIdRef = useRef(currentUserId);
  const prevUserIdRef = useRef(currentUserId);

  const deleteJournalMutation = useDeleteJournalMutation();
  const [deletingJournalId, setDeletingJournalId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = currentUserId;
    currentUserIdRef.current = currentUserId;
    if (prevUserId && prevUserId !== currentUserId) {
      setDeletingJournalId(null);
      setActionError(null);
    }
  }, [currentUserId]);

  const activePlantId = effectivePlant?.id ?? selectedPlantId;
  const journals = journalsData?.content ?? [];
  const totalElements = journalsData?.totalElements ?? 0;
  const totalPages = journalsData?.totalPages ?? 0;
  const displayTotalPages = Math.max(1, totalPages, journalPage + 1);
  const isBusy = isPlantsFetching || isJournalsFetching || deleteJournalMutation.isPending;

  const handleRequestDeleteJournal = (item: GrowthJournalDto) => {
    const initiatedGeneration = getSessionGeneration();
    const initiatedByUserId = currentUserIdRef.current;
    const hasSwitchedSession = () =>
      getSessionGeneration() !== initiatedGeneration ||
      (Boolean(initiatedByUserId) && currentUserIdRef.current !== initiatedByUserId);

    Alert.alert(
      'Xác nhận xóa nhật ký',
      'Bạn có chắc chắn muốn xóa bản ghi nhật ký phát triển này? Thao tác không thể hoàn tác.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: () => {
            if (hasSwitchedSession()) {
              return;
            }
            setActionError(null);
            setDeletingJournalId(item.id);
            void deleteJournalMutation
              .mutateAsync({ journalId: item.id, plantId: item.userPlantId })
              .catch((err) => {
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
                setActionError('Không thể xóa nhật ký. Vui lòng thử lại.');
              })
              .finally(() => {
                if (!hasSwitchedSession()) {
                  setDeletingJournalId(null);
                }
              });
          },
        },
      ]
    );
  };

  return (
    <>
      <View style={j.toolbarRow}>
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/journal/new',
              params: activePlantId ? { plantId: activePlantId } : {},
            } as never)
          }
          accessibilityRole="button"
          accessibilityLabel="Thêm ghi nhận nhật ký mới"
          style={[j.primaryToolbarButton, { flex: 1 }]}
        >
          <Text style={j.submitText}>＋  Thêm ghi nhận</Text>
        </Pressable>
        <Pressable
          disabled={isBusy}
          onPress={onRefreshAll}
          accessibilityRole="button"
          accessibilityLabel="Làm mới nhật ký phát triển"
          accessibilityState={{ disabled: isBusy }}
          style={[j.refreshBtn, isBusy && j.disabled]}
        >
          <Text style={j.refreshBtnText}>{isBusy ? 'Đang tải...' : 'Làm mới'}</Text>
        </Pressable>
      </View>

      {actionError ? (
        <View style={j.errorBanner} accessibilityRole="alert">
          <Text style={j.errorBannerText}>{actionError}</Text>
          <Pressable onPress={() => setActionError(null)} accessibilityRole="button">
            <Text style={j.dismissText}>Đóng</Text>
          </Pressable>
        </View>
      ) : null}

      {isPlantsLoading && plants.length === 0 ? (
        <View style={j.stateCard}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={j.bodyCenter}>Đang tải danh sách cây trồng để xem nhật ký...</Text>
        </View>
      ) : isPlantsError && plants.length === 0 ? (
        <View style={j.stateCard} accessibilityRole="alert">
          <Text style={j.sectionTitle}>Không thể tải danh sách cây trồng</Text>
          <Text style={j.bodyCenter}>
            {plantsErrorMessage || 'Đã có lỗi xảy ra khi kết nối máy chủ.'}
          </Text>
          <Pressable onPress={onRetryPlants} style={j.secondaryButton} accessibilityRole="button">
            <Text style={j.secondaryText}>Thử lại</Text>
          </Pressable>
        </View>
      ) : plants.length === 0 ? (
        <View style={j.stateCard}>
          <Text style={j.sectionTitle}>Bạn chưa có cây trồng nào</Text>
          <Text style={j.bodyCenter}>
            Hãy thêm một cây trồng thực tế vào khu vườn để bắt đầu lưu nhật ký phát triển.
          </Text>
          <Pressable
            onPress={() => router.push('/garden/add-plant' as never)}
            style={j.primaryToolbarButton}
            accessibilityRole="button"
          >
            <Text style={j.submitText}>＋  Thêm cây mới</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={j.filterGroup}>
            <Text style={j.filterLabel}>Chọn 1 cây để xem nhật ký phát triển</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={j.chips}
            >
              {plants.map((plant) => {
                const active = activePlantId === plant.id;
                return (
                  <Pressable
                    key={plant.id}
                    onPress={() => onSelectPlant(plant.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[j.filterPill, active && j.filterPillActive]}
                  >
                    <Text style={[j.filterPillText, active && j.filterPillTextActive]}>
                      {plant.displayName}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {effectivePlant ? (
            <View style={j.plantCard}>
              <View style={j.thumb}>
                <Text style={j.emoji}>♧</Text>
              </View>
              <View style={j.copy}>
                <Text style={j.title}>{effectivePlant.displayName}</Text>
                <Text style={j.body}>
                  {effectivePlant.speciesName || 'Chưa gắn loài'}
                  {effectivePlant.gardenName ? ` • ${effectivePlant.gardenName}` : ''}
                </Text>
                <View style={j.quickLinkRow}>
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: '/plant-detail',
                        params: { plantId: effectivePlant.id },
                      } as never)
                    }
                    accessibilityRole="button"
                  >
                    <Text style={j.link}>Chi tiết cây ›</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: '/care-log/new',
                        params: { plantId: effectivePlant.id },
                      } as never)
                    }
                    accessibilityRole="button"
                  >
                    <Text style={j.link}>＋ Ghi nhận chăm sóc</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}

          <View style={j.card}>
            <View style={j.row}>
              <Text style={j.sectionTitle}>Nhật ký theo thời gian</Text>
              <Text style={j.hint}>
                {isJournalsLoading || (!journalsData && !isJournalsError)
                  ? 'Đang tải...'
                  : `${totalElements} ghi nhận`}
              </Text>
            </View>

            {isJournalsLoading ? (
              <View style={j.innerStateBox}>
                <ActivityIndicator size="small" color={C.primary} />
                <Text style={j.bodyCenter}>Đang tải nhật ký phát triển...</Text>
              </View>
            ) : isJournalsError ? (
              <View style={j.innerStateBox} accessibilityRole="alert">
                <Text style={j.bodyCenter}>
                  {journalsErrorMessage || 'Không thể tải nhật ký của cây.'}
                </Text>
                <Pressable
                  onPress={onRetryJournals}
                  style={j.secondaryButton}
                  accessibilityRole="button"
                >
                  <Text style={j.secondaryText}>Thử lại</Text>
                </Pressable>
              </View>
            ) : !journalsData ? (
              <View style={j.innerStateBox}>
                <ActivityIndicator size="small" color={C.primary} />
                <Text style={j.bodyCenter}>Đang tải nhật ký phát triển...</Text>
              </View>
            ) : journals.length === 0 ? (
              totalElements > 0 || isJournalsFetching || isJournalsPlaceholder ? (
                <View style={j.innerStateBox}>
                  <ActivityIndicator size="small" color={C.primary} />
                  <Text style={j.bodyCenter}>Đang cập nhật nhật ký phát triển...</Text>
                </View>
              ) : (
                <View style={j.innerStateBox}>
                  <Text style={j.bodyCenter}>
                    Chưa có bản ghi nhật ký phát triển nào cho cây đang chọn.
                  </Text>
                  {activePlantId ? (
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: '/journal/new',
                          params: { plantId: activePlantId },
                        } as never)
                      }
                      style={j.secondaryButton}
                      accessibilityRole="button"
                    >
                      <Text style={j.secondaryText}>＋  Tạo nhật ký đầu tiên</Text>
                    </Pressable>
                  ) : null}
                </View>
              )
            ) : (
              <>
                {journals.map((item) => {
                  const typeMeta = getEntryTypeMeta(item.entryType);
                  const isDeletingThis =
                    deleteJournalMutation.isPending && deletingJournalId === item.id;
                  return (
                    <View key={item.id} style={j.entry}>
                      <View style={j.entryTopRow}>
                        <Text style={j.titleSmall}>
                          {typeMeta.icon} {typeMeta.label}
                        </Text>
                        <JournalHealthBadge status={item.healthStatus} />
                      </View>
                      <Text style={j.date}>{formatIsoDateTimeVn(item.recordedAt)}</Text>
                      <Text style={j.body}>{item.note}</Text>
                      {item.imageUrls.length > 0 ? (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={j.photoRow}
                        >
                          {item.imageUrls.map((url, idx) => (
                            <Image
                              key={`${item.id}-img-${idx}`}
                              source={{ uri: url }}
                              style={j.photoImage}
                              contentFit="cover"
                            />
                          ))}
                        </ScrollView>
                      ) : null}
                      <View style={j.entryActions}>
                        <Pressable
                          disabled={deleteJournalMutation.isPending}
                          onPress={() =>
                            router.push({
                              pathname: '/journal/detail',
                              params: { plantId: item.userPlantId, journalId: item.id },
                            } as never)
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`Chi tiết nhật ký ${typeMeta.label}`}
                          style={j.inlineActionBtn}
                        >
                          <Text style={j.link}>Chi tiết ›</Text>
                        </Pressable>
                        <Pressable
                          disabled={deleteJournalMutation.isPending}
                          onPress={() =>
                            router.push({
                              pathname: '/journal/edit',
                              params: { plantId: item.userPlantId, journalId: item.id },
                            } as never)
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`Chỉnh sửa nhật ký ${typeMeta.label}`}
                          style={j.inlineActionBtn}
                        >
                          <Text style={j.link}>Sửa</Text>
                        </Pressable>
                        <Pressable
                          disabled={deleteJournalMutation.isPending}
                          onPress={() => handleRequestDeleteJournal(item)}
                          accessibilityRole="button"
                          accessibilityLabel={`Xóa nhật ký ${typeMeta.label}`}
                          style={j.inlineActionBtn}
                        >
                          <Text style={j.dangerLink}>
                            {isDeletingThis ? 'Đang xóa...' : 'Xóa'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}

                {totalPages > 1 || journalPage > 0 ? (
                  <View style={j.paginationRow}>
                    <Pressable
                      disabled={journalPage <= 0 || isJournalsFetching}
                      onPress={() => onChangeJournalPage(Math.max(0, journalPage - 1))}
                      style={[
                        j.pageButton,
                        (journalPage <= 0 || isJournalsFetching) && j.disabled,
                      ]}
                      accessibilityRole="button"
                    >
                      <Text style={j.pageButtonText}>Trang trước</Text>
                    </Pressable>
                    <Text style={j.body}>
                      Trang {journalPage + 1} / {displayTotalPages}
                    </Text>
                    <Pressable
                      disabled={Boolean(journalsData?.last) || isJournalsFetching}
                      onPress={() => onChangeJournalPage(journalPage + 1)}
                      style={[
                        j.pageButton,
                        (Boolean(journalsData?.last) || isJournalsFetching) && j.disabled,
                      ]}
                      accessibilityRole="button"
                    >
                      <Text style={j.pageButtonText}>Trang sau</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            )}
          </View>
        </>
      )}
    </>
  );
}

export function JournalDetailScreen() {
  const { plantId, journalId } = useLocalSearchParams<{
    plantId?: string;
    journalId?: string;
  }>();
  const cleanPlantId = typeof plantId === 'string' ? plantId.trim() : '';
  const cleanJournalId = typeof journalId === 'string' ? journalId.trim() : '';

  const { user } = useAuth();
  const currentUserId = typeof user?.id === 'string' ? user.id.trim() : '';
  const currentSessionOwnerKey = currentUserId
    ? `${currentUserId}:${getSessionGeneration()}`
    : '';
  const currentUserIdRef = useRef(currentUserId);
  const prevUserIdRef = useRef(currentUserId);

  const deleteJournalMutation = useDeleteJournalMutation();
  const [deletedOwnerKey, setDeletedOwnerKey] = useState<string | null>(null);
  const [deletingSnapshotState, setDeletingSnapshotState] = useState<{
    ownerKey: string;
    journal: GrowthJournalDto;
  } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [timelinePage, setTimelinePage] = useState(0);

  const isDeleted =
    Boolean(currentSessionOwnerKey) && deletedOwnerKey === currentSessionOwnerKey;
  const deletingSnapshot =
    currentSessionOwnerKey && deletingSnapshotState?.ownerKey === currentSessionOwnerKey
      ? deletingSnapshotState.journal
      : null;

  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = currentUserId;
    currentUserIdRef.current = currentUserId;
    if (prevUserId && prevUserId !== currentUserId) {
      setDeletedOwnerKey(null);
      setDeletingSnapshotState(null);
      setDeleteError(null);
      setTimelinePage(0);
    }
  }, [currentUserId]);

  useEffect(() => {
    setDeletedOwnerKey(null);
    setDeletingSnapshotState(null);
    setDeleteError(null);
    setTimelinePage(0);
  }, [cleanPlantId, cleanJournalId]);

  const plantQuery = useUserPlantDetail(cleanPlantId, {
    enabled: Boolean(cleanPlantId) && !isDeleted && !deleteJournalMutation.isPending,
  });

  const singleJournalMode = Boolean(cleanPlantId && cleanJournalId);

  const resolvedJournalQuery = useResolvedPlantJournal(cleanPlantId, cleanJournalId, {
    enabled: singleJournalMode && !isDeleted && !deleteJournalMutation.isPending,
  });

  const plantTimelineQuery = usePlantJournals(
    cleanPlantId,
    { page: timelinePage, size: 20 },
    {
      enabled:
        Boolean(cleanPlantId) &&
        !singleJournalMode &&
        !isDeleted &&
        !deleteJournalMutation.isPending,
    }
  );

  const timelineData = plantTimelineQuery.data;
  const isTimelineFetching = plantTimelineQuery.isFetching;
  const isTimelinePlaceholder = plantTimelineQuery.isPlaceholderData;
  const isTimelineError = plantTimelineQuery.isError;

  useEffect(() => {
    if (singleJournalMode || !cleanPlantId || isDeleted) {
      return;
    }
    if (isTimelineFetching || isTimelinePlaceholder || isTimelineError || !timelineData) {
      return;
    }
    const totalPages = Math.max(0, Math.trunc(timelineData.totalPages ?? 0));
    if (timelinePage < 0 || timelinePage >= totalPages) {
      const nextPage = timelinePage < 0 || totalPages === 0 ? 0 : totalPages - 1;
      if (nextPage !== timelinePage) {
        setTimelinePage(nextPage);
      }
    }
  }, [
    singleJournalMode,
    cleanPlantId,
    isDeleted,
    timelinePage,
    timelineData,
    isTimelineFetching,
    isTimelinePlaceholder,
    isTimelineError,
  ]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (cleanPlantId) {
      router.replace({
        pathname: '/plant-detail',
        params: { plantId: cleanPlantId },
      } as never);
      return;
    }
    router.replace('/journal' as never);
  };

  if (!cleanPlantId) {
    return (
      <SafeAreaView style={j.safe} edges={['top']}>
        <JournalHeader title="Nhật ký phát triển" onBack={handleBack} />
        <View style={j.centerState}>
          <Text style={j.sectionTitle}>Thiếu thông tin cây trồng</Text>
          <Text style={j.bodyCenter}>
            Vui lòng chọn cây trồng từ mục Nhật ký hoặc Chi tiết cây để xem nhật ký phát triển.
          </Text>
          <Pressable
            onPress={() => router.replace('/journal' as never)}
            style={j.primaryToolbarButton}
            accessibilityRole="button"
          >
            <Text style={j.submitText}>Mở nhật ký cây</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (singleJournalMode) {
    const journal = resolvedJournalQuery.data ?? deletingSnapshot;

    if (resolvedJournalQuery.isLoading && !journal) {
      return (
        <SafeAreaView style={j.safe} edges={['top']}>
          <JournalHeader title="Chi tiết nhật ký" onBack={handleBack} />
          <View style={j.centerState}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={j.bodyCenter}>Đang tải chi tiết nhật ký...</Text>
          </View>
        </SafeAreaView>
      );
    }

    if (!journal || (resolvedJournalQuery.isError && !resolvedJournalQuery.data)) {
      const errStatus = resolvedJournalQuery.error?.statusCode;
      const isForbidden = errStatus === 403 || resolvedJournalQuery.error?.isForbiddenError;
      const isNotFound = errStatus === 404;

      return (
        <SafeAreaView style={j.safe} edges={['top']}>
          <JournalHeader title="Chi tiết nhật ký" onBack={handleBack} />
          <View style={j.centerState} accessibilityRole="alert">
            <Text style={j.sectionTitle}>
              {isForbidden
                ? 'Không có quyền truy cập nhật ký'
                : isNotFound
                  ? 'Không tìm thấy nhật ký phát triển'
                  : 'Không thể tải nhật ký phát triển'}
            </Text>
            <Text style={j.bodyCenter}>
              {resolvedJournalQuery.error?.message || 'Bản ghi nhật ký không tồn tại hoặc đã bị xóa.'}
            </Text>
            <View style={j.stateActions}>
              {!isForbidden && !isNotFound ? (
                <Pressable
                  onPress={() => {
                    void resolvedJournalQuery.refetch();
                  }}
                  style={j.primaryToolbarButton}
                  accessibilityRole="button"
                >
                  <Text style={j.submitText}>Thử lại</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={handleBack} style={j.secondaryButton} accessibilityRole="button">
                <Text style={j.secondaryText}>Quay lại</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      );
    }

    const typeMeta = getEntryTypeMeta(journal.entryType);
    const plant = plantQuery.data;

    const handleConfirmDelete = () => {
      const initiatedGeneration = getSessionGeneration();
      const initiatedByUserId = currentUserIdRef.current;
      const hasSwitchedSession = () =>
        getSessionGeneration() !== initiatedGeneration ||
        (Boolean(initiatedByUserId) && currentUserIdRef.current !== initiatedByUserId);

      Alert.alert(
        'Xác nhận xóa nhật ký',
        'Bạn có chắc chắn muốn xóa bản ghi nhật ký phát triển này? Thao tác không thể hoàn tác.',
        [
          { text: 'Hủy', style: 'cancel' },
          {
            text: 'Xóa nhật ký',
            style: 'destructive',
            onPress: () => {
              if (hasSwitchedSession()) {
                return;
              }
              setDeleteError(null);
              setDeletingSnapshotState(
                currentSessionOwnerKey ? { ownerKey: currentSessionOwnerKey, journal } : null
              );
              setDeletedOwnerKey(currentSessionOwnerKey || null);
              void deleteJournalMutation
                .mutateAsync({ journalId: journal.id, plantId: cleanPlantId })
                .then(() => {
                  if (hasSwitchedSession()) {
                    return;
                  }
                  if (router.canGoBack()) {
                    router.back();
                  } else {
                    router.replace({
                      pathname: '/plant-detail',
                      params: { plantId: cleanPlantId },
                    } as never);
                  }
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
                    setDeleteError(err.message);
                    return;
                  }
                  setDeleteError('Không thể xóa nhật ký. Vui lòng thử lại.');
                });
            },
          },
        ]
      );
    };

    return (
      <SafeAreaView style={j.safe} edges={['top']}>
        <JournalHeader title="Chi tiết nhật ký" onBack={handleBack} />
        <ScrollView contentContainerStyle={j.content}>
          {deleteError ? (
            <View style={j.errorBanner} accessibilityRole="alert">
              <Text style={j.errorBannerText}>{deleteError}</Text>
              <Pressable onPress={() => setDeleteError(null)} accessibilityRole="button">
                <Text style={j.dismissText}>Đóng</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={j.plantCard}>
            <View style={j.thumb}>
              <Text style={j.emoji}>♧</Text>
            </View>
            <View style={j.copy}>
              <Text style={j.title}>{plant?.displayName || 'Cây trồng của bạn'}</Text>
              <Text style={j.body}>
                {plant?.garden?.name || 'Theo dõi sinh trưởng'}
                {plant?.species?.commonName ? ` • ${plant.species.commonName}` : ''}
              </Text>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/plant-detail',
                    params: { plantId: cleanPlantId },
                  } as never)
                }
                accessibilityRole="button"
              >
                <Text style={j.link}>Mở chi tiết cây trồng ›</Text>
              </Pressable>
            </View>
          </View>

          <View style={j.card}>
            <View style={j.entryTopRow}>
              <Text style={j.sectionTitle}>
                {typeMeta.icon} {typeMeta.label}
              </Text>
              <JournalHealthBadge status={journal.healthStatus} />
            </View>
            <Text style={j.date}>Ghi nhận lúc: {formatIsoDateTimeVn(journal.recordedAt)}</Text>
            {journal.createdAt ? (
              <Text style={j.hint}>Ngày tạo: {formatIsoDateTimeVn(journal.createdAt)}</Text>
            ) : null}
            <View style={j.noteBox}>
              <Text style={j.noteBoxText}>{journal.note}</Text>
            </View>

            <Text style={j.label}>Hình ảnh đính kèm</Text>
            {journal.imageUrls.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={j.photoRow}
              >
                {journal.imageUrls.map((url, idx) => (
                  <Image
                    key={`${journal.id}-detail-img-${idx}`}
                    source={{ uri: url }}
                    style={j.detailPhotoImage}
                    contentFit="cover"
                  />
                ))}
              </ScrollView>
            ) : (
              <Text style={j.hint}>Chưa có hình ảnh đính kèm cho bản ghi này.</Text>
            )}
          </View>

          <Pressable
            disabled={deleteJournalMutation.isPending}
            onPress={() =>
              router.push({
                pathname: '/journal/edit',
                params: { plantId: cleanPlantId, journalId: journal.id },
              } as never)
            }
            accessibilityRole="button"
            style={[j.submit, deleteJournalMutation.isPending && j.disabled]}
          >
            <Text style={j.submitText}>Chỉnh sửa nhật ký</Text>
          </Pressable>

          <Pressable
            disabled={deleteJournalMutation.isPending}
            onPress={handleConfirmDelete}
            accessibilityRole="button"
            style={[j.dangerButton, deleteJournalMutation.isPending && j.disabled]}
          >
            <Text style={j.dangerText}>
              {deleteJournalMutation.isPending ? 'Đang xóa nhật ký...' : 'Xóa nhật ký'}
            </Text>
          </Pressable>

          <Pressable
            disabled={deleteJournalMutation.isPending}
            onPress={() =>
              router.push({
                pathname: '/journal/new',
                params: { plantId: cleanPlantId },
              } as never)
            }
            accessibilityRole="button"
            style={j.secondaryButton}
          >
            <Text style={j.secondaryText}>＋  Thêm ghi nhận mới</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Timeline mode (/journal/detail?plantId=...)
  const items = timelineData?.content ?? [];
  const totalElements = timelineData?.totalElements ?? 0;
  const totalPages = timelineData?.totalPages ?? 0;
  const displayTotalPages = Math.max(1, totalPages, timelinePage + 1);
  const plant = plantQuery.data;

  return (
    <SafeAreaView style={j.safe} edges={['top']}>
      <JournalHeader title="Nhật ký phát triển" onBack={handleBack} />
      <ScrollView contentContainerStyle={j.content}>
        <View style={j.plantCard}>
          <View style={j.thumb}>
            <Text style={j.emoji}>♧</Text>
          </View>
          <View style={j.copy}>
            <Text style={j.title}>{plant?.displayName || 'Cây trồng của bạn'}</Text>
            <Text style={j.body}>
              {plant?.garden?.name || 'Nhật ký theo thời gian'}
              {plant?.species?.commonName ? ` • ${plant.species.commonName}` : ''}
            </Text>
          </View>
        </View>

        <View style={j.card}>
          <View style={j.row}>
            <Text style={j.sectionTitle}>Nhật ký theo thời gian</Text>
            <Text style={j.hint}>
              {plantTimelineQuery.isLoading ? 'Đang tải...' : `${totalElements} ghi nhận`}
            </Text>
          </View>

          {plantTimelineQuery.isLoading ? (
            <View style={j.innerStateBox}>
              <ActivityIndicator size="small" color={C.primary} />
              <Text style={j.bodyCenter}>Đang tải nhật ký phát triển...</Text>
            </View>
          ) : plantTimelineQuery.isError ? (
            <View style={j.innerStateBox} accessibilityRole="alert">
              <Text style={j.bodyCenter}>{plantTimelineQuery.error.message}</Text>
              <Pressable
                onPress={() => {
                  void plantTimelineQuery.refetch();
                }}
                style={j.secondaryButton}
                accessibilityRole="button"
              >
                <Text style={j.secondaryText}>Thử lại</Text>
              </Pressable>
            </View>
          ) : items.length === 0 ? (
            <View style={j.innerStateBox}>
              <Text style={j.bodyCenter}>Chưa có ghi nhận nào cho cây trồng này.</Text>
            </View>
          ) : (
            <>
              {items.map((item) => {
                const typeMeta = getEntryTypeMeta(item.entryType);
                return (
                  <View key={item.id} style={j.entry}>
                    <View style={j.entryTopRow}>
                      <Text style={j.titleSmall}>
                        {typeMeta.icon} {typeMeta.label}
                      </Text>
                      <JournalHealthBadge status={item.healthStatus} />
                    </View>
                    <Text style={j.date}>{formatIsoDateTimeVn(item.recordedAt)}</Text>
                    <Text style={j.body}>{item.note}</Text>
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: '/journal/detail',
                          params: { plantId: cleanPlantId, journalId: item.id },
                        } as never)
                      }
                      accessibilityRole="button"
                    >
                      <Text style={j.link}>Xem chi tiết ›</Text>
                    </Pressable>
                  </View>
                );
              })}

              {totalPages > 1 || timelinePage > 0 ? (
                <View style={j.paginationRow}>
                  <Pressable
                    disabled={timelinePage <= 0 || isTimelineFetching}
                    onPress={() => setTimelinePage(Math.max(0, timelinePage - 1))}
                    style={[
                      j.pageButton,
                      (timelinePage <= 0 || isTimelineFetching) && j.disabled,
                    ]}
                    accessibilityRole="button"
                  >
                    <Text style={j.pageButtonText}>Trang trước</Text>
                  </Pressable>
                  <Text style={j.body}>
                    Trang {timelinePage + 1} / {displayTotalPages}
                  </Text>
                  <Pressable
                    disabled={Boolean(timelineData?.last) || isTimelineFetching}
                    onPress={() => setTimelinePage(timelinePage + 1)}
                    style={[
                      j.pageButton,
                      (Boolean(timelineData?.last) || isTimelineFetching) && j.disabled,
                    ]}
                    accessibilityRole="button"
                  >
                    <Text style={j.pageButtonText}>Trang sau</Text>
                  </Pressable>
                </View>
              ) : null}
            </>
          )}
        </View>

        <Pressable
          onPress={() =>
            router.push({
              pathname: '/journal/new',
              params: { plantId: cleanPlantId },
            } as never)
          }
          style={j.submit}
          accessibilityRole="button"
        >
          <Text style={j.submitText}>＋  Thêm ghi nhận mới</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

export function NewJournalScreen() {
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
  const createJournalMutation = useCreateJournalMutation();

  const [selectedPlantId, setSelectedPlantId] = useState(preselectedPlantId);
  const [entryType, setEntryType] = useState<EntryType>('GROWTH');
  const [healthStatus, setHealthStatus] = useState<JournalHealthStatus>('HEALTHY');
  const [note, setNote] = useState('');
  const [recordedAtInput, setRecordedAtInput] = useState('');
  const [fieldErrors, setFieldErrors] = useState<JournalFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLocalSubmitting, setIsLocalSubmitting] = useState(false);

  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = currentUserId;
    currentUserIdRef.current = currentUserId;
    if (prevUserId && prevUserId !== currentUserId) {
      submitLockRef.current = false;
      setSelectedPlantId(preselectedPlantId);
      setEntryType('GROWTH');
      setHealthStatus('HEALTHY');
      setNote('');
      setRecordedAtInput('');
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
  const isSubmitting = createJournalMutation.isPending || isLocalSubmitting;

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
    router.replace('/journal' as never);
  };

  const handleSave = async () => {
    if (submitLockRef.current || createJournalMutation.isPending) {
      return;
    }

    const initiatedGeneration = getSessionGeneration();
    const initiatedByUserId = currentUserIdRef.current;
    const hasSwitchedSession = () =>
      getSessionGeneration() !== initiatedGeneration ||
      (Boolean(initiatedByUserId) && currentUserIdRef.current !== initiatedByUserId);

    setSubmitError(null);
    const nextFieldErrors: JournalFieldErrors = {};

    let validPlantId = '';
    try {
      validPlantId = assertValidJournalPlantId(activePlantId);
    } catch (err) {
      nextFieldErrors.userPlantId =
        err instanceof AppApiError ? err.message : 'Vui lòng chọn cây trồng thực tế.';
    }

    let validEntryType: EntryType = entryType;
    try {
      validEntryType = validateEntryType(entryType);
    } catch (err) {
      nextFieldErrors.entryType =
        err instanceof AppApiError ? err.message : 'Loại ghi nhận không hợp lệ.';
    }

    let validHealthStatus: JournalHealthStatus = healthStatus;
    try {
      validHealthStatus = validateJournalHealthStatus(healthStatus);
    } catch (err) {
      nextFieldErrors.healthStatus =
        err instanceof AppApiError ? err.message : 'Tình trạng sức khỏe không hợp lệ.';
    }

    let validNote = '';
    try {
      validNote = validateJournalNote(note);
    } catch (err) {
      nextFieldErrors.note =
        err instanceof AppApiError ? err.message : 'Ghi chú nhật ký không được để trống.';
    }

    let validRecordedAt: string | undefined;
    try {
      validRecordedAt = parseUiDateTimeInputToOffsetIso(
        recordedAtInput,
        'recordedAt',
        'Thời điểm ghi nhận'
      );
    } catch (err) {
      nextFieldErrors.recordedAt =
        err instanceof AppApiError
          ? err.message
          : 'Thời điểm ghi nhận không đúng định dạng.';
    }

    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0 || !validPlantId || !validNote) {
      return;
    }

    submitLockRef.current = true;
    setIsLocalSubmitting(true);

    try {
      const created = await createJournalMutation.mutateAsync({
        userPlantId: validPlantId,
        entryType: validEntryType,
        healthStatus: validHealthStatus,
        note: validNote,
        ...(validRecordedAt !== undefined ? { recordedAt: validRecordedAt } : {}),
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
      setSubmitError('Không thể lưu nhật ký phát triển. Vui lòng thử lại.');
    } finally {
      submitLockRef.current = false;
      if (!hasSwitchedSession()) {
        setIsLocalSubmitting(false);
      }
    }
  };

  return (
    <SafeAreaView style={j.safe} edges={['top']}>
      <JournalHeader title="Thêm ghi nhận mới" onBack={handleBack} />
      <ScrollView contentContainerStyle={j.content}>
        <View style={j.tip}>
          <Text style={j.sectionTitle}>Ghi nhận tình trạng cây</Text>
          <Text style={j.body}>
            Lưu lại tiến triển sinh trưởng và sức khỏe cây để tiện theo dõi theo thời gian.
          </Text>
        </View>

        {submitError ? (
          <View style={j.errorBanner} accessibilityRole="alert">
            <Text style={j.errorBannerText}>{submitError}</Text>
            <Pressable onPress={() => setSubmitError(null)} accessibilityRole="button">
              <Text style={j.dismissText}>Đóng</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={j.label}>
          1. Chọn cây trồng <Text style={j.required}>*</Text>
        </Text>
        {plantsQuery.isLoading && plantOptions.length === 0 ? (
          <View style={j.stateCard}>
            <ActivityIndicator size="small" color={C.primary} />
            <Text style={j.body}>Đang tải danh sách cây của bạn...</Text>
          </View>
        ) : plantsQuery.isError && plantOptions.length === 0 ? (
          <View style={j.stateCard} accessibilityRole="alert">
            <Text style={j.errorText}>{plantsQuery.error.message}</Text>
            <Pressable
              onPress={() => {
                void plantsQuery.refetch();
              }}
              style={j.secondaryButton}
              accessibilityRole="button"
            >
              <Text style={j.secondaryText}>Thử lại tải cây</Text>
            </Pressable>
          </View>
        ) : plantOptions.length === 0 ? (
          <View style={j.stateCard}>
            <Text style={j.body}>
              Bạn chưa có cây trồng nào. Hãy thêm một cây trước khi tạo nhật ký.
            </Text>
            <Pressable
              onPress={() => router.push('/garden/add-plant' as never)}
              style={j.secondaryButton}
              accessibilityRole="button"
            >
              <Text style={j.secondaryText}>＋  Thêm cây mới</Text>
            </Pressable>
          </View>
        ) : (
          plantOptions.map((item) => {
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
                style={[j.plantCard, selected && j.selected]}
              >
                <View style={j.thumbSmall}>
                  <Text style={j.emojiSmall}>♧</Text>
                </View>
                <View style={j.copy}>
                  <Text style={j.titleSmall}>{item.displayName}</Text>
                  <Text style={j.body}>
                    {item.speciesName || 'Chưa gắn loài'}
                    {item.gardenName ? ` • ${item.gardenName}` : ''}
                  </Text>
                </View>
                <Text style={j.radio}>{selected ? '●' : '○'}</Text>
              </Pressable>
            );
          })
        )}
        {fieldErrors.userPlantId ? (
          <Text style={j.errorText}>{fieldErrors.userPlantId}</Text>
        ) : null}

        <Text style={j.label}>2. Loại ghi nhận</Text>
        <View style={j.chips}>
          {ENTRY_TYPE_OPTIONS.map((opt) => {
            const active = entryType === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  setEntryType(opt.value);
                  setFieldErrors((prev) => ({ ...prev, entryType: undefined }));
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[j.chip, active && j.chipSelected]}
              >
                <Text style={[j.chipText, active && j.chipTextSelected]}>
                  {opt.icon} {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {fieldErrors.entryType ? <Text style={j.errorText}>{fieldErrors.entryType}</Text> : null}

        <Text style={j.label}>3. Tình trạng sức khỏe cây</Text>
        <View style={j.chips}>
          {JOURNAL_HEALTH_STATUS_OPTIONS.map((opt) => {
            const active = healthStatus === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  setHealthStatus(opt.value);
                  setFieldErrors((prev) => ({ ...prev, healthStatus: undefined }));
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[j.chip, active && j.chipSelected]}
              >
                <Text style={[j.chipText, active && j.chipTextSelected]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {fieldErrors.healthStatus ? (
          <Text style={j.errorText}>{fieldErrors.healthStatus}</Text>
        ) : null}

        <Text style={j.label}>
          4. Ghi chú <Text style={j.required}>*</Text>
        </Text>
        <TextInput
          value={note}
          onChangeText={(value) => {
            setNote(value);
            setFieldErrors((prev) => ({ ...prev, note: undefined }));
          }}
          multiline
          placeholder="Mô tả tình trạng lá, chồi mới, sâu bệnh hoặc biện pháp chăm sóc..."
          placeholderTextColor={C.mutedText}
          style={[j.input, j.multiline, fieldErrors.note && j.errorBorder]}
          accessibilityLabel="Ghi chú nhật ký"
        />
        {fieldErrors.note ? <Text style={j.errorText}>{fieldErrors.note}</Text> : null}

        <Text style={j.label}>5. Thời điểm ghi nhận (tùy chọn)</Text>
        <TextInput
          value={recordedAtInput}
          onChangeText={(value) => {
            setRecordedAtInput(value);
            setFieldErrors((prev) => ({ ...prev, recordedAt: undefined }));
          }}
          placeholder="Để trống nếu là bây giờ • VD: 2026-11-12 09:15 hoặc 2026-11-12T09:15:00+07:00"
          placeholderTextColor={C.mutedText}
          autoCapitalize="none"
          style={[j.input, fieldErrors.recordedAt && j.errorBorder]}
          accessibilityLabel="Thời điểm ghi nhận"
        />
        <Text style={j.hint}>
          Để trống để máy chủ tự gắn thời điểm hiện tại. Khi nhập tay theo giờ VN (YYYY-MM-DD
          HH:mm) hệ thống tự quy đổi +07:00; chuỗi ISO bắt buộc có múi giờ (+07:00 hoặc Z).
        </Text>
        {fieldErrors.recordedAt ? (
          <Text style={j.errorText}>{fieldErrors.recordedAt}</Text>
        ) : null}

        <View style={j.scopeNoticeCard}>
          <Text style={j.titleSmall}>Ảnh đính kèm</Text>
          <Text style={j.hint}>
            Camera và Upload ảnh đang hoãn tới G5.5. Bạn có thể lưu ghi nhận nhật ký ngay lúc này.
          </Text>
        </View>

        <Pressable
          disabled={isSubmitting}
          onPress={() => {
            void handleSave();
          }}
          accessibilityRole="button"
          accessibilityState={{ disabled: isSubmitting }}
          style={[j.submit, isSubmitting && j.disabled]}
        >
          <Text style={j.submitText}>{isSubmitting ? 'Đang lưu...' : 'Lưu ghi nhận'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

export function EditJournalScreen() {
  const { plantId, journalId } = useLocalSearchParams<{
    plantId?: string;
    journalId?: string;
  }>();
  const cleanPlantId = typeof plantId === 'string' ? plantId.trim() : '';
  const cleanJournalId = typeof journalId === 'string' ? journalId.trim() : '';

  const { user } = useAuth();
  const currentUserId = typeof user?.id === 'string' ? user.id.trim() : '';
  const currentSessionOwnerKey = currentUserId
    ? `${currentUserId}:${getSessionGeneration()}`
    : '';
  const currentUserIdRef = useRef(currentUserId);
  const prevUserIdRef = useRef(currentUserId);
  const submitLockRef = useRef(false);

  const plantQuery = useUserPlantDetail(cleanPlantId, {
    enabled: Boolean(cleanPlantId),
  });
  const journalQuery = useResolvedPlantJournal(cleanPlantId, cleanJournalId, {
    enabled: Boolean(cleanPlantId && cleanJournalId),
  });
  const updateJournalMutation = useUpdateJournalMutation();

  const [hydratedTargetKey, setHydratedTargetKey] = useState<string | null>(null);
  const [entryType, setEntryType] = useState<EntryType>('GROWTH');
  const [healthStatus, setHealthStatus] = useState<JournalHealthStatus>('HEALTHY');
  const [note, setNote] = useState('');
  const [initialRecordedAtDisplay, setInitialRecordedAtDisplay] = useState('');
  const [recordedAtInput, setRecordedAtInput] = useState('');
  const [clearAllImages, setClearAllImages] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<JournalFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLocalSubmitting, setIsLocalSubmitting] = useState(false);

  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = currentUserId;
    currentUserIdRef.current = currentUserId;
    if (prevUserId && prevUserId !== currentUserId) {
      submitLockRef.current = false;
      setHydratedTargetKey(null);
      setEntryType('GROWTH');
      setHealthStatus('HEALTHY');
      setNote('');
      setInitialRecordedAtDisplay('');
      setRecordedAtInput('');
      setClearAllImages(false);
      setFieldErrors({});
      setSubmitError(null);
      setIsLocalSubmitting(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    submitLockRef.current = false;
    setHydratedTargetKey(null);
    setClearAllImages(false);
    setFieldErrors({});
    setSubmitError(null);
    setIsLocalSubmitting(false);
  }, [cleanPlantId, cleanJournalId]);

  const journal = journalQuery.data;
  const targetHydrationKey =
    currentSessionOwnerKey && journal ? `${currentSessionOwnerKey}:${journal.id}` : '';

  useEffect(() => {
    if (!journal || !targetHydrationKey || hydratedTargetKey === targetHydrationKey) {
      return;
    }
    const vnDisplay = formatIsoToVnInputValue(journal.recordedAt);
    setEntryType(journal.entryType);
    setHealthStatus(journal.healthStatus);
    setNote(journal.note);
    setInitialRecordedAtDisplay(vnDisplay);
    setRecordedAtInput(vnDisplay);
    setClearAllImages(false);
    setFieldErrors({});
    setSubmitError(null);
    setHydratedTargetKey(targetHydrationKey);
  }, [journal, targetHydrationKey, hydratedTargetKey]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (cleanPlantId && cleanJournalId) {
      router.replace({
        pathname: '/journal/detail',
        params: { plantId: cleanPlantId, journalId: cleanJournalId },
      } as never);
      return;
    }
    router.replace('/journal' as never);
  };

  if (!cleanPlantId || !cleanJournalId) {
    return (
      <SafeAreaView style={j.safe} edges={['top']}>
        <JournalHeader title="Chỉnh sửa nhật ký" onBack={handleBack} />
        <View style={j.centerState}>
          <Text style={j.sectionTitle}>Thiếu thông tin bản ghi nhật ký</Text>
          <Text style={j.bodyCenter}>
            Vui lòng chọn bản ghi từ chi tiết cây trồng hoặc màn hình Nhật ký để chỉnh sửa.
          </Text>
          <Pressable
            onPress={() => router.replace('/journal' as never)}
            style={j.primaryToolbarButton}
            accessibilityRole="button"
          >
            <Text style={j.submitText}>Mở nhật ký cây</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (journalQuery.isLoading && !journal) {
    return (
      <SafeAreaView style={j.safe} edges={['top']}>
        <JournalHeader title="Chỉnh sửa nhật ký" onBack={handleBack} />
        <View style={j.centerState}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={j.bodyCenter}>Đang tải dữ liệu nhật ký cần chỉnh sửa...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (journalQuery.isError || !journal) {
    const errStatus = journalQuery.error?.statusCode;
    const isForbidden = errStatus === 403 || journalQuery.error?.isForbiddenError;
    const isNotFound = errStatus === 404;

    return (
      <SafeAreaView style={j.safe} edges={['top']}>
        <JournalHeader title="Chỉnh sửa nhật ký" onBack={handleBack} />
        <View style={j.centerState} accessibilityRole="alert">
          <Text style={j.sectionTitle}>
            {isForbidden
              ? 'Không có quyền chỉnh sửa nhật ký'
              : isNotFound
                ? 'Không tìm thấy nhật ký cần chỉnh sửa'
                : 'Không thể tải dữ liệu nhật ký'}
          </Text>
          <Text style={j.bodyCenter}>
            {journalQuery.error?.message || 'Bản ghi không tồn tại hoặc đã bị xóa.'}
          </Text>
          <View style={j.stateActions}>
            {!isForbidden && !isNotFound ? (
              <Pressable
                onPress={() => {
                  void journalQuery.refetch();
                }}
                style={j.primaryToolbarButton}
                accessibilityRole="button"
              >
                <Text style={j.submitText}>Thử lại</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={handleBack} style={j.secondaryButton} accessibilityRole="button">
              <Text style={j.secondaryText}>Quay lại</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const isSubmitting = updateJournalMutation.isPending || isLocalSubmitting;
  const plant = plantQuery.data;

  const handleSave = async () => {
    if (submitLockRef.current || updateJournalMutation.isPending) {
      return;
    }

    const initiatedGeneration = getSessionGeneration();
    const initiatedByUserId = currentUserIdRef.current;
    const hasSwitchedSession = () =>
      getSessionGeneration() !== initiatedGeneration ||
      (Boolean(initiatedByUserId) && currentUserIdRef.current !== initiatedByUserId);

    setSubmitError(null);
    const nextFieldErrors: JournalFieldErrors = {};

    let validEntryType: EntryType = entryType;
    try {
      validEntryType = validateEntryType(entryType);
    } catch (err) {
      nextFieldErrors.entryType =
        err instanceof AppApiError ? err.message : 'Loại ghi nhận không hợp lệ.';
    }

    let validHealthStatus: JournalHealthStatus = healthStatus;
    try {
      validHealthStatus = validateJournalHealthStatus(healthStatus);
    } catch (err) {
      nextFieldErrors.healthStatus =
        err instanceof AppApiError ? err.message : 'Tình trạng sức khỏe không hợp lệ.';
    }

    let validNote = '';
    try {
      validNote = validateJournalNote(note);
    } catch (err) {
      nextFieldErrors.note =
        err instanceof AppApiError ? err.message : 'Ghi chú nhật ký không được để trống.';
    }

    let validRecordedAt: string | undefined;
    const trimmedRecordedAt = recordedAtInput.trim();
    const recordedAtWasModified =
      trimmedRecordedAt.length > 0 && trimmedRecordedAt !== initialRecordedAtDisplay;
    if (recordedAtWasModified) {
      try {
        validRecordedAt = parseUiDateTimeInputToOffsetIso(
          trimmedRecordedAt,
          'recordedAt',
          'Thời điểm ghi nhận'
        );
      } catch (err) {
        nextFieldErrors.recordedAt =
          err instanceof AppApiError
            ? err.message
            : 'Thời điểm ghi nhận không đúng định dạng.';
      }
    }

    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0 || !validNote) {
      return;
    }

    const updatePayload: UpdateGrowthJournalRequestDto = {};
    if (validEntryType !== journal.entryType) {
      updatePayload.entryType = validEntryType;
    }
    if (validHealthStatus !== journal.healthStatus) {
      updatePayload.healthStatus = validHealthStatus;
    }
    if (validNote !== journal.note.trim()) {
      updatePayload.note = validNote;
    }
    if (clearAllImages && journal.imageUrls.length > 0) {
      updatePayload.imageUrls = [];
    }
    if (validRecordedAt !== undefined) {
      updatePayload.recordedAt = validRecordedAt;
    }
    if (Object.keys(updatePayload).length === 0) {
      updatePayload.note = validNote;
    }

    submitLockRef.current = true;
    setIsLocalSubmitting(true);

    try {
      await updateJournalMutation.mutateAsync({
        journalId: journal.id,
        plantId: cleanPlantId,
        data: updatePayload,
      });

      if (hasSwitchedSession()) {
        return;
      }

      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace({
          pathname: '/journal/detail',
          params: { plantId: cleanPlantId, journalId: journal.id },
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
      setSubmitError('Không thể cập nhật nhật ký phát triển. Vui lòng thử lại.');
    } finally {
      submitLockRef.current = false;
      if (!hasSwitchedSession()) {
        setIsLocalSubmitting(false);
      }
    }
  };

  return (
    <SafeAreaView style={j.safe} edges={['top']}>
      <JournalHeader title="Chỉnh sửa nhật ký" onBack={handleBack} />
      <ScrollView contentContainerStyle={j.content}>
        <View style={j.tip}>
          <Text style={j.sectionTitle}>Cập nhật nhật ký phát triển</Text>
          <Text style={j.body}>
            Chỉnh sửa nội dung theo dõi, loại ghi nhận hoặc tình trạng sức khỏe cho bản ghi hiện tại.
          </Text>
        </View>

        {submitError ? (
          <View style={j.errorBanner} accessibilityRole="alert">
            <Text style={j.errorBannerText}>{submitError}</Text>
            <Pressable onPress={() => setSubmitError(null)} accessibilityRole="button">
              <Text style={j.dismissText}>Đóng</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={j.label}>Cây trồng (không thể thay đổi khi chỉnh sửa)</Text>
        <View style={[j.plantCard, j.readOnlyCard]}>
          <View style={j.thumbSmall}>
            <Text style={j.emojiSmall}>♧</Text>
          </View>
          <View style={j.copy}>
            <Text style={j.titleSmall}>{plant?.displayName || `Cây #${cleanPlantId}`}</Text>
            <Text style={j.body}>
              {plant?.garden?.name || 'Cây trồng cố định của bản ghi'}
              {plant?.species?.commonName ? ` • ${plant.species.commonName}` : ''}
            </Text>
          </View>
        </View>

        <Text style={j.label}>1. Loại ghi nhận</Text>
        <View style={j.chips}>
          {ENTRY_TYPE_OPTIONS.map((opt) => {
            const active = entryType === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  setEntryType(opt.value);
                  setFieldErrors((prev) => ({ ...prev, entryType: undefined }));
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[j.chip, active && j.chipSelected]}
              >
                <Text style={[j.chipText, active && j.chipTextSelected]}>
                  {opt.icon} {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {fieldErrors.entryType ? <Text style={j.errorText}>{fieldErrors.entryType}</Text> : null}

        <Text style={j.label}>2. Tình trạng sức khỏe cây</Text>
        <View style={j.chips}>
          {JOURNAL_HEALTH_STATUS_OPTIONS.map((opt) => {
            const active = healthStatus === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  setHealthStatus(opt.value);
                  setFieldErrors((prev) => ({ ...prev, healthStatus: undefined }));
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[j.chip, active && j.chipSelected]}
              >
                <Text style={[j.chipText, active && j.chipTextSelected]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {fieldErrors.healthStatus ? (
          <Text style={j.errorText}>{fieldErrors.healthStatus}</Text>
        ) : null}

        <Text style={j.label}>
          3. Ghi chú <Text style={j.required}>*</Text>
        </Text>
        <TextInput
          value={note}
          onChangeText={(value) => {
            setNote(value);
            setFieldErrors((prev) => ({ ...prev, note: undefined }));
          }}
          multiline
          placeholder="Mô tả tình trạng cây..."
          placeholderTextColor={C.mutedText}
          style={[j.input, j.multiline, fieldErrors.note && j.errorBorder]}
          accessibilityLabel="Ghi chú nhật ký"
        />
        {fieldErrors.note ? <Text style={j.errorText}>{fieldErrors.note}</Text> : null}

        <Text style={j.label}>4. Thời điểm ghi nhận (giờ Việt Nam UTC+7)</Text>
        <TextInput
          value={recordedAtInput}
          onChangeText={(value) => {
            setRecordedAtInput(value);
            setFieldErrors((prev) => ({ ...prev, recordedAt: undefined }));
          }}
          placeholder="Giữ nguyên hoặc nhập YYYY-MM-DD HH:mm / ISO có múi giờ"
          placeholderTextColor={C.mutedText}
          autoCapitalize="none"
          style={[j.input, fieldErrors.recordedAt && j.errorBorder]}
          accessibilityLabel="Thời điểm ghi nhận"
        />
        <Text style={j.hint}>
          Giữ nguyên hoặc để trống để bảo toàn thời điểm hiện tại. Khi đổi, nhập theo giờ VN
          (YYYY-MM-DD HH:mm) hoặc ISO có múi giờ (+07:00 / Z).
        </Text>
        {fieldErrors.recordedAt ? (
          <Text style={j.errorText}>{fieldErrors.recordedAt}</Text>
        ) : null}

        <Text style={j.label}>5. Ảnh đã lưu</Text>
        {journal.imageUrls.length > 0 ? (
          <View style={j.card}>
            {!clearAllImages ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={j.photoRow}
              >
                {journal.imageUrls.map((url, idx) => (
                  <Image
                    key={`${journal.id}-edit-img-${idx}`}
                    source={{ uri: url }}
                    style={j.photoImage}
                    contentFit="cover"
                  />
                ))}
              </ScrollView>
            ) : (
              <Text style={j.errorText}>
                Ảnh đã lưu sẽ bị xóa khi bạn bấm “Lưu thay đổi” (gửi imageUrls: []).
              </Text>
            )}
            <Pressable
              onPress={() => setClearAllImages((prev) => !prev)}
              style={clearAllImages ? j.secondaryButton : j.dangerButton}
              accessibilityRole="button"
            >
              <Text style={clearAllImages ? j.secondaryText : j.dangerText}>
                {clearAllImages ? 'Giữ nguyên ảnh cũ' : 'Xóa toàn bộ ảnh đã lưu'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={j.scopeNoticeCard}>
            <Text style={j.hint}>
              Chưa có ảnh đã lưu. Camera / Upload ảnh mới đang hoãn tới G5.5.
            </Text>
          </View>
        )}

        <Pressable
          disabled={isSubmitting}
          onPress={() => {
            void handleSave();
          }}
          accessibilityRole="button"
          accessibilityState={{ disabled: isSubmitting }}
          style={[j.submit, isSubmitting && j.disabled]}
        >
          <Text style={j.submitText}>{isSubmitting ? 'Đang cập nhật...' : 'Lưu thay đổi'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const j = StyleSheet.create({
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
  content: { padding: 13, gap: 9, paddingBottom: 28 },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryToolbarButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBtn: {
    minHeight: 42,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#E7EEE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBtnText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  filterGroup: { gap: 4 },
  filterLabel: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 10 },
  filterPill: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 99,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: '#DDE8E0',
  },
  filterPillActive: { backgroundColor: C.forest, borderColor: C.forest },
  filterPillText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 10 },
  filterPillTextActive: { color: C.surface, fontFamily: F.semiBold },
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
  readOnlyCard: { backgroundColor: C.softSurface },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#E6F0E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { color: C.forest, fontSize: 24 },
  emojiSmall: { color: C.forest, fontSize: 18 },
  copy: { flex: 1, gap: 3 },
  title: { color: C.forest, fontFamily: F.bold, fontSize: 15 },
  body: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 17 },
  bodyCenter: {
    color: C.secondaryText,
    fontFamily: F.regular,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  hint: { color: C.mutedText, fontFamily: F.regular, fontSize: 10, lineHeight: 15 },
  tag: {
    overflow: 'hidden',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    fontFamily: F.semiBold,
    fontSize: 10,
  },
  tagMint: { backgroundColor: '#DDF2E4', color: C.forest },
  tagPeach: { backgroundColor: '#FFE8D2', color: '#914218' },
  tagDanger: { backgroundColor: '#FDECEC', color: '#B42318' },
  card: { padding: 12, borderRadius: 13, backgroundColor: C.surface, gap: 8 },
  sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quickLinkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 2 },
  entry: {
    paddingTop: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DFE9E1',
    gap: 5,
  },
  entryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  date: { color: C.primary, fontFamily: F.semiBold, fontSize: 10 },
  titleSmall: { color: C.text, fontFamily: F.semiBold, fontSize: 12 },
  photoRow: { flexDirection: 'row', gap: 8, marginVertical: 4 },
  photoImage: { width: 96, height: 76, borderRadius: 10, backgroundColor: '#E0EEE3' },
  detailPhotoImage: { width: 140, height: 110, borderRadius: 12, backgroundColor: '#E0EEE3' },
  entryActions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 2 },
  inlineActionBtn: { paddingVertical: 2 },
  link: { color: C.primary, fontFamily: F.semiBold, fontSize: 11 },
  dangerLink: { color: '#B42318', fontFamily: F.semiBold, fontSize: 11 },
  noteBox: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: C.softSurface,
  },
  noteBoxText: { color: C.text, fontFamily: F.regular, fontSize: 12, lineHeight: 18 },
  submit: {
    marginTop: 4,
    minHeight: 45,
    borderRadius: 10,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
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
  tip: { padding: 12, borderRadius: 11, backgroundColor: C.softSurface, gap: 3 },
  label: { marginTop: 4, color: C.text, fontFamily: F.semiBold, fontSize: 12 },
  required: { color: C.terracotta },
  thumbSmall: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: C.softSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { borderColor: C.primary, backgroundColor: '#E5F4E9' },
  radio: { marginLeft: 'auto', color: C.primary, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: '#DDE8E0',
  },
  chipSelected: { backgroundColor: C.forest, borderColor: C.forest },
  chipText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11 },
  chipTextSelected: { color: C.surface, fontFamily: F.semiBold },
  input: {
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: '#DDE8E0',
    color: C.text,
    fontFamily: F.regular,
    fontSize: 12,
  },
  multiline: { minHeight: 90, paddingTop: 10, textAlignVertical: 'top' },
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
  scopeNoticeCard: {
    padding: 11,
    borderRadius: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D5E3D8',
    gap: 3,
  },
  stateCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: C.surface,
    alignItems: 'center',
    gap: 9,
  },
  innerStateBox: { paddingVertical: 12, alignItems: 'center', gap: 8 },
  centerState: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  stateActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  pageButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: C.softSurface,
  },
  pageButtonText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  disabled: { opacity: 0.55 },
});
