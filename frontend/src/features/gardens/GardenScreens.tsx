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
import { plantCatalog, usePlantData } from '@/features/plants/PlantDataStore';
import { AppApiError } from '@/services/api/apiError';
import { GARDEN_NAME_MAX_LENGTH } from './gardenApi';
import {
  useCreateGardenMutation,
  useDeleteGardenMutation,
  useGardenDetail,
  useGardensList,
  useUpdateGardenMutation,
} from './gardenHooks';
import {
  getHealthStatusMeta,
  getSpaceTypeLabel,
  SPACE_TYPE_OPTIONS,
  type GardenDetailDto,
  type SpaceType,
} from './gardenTypes';

function GardenHeader({ title }: { title: string }) {
  return (
    <View style={g.header}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Quay lại" style={g.back}>
        <Text style={g.backText}>‹</Text>
      </Pressable>
      <Text style={g.headerTitle}>{title}</Text>
      <View style={g.headerSpacer} />
    </View>
  );
}

function ActionButton({
  label,
  secondary = false,
  danger = false,
  disabled = false,
  onPress,
}: {
  label: string;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={[
        g.action,
        secondary && g.actionSecondary,
        danger && g.actionDanger,
        disabled && g.actionDisabled,
      ]}
    >
      <Text
        style={[
          g.actionText,
          secondary && g.actionTextSecondary,
          danger && g.actionTextDanger,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function GardensTabContent() {
  const gardensQuery = useGardensList();
  const [selectedSpace, setSelectedSpace] = useState<'ALL' | SpaceType>('ALL');

  const gardens = useMemo(() => gardensQuery.data ?? [], [gardensQuery.data]);
  const countsBySpace = useMemo(() => {
    const counts: Record<SpaceType, number> = {
      BAN_CONG: 0,
      SAN_THUONG: 0,
      TRONG_NHA: 0,
      SAN_VUON: 0,
      KHAC: 0,
    };
    for (const item of gardens) {
      counts[item.spaceType] = (counts[item.spaceType] ?? 0) + 1;
    }
    return counts;
  }, [gardens]);

  const filteredGardens = useMemo(
    () =>
      selectedSpace === 'ALL'
        ? gardens
        : gardens.filter((garden) => garden.spaceType === selectedSpace),
    [gardens, selectedSpace]
  );

  return (
    <View style={g.tabWrap}>
      <View style={g.tabActionRow}>
        <View style={g.flexButton}>
          <ActionButton
            label="＋ Tạo khu vườn mới"
            onPress={() => router.push('/garden/create' as never)}
          />
        </View>
        <Pressable
          onPress={() => gardensQuery.refetch()}
          style={g.refreshBtn}
          accessibilityRole="button"
          accessibilityLabel="Làm mới danh sách khu vườn"
        >
          <Text style={g.refreshBtnText}>{gardensQuery.isFetching ? '…' : 'Làm mới'}</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={g.filterPills}>
        <Pressable
          onPress={() => setSelectedSpace('ALL')}
          style={[g.filterPill, selectedSpace === 'ALL' && g.filterPillActive]}
          accessibilityRole="button"
        >
          <Text style={[g.filterPillText, selectedSpace === 'ALL' && g.filterPillTextActive]}>
            Tất cả ({gardens.length})
          </Text>
        </Pressable>
        {SPACE_TYPE_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            onPress={() => setSelectedSpace(opt.value)}
            style={[g.filterPill, selectedSpace === opt.value && g.filterPillActive]}
            accessibilityRole="button"
          >
            <Text
              style={[g.filterPillText, selectedSpace === opt.value && g.filterPillTextActive]}
            >
              {opt.label} ({countsBySpace[opt.value] ?? 0})
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {gardensQuery.isLoading ? (
        <View style={g.stateCard}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={g.bodyCenter}>Đang tải danh sách khu vườn...</Text>
        </View>
      ) : gardensQuery.isError ? (
        <View style={g.stateCard} accessibilityRole="alert">
          <Text style={g.stateTitle}>Không thể tải danh sách khu vườn</Text>
          <Text style={g.bodyCenter}>{gardensQuery.error.message}</Text>
          <ActionButton label="Thử lại" onPress={() => gardensQuery.refetch()} />
        </View>
      ) : gardens.length === 0 ? (
        <View style={g.stateCard}>
          <View style={g.emptyIcon}>
            <Text style={g.emptyGlyph}>⌂</Text>
          </View>
          <Text style={g.stateTitle}>Chưa có khu vườn nào</Text>
          <Text style={g.bodyCenter}>
            Tạo khu vườn để sắp xếp cây theo không gian và điều kiện chăm sóc.
          </Text>
          <ActionButton
            label="＋ Tạo khu vườn đầu tiên"
            onPress={() => router.push('/garden/create' as never)}
          />
        </View>
      ) : filteredGardens.length === 0 ? (
        <View style={g.stateCard}>
          <Text style={g.stateTitle}>Không có khu vườn thuộc nhóm này</Text>
          <Text style={g.bodyCenter}>
            Bạn chưa tạo khu vườn nào loại “{getSpaceTypeLabel(selectedSpace)}”.
          </Text>
          <ActionButton label="Xem tất cả khu vườn" secondary onPress={() => setSelectedSpace('ALL')} />
        </View>
      ) : (
        filteredGardens.map((garden) => (
          <View key={garden.id} style={g.gardenCard}>
            {garden.coverImageUrl ? (
              <Image
                source={{ uri: garden.coverImageUrl }}
                style={g.gardenCover}
                contentFit="cover"
              />
            ) : (
              <View style={g.gardenArt}>
                <Text style={g.artGlyph}>♧</Text>
                <Text style={g.artLabel}>{getSpaceTypeLabel(garden.spaceType).toUpperCase()}</Text>
              </View>
            )}
            <View style={g.cardBody}>
              <Text style={g.cardTitle}>{garden.name}</Text>
              <Text style={g.body}>⌖  {garden.location}</Text>
              <View style={g.row}>
                <Text style={g.body}>{garden.plantCount} cây đang trồng</Text>
                <Text style={g.spaceTag}>{getSpaceTypeLabel(garden.spaceType)}</Text>
              </View>
              <ActionButton
                label="Quản lý vườn →"
                onPress={() =>
                  router.push({
                    pathname: '/garden-detail',
                    params: { gardenId: garden.id },
                  } as never)
                }
              />
            </View>
          </View>
        ))
      )}
    </View>
  );
}

export function GardenDetailScreen() {
  const { gardenId } = useLocalSearchParams<{ gardenId?: string }>();
  const cleanGardenId = typeof gardenId === 'string' ? gardenId.trim() : '';

  const deleteMutation = useDeleteGardenMutation();
  const [isDeleted, setIsDeleted] = useState(false);
  const [deletingSnapshot, setDeletingSnapshot] = useState<GardenDetailDto | null>(null);
  const detailQuery = useGardenDetail(cleanGardenId, {
    enabled: !isDeleted && !deleteMutation.isPending,
  });
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!cleanGardenId) {
    return (
      <SafeAreaView style={g.safe} edges={['top']}>
        <GardenHeader title="Chi tiết khu vườn" />
        <View style={g.centerState}>
          <Text style={g.stateTitle}>Không xác định được khu vườn</Text>
          <Text style={g.bodyCenter}>Thiếu mã khu vườn để tải dữ liệu.</Text>
          <ActionButton label="Quay lại danh sách vườn" onPress={() => router.replace('/gardens' as never)} />
        </View>
      </SafeAreaView>
    );
  }

  const garden = detailQuery.data ?? deletingSnapshot;

  if (detailQuery.isLoading && !garden) {
    return (
      <SafeAreaView style={g.safe} edges={['top']}>
        <GardenHeader title="Chi tiết khu vườn" />
        <View style={g.centerState}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={g.bodyCenter}>Đang tải thông tin khu vườn...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!garden || (detailQuery.isError && !detailQuery.data)) {
    const statusCode = detailQuery.error?.statusCode;
    const isForbidden = statusCode === 403;
    const isNotFound = statusCode === 404;

    return (
      <SafeAreaView style={g.safe} edges={['top']}>
        <GardenHeader title="Chi tiết khu vườn" />
        <View style={g.centerState} accessibilityRole="alert">
          <Text style={g.stateTitle}>
            {isForbidden
              ? 'Không có quyền truy cập khu vườn'
              : isNotFound
                ? 'Không tìm thấy khu vườn'
                : 'Không thể tải chi tiết khu vườn'}
          </Text>
          <Text style={g.bodyCenter}>
            {isForbidden
              ? 'Bạn không có quyền xem hoặc chỉnh sửa khu vườn này.'
              : isNotFound
                ? 'Khu vườn này không tồn tại hoặc đã bị xóa.'
                : detailQuery.error?.message || 'Đã xảy ra lỗi khi tải thông tin khu vườn.'}
          </Text>
          <View style={g.stateActions}>
            {!isForbidden && !isNotFound ? (
              <ActionButton label="Thử lại" onPress={() => detailQuery.refetch()} />
            ) : null}
            <ActionButton
              label="Về danh sách vườn"
              secondary
              onPress={() => router.replace('/gardens' as never)}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const executeDelete = async () => {
    setDeleteError(null);
    setDeletingSnapshot(garden);
    setIsDeleted(true);
    try {
      await deleteMutation.mutateAsync(garden.id);
      router.replace('/gardens' as never);
    } catch (err) {
      setIsDeleted(false);
      setDeletingSnapshot(null);
      if (err instanceof AppApiError) {
        setDeleteError(err.message);
      } else {
        setDeleteError('Không thể xóa khu vườn. Vui lòng thử lại.');
      }
    }
  };

  const handleRequestDelete = () => {
    const cascadeCountText =
      garden.plants.length > 0
        ? `toàn bộ ${garden.plants.length} cây đang trồng trong vườn, kèm toàn bộ lịch chăm sóc và nhật ký liên quan`
        : 'khu vườn cùng toàn bộ dữ liệu cây, lịch chăm sóc và nhật ký liên quan nếu có';

    Alert.alert(
      'Xác nhận xóa khu vườn',
      `Xóa khu vườn “${garden.name}” sẽ xóa vĩnh viễn ${cascadeCountText}. Thao tác này không thể hoàn tác.`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa khu vườn',
          style: 'destructive',
          onPress: () => {
            executeDelete();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={g.safe} edges={['top']}>
      <GardenHeader title="Chi tiết khu vườn" />
      <ScrollView contentContainerStyle={g.content}>
        {deleteError ? (
          <View style={g.errorBanner} accessibilityRole="alert">
            <Text style={g.errorBannerText}>{deleteError}</Text>
            <Pressable onPress={() => setDeleteError(null)}>
              <Text style={g.dismissText}>Đóng</Text>
            </Pressable>
          </View>
        ) : null}

        {garden.coverImageUrl ? (
          <Image source={{ uri: garden.coverImageUrl }} style={g.heroCover} contentFit="cover" />
        ) : (
          <View style={g.hero}>
            <Text style={g.heroPlant}>♧</Text>
            <Text style={g.heroLabel}>{getSpaceTypeLabel(garden.spaceType).toUpperCase()}</Text>
          </View>
        )}

        <Text style={g.title}>{garden.name}</Text>
        <View style={g.row}>
          <Text style={g.body}>⌖  {garden.location}</Text>
          <Text style={g.spaceTag}>{getSpaceTypeLabel(garden.spaceType)}</Text>
        </View>

        <View style={g.card}>
          <Text style={g.sectionTitle}>Tổng quan khu vườn</Text>
          <Text style={g.body}>
            {garden.description?.trim() || 'Chưa có mô tả cho khu vườn này.'}
          </Text>
          <Text style={g.metaLine}>
            Số lượng cây hiện tại: {garden.plants.length} cây • Không gian: {getSpaceTypeLabel(garden.spaceType)}
          </Text>
          <View style={g.row}>
            <View style={g.flexButton}>
              <ActionButton
                label="Chỉnh sửa vườn"
                secondary
                disabled={deleteMutation.isPending}
                onPress={() =>
                  router.push({
                    pathname: '/garden/create',
                    params: { gardenId: garden.id },
                  } as never)
                }
              />
            </View>
            <View style={g.flexButton}>
              <ActionButton
                label={deleteMutation.isPending ? 'Đang xóa...' : 'Xóa khu vườn'}
                danger
                disabled={deleteMutation.isPending}
                onPress={handleRequestDelete}
              />
            </View>
          </View>
        </View>

        <View style={g.card}>
          <View style={g.row}>
            <Text style={g.sectionTitle}>Cây đang trồng ({garden.plants.length})</Text>
            <Pressable
              onPress={() =>
                Alert.alert(
                  'Sắp ra mắt (G5.4)',
                  'API quản lý cây trong khu vườn (User Plants) sẽ được tích hợp ở giai đoạn G5.4.'
                )
              }
              accessibilityRole="button"
            >
              <Text style={g.link}>＋ Thêm cây</Text>
            </Pressable>
          </View>

          {garden.plants.length === 0 ? (
            <View style={g.emptyPlantsBox}>
              <Text style={g.bodyCenter}>Khu vườn này chưa có cây trồng nào.</Text>
              <Text style={g.note}>
                Tính năng thêm và quản lý cây theo khu vườn sẽ được kết nối API ở giai đoạn G5.4.
              </Text>
            </View>
          ) : (
            garden.plants.map((plant) => {
              const health = getHealthStatusMeta(plant.healthStatus);
              return (
                <View key={plant.id} style={g.plantCard}>
                  {plant.imageUrl ? (
                    <Image source={{ uri: plant.imageUrl }} style={g.plantThumb} contentFit="cover" />
                  ) : (
                    <View style={g.plantImage}>
                      <Text style={g.plantEmoji}>♧</Text>
                    </View>
                  )}
                  <View style={g.plantCopy}>
                    <Text style={g.plantName}>{plant.displayName}</Text>
                    <Text style={g.body}>
                      {plant.speciesName || 'Chưa gắn loài'}
                      {plant.category ? ` • ${plant.category}` : ''}
                    </Text>
                    <Text style={g.healthLabel}>{health.label}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={g.noticeCard}>
          <Text style={g.noticeTitle}>Ghi chú tích hợp (G5.3)</Text>
          <Text style={g.noteLeft}>
            Chỉ số nhiệt độ/độ ẩm/ánh sáng và lịch chăm sóc theo khu vườn chưa có dữ liệu API ở giai đoạn G5.3 và sẽ được bổ sung ở G5.4+.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function GardenCreateEditForm({ gardenId }: { gardenId?: string }) {
  const cleanGardenId = gardenId?.trim() ?? '';
  const isEditMode = Boolean(cleanGardenId);

  const detailQuery = useGardenDetail(cleanGardenId, { enabled: isEditMode });
  const createMutation = useCreateGardenMutation();
  const updateMutation = useUpdateGardenMutation();

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [spaceType, setSpaceType] = useState<SpaceType>('BAN_CONG');
  const [description, setDescription] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; location?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const hydratedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isEditMode && detailQuery.data && hydratedIdRef.current !== detailQuery.data.id) {
      hydratedIdRef.current = detailQuery.data.id;
      setName(detailQuery.data.name);
      setLocation(detailQuery.data.location);
      setSpaceType(detailQuery.data.spaceType);
      setDescription(detailQuery.data.description ?? '');
      setCoverImageUrl(detailQuery.data.coverImageUrl ?? '');
    }
  }, [isEditMode, detailQuery.data]);

  const title = isEditMode ? 'Chỉnh sửa khu vườn' : 'Tạo khu vườn mới';
  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isEditMode && detailQuery.isLoading) {
    return (
      <SafeAreaView style={g.safe} edges={['top']}>
        <GardenHeader title={title} />
        <View style={g.centerState}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={g.bodyCenter}>Đang tải thông tin khu vườn để chỉnh sửa...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isEditMode && detailQuery.isError) {
    return (
      <SafeAreaView style={g.safe} edges={['top']}>
        <GardenHeader title={title} />
        <View style={g.centerState} accessibilityRole="alert">
          <Text style={g.stateTitle}>Không thể mở biểu mẫu chỉnh sửa</Text>
          <Text style={g.bodyCenter}>{detailQuery.error.message}</Text>
          <ActionButton label="Quay lại" secondary onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const validateLocal = (): boolean => {
    const nextErrors: { name?: string; location?: string } = {};
    const trimmedName = name.trim();
    const trimmedLocation = location.trim();

    if (!trimmedName) {
      nextErrors.name = 'Tên khu vườn không được để trống';
    } else if (trimmedName.length > GARDEN_NAME_MAX_LENGTH) {
      nextErrors.name = `Tên khu vườn từ 1 đến ${GARDEN_NAME_MAX_LENGTH} ký tự`;
    }

    if (!trimmedLocation) {
      nextErrors.location = 'Vị trí không được để trống';
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    if (!validateLocal()) {
      return;
    }

    try {
      if (isEditMode) {
        const updated = await updateMutation.mutateAsync({
          gardenId: cleanGardenId,
          data: {
            name: name.trim(),
            location: location.trim(),
            spaceType,
            description: description.trim(),
            coverImageUrl: coverImageUrl.trim(),
          },
        });
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace({ pathname: '/garden-detail', params: { gardenId: updated.id } } as never);
        }
      } else {
        const created = await createMutation.mutateAsync({
          name: name.trim(),
          location: location.trim(),
          spaceType,
          description: description.trim() || undefined,
          coverImageUrl: coverImageUrl.trim() || undefined,
        });
        router.replace({ pathname: '/garden-detail', params: { gardenId: created.id } } as never);
      }
    } catch (err) {
      if (err instanceof AppApiError) {
        if (err.field === 'name') {
          setFieldErrors((prev) => ({ ...prev, name: err.message }));
        } else if (err.field === 'location') {
          setFieldErrors((prev) => ({ ...prev, location: err.message }));
        }
        setSubmitError(err.message);
        return;
      }
      setSubmitError('Không thể lưu khu vườn. Vui lòng thử lại.');
    }
  };

  return (
    <SafeAreaView style={g.safe} edges={['top']}>
      <GardenHeader title={title} />
      <ScrollView contentContainerStyle={g.content} keyboardShouldPersistTaps="handled">
        <View style={g.tip}>
          <Text style={g.sectionTitle}>
            {isEditMode ? 'Cập nhật thông tin khu vườn' : 'Thiết lập không gian xanh'}
          </Text>
          <Text style={g.body}>
            Điền thông tin khu vườn để quản lý cây trồng theo từng không gian.
          </Text>
        </View>

        {submitError ? (
          <View style={g.errorBanner} accessibilityRole="alert">
            <Text style={g.errorBannerText}>{submitError}</Text>
          </View>
        ) : null}

        <Text style={g.label}>
          Tên khu vườn <Text style={g.required}>*</Text>
        </Text>
        <TextInput
          value={name}
          onChangeText={(text) => {
            setName(text);
            if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
          }}
          placeholder="Ví dụ: Ban công tầng 3"
          maxLength={220}
          style={[g.input, fieldErrors.name && g.inputError]}
          accessibilityLabel="Tên khu vườn"
        />
        <Text style={g.helperText}>
          {name.trim().length}/{GARDEN_NAME_MAX_LENGTH} ký tự
        </Text>
        {fieldErrors.name ? <Text style={g.error}>{fieldErrors.name}</Text> : null}

        <Text style={g.label}>
          Vị trí <Text style={g.required}>*</Text>
        </Text>
        <TextInput
          value={location}
          onChangeText={(text) => {
            setLocation(text);
            if (fieldErrors.location) setFieldErrors((prev) => ({ ...prev, location: undefined }));
          }}
          placeholder="Địa chỉ hoặc khu vực trồng"
          style={[g.input, fieldErrors.location && g.inputError]}
          accessibilityLabel="Vị trí khu vườn"
        />
        {fieldErrors.location ? <Text style={g.error}>{fieldErrors.location}</Text> : null}

        <Text style={g.label}>Loại không gian</Text>
        <View style={g.choices}>
          {SPACE_TYPE_OPTIONS.map((opt) => {
            const active = spaceType === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setSpaceType(opt.value)}
                style={[g.choice, active && g.choiceActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[g.body, active && g.choiceTextActive]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={g.label}>URL ảnh bìa (không bắt buộc)</Text>
        <TextInput
          value={coverImageUrl}
          onChangeText={setCoverImageUrl}
          placeholder="https://example.com/garden.jpg"
          autoCapitalize="none"
          keyboardType="url"
          style={g.input}
          accessibilityLabel="URL ảnh bìa khu vườn"
        />

        <Text style={g.label}>Mô tả (không bắt buộc)</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Thêm ghi chú về ánh sáng, hướng gió, chăm sóc..."
          style={[g.input, g.multiline]}
          multiline
          accessibilityLabel="Mô tả khu vườn"
        />

        <View style={g.submitWrap}>
          <ActionButton
            label={
              isPending
                ? 'Đang lưu...'
                : isEditMode
                  ? 'Lưu thay đổi'
                  : 'Tạo khu vườn'
            }
            disabled={isPending}
            onPress={handleSubmit}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Local G5.4 UI prototype preserved cleanly for /garden/add-plant.
 */
function AddPlantDemoForm() {
  const params = useLocalSearchParams<{ editId?: string; plantId?: string }>();
  const { ownedPlants, addPlant: createOwnedPlant, updatePlant } = usePlantData();
  const editId = params.editId;
  const editingPlant = editId ? ownedPlants.find((item) => item.id === editId) : undefined;
  const initialCatalogId = params.plantId ?? editingPlant?.catalogId ?? '';
  const initialCatalogPlant = plantCatalog.find((plant) => plant.id === initialCatalogId);
  const [name, setName] = useState(editingPlant?.name ?? initialCatalogPlant?.name ?? '');
  const [place, setPlace] = useState(editingPlant?.location ?? '');
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState(initialCatalogId);
  const [plantedAt, setPlantedAt] = useState(editingPlant?.plantedAt ?? '');
  const [note, setNote] = useState(editingPlant?.note ?? '');
  const [plantQuery, setPlantQuery] = useState('');
  const title = editId ? 'Chỉnh sửa hồ sơ cây demo' : 'Thêm cây trồng (Demo G5.4)';
  const selectedProfile = plantCatalog.find((plant) => plant.id === selected);

  const submit = () => {
    const invalid = !selectedProfile || !name.trim() || !place;
    setError(invalid);
    if (invalid || !selectedProfile) return;
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
  };

  return (
    <SafeAreaView style={g.safe} edges={['top']}>
      <GardenHeader title={title} />
      <ScrollView contentContainerStyle={g.content}>
        <View style={g.tip}>
          <Text style={g.sectionTitle}>Thêm cây vào hồ sơ demo (G5.4)</Text>
          <Text style={g.body}>Lưu tạm cục bộ để thử nghiệm giao diện Quản lý cây.</Text>
        </View>
        <Text style={g.label}>Tìm cây trong mẫu demo</Text>
        <TextInput
          value={plantQuery}
          onChangeText={setPlantQuery}
          placeholder="Nhập tên cây hoặc tên khoa học"
          style={g.input}
        />
        <Text style={g.label}>1. Chọn cây trồng</Text>
        {plantCatalog
          .filter((plant) =>
            `${plant.name} ${plant.scientificName}`
              .toLocaleLowerCase()
              .includes(plantQuery.trim().toLocaleLowerCase())
          )
          .map((plant) => (
            <Pressable
              key={plant.id}
              accessibilityRole="button"
              onPress={() => {
                setSelected(plant.id);
                if (!name.trim() || plantCatalog.some((item) => item.name === name)) {
                  setName(plant.name);
                }
              }}
              style={[g.plantCard, selected === plant.id && g.choiceActive]}
            >
              <View style={g.plantImage}>
                <Text style={g.plantEmoji}>♧</Text>
              </View>
              <View style={g.plantCopy}>
                <Text style={g.plantName}>{plant.name}</Text>
                <Text style={g.body}>
                  {plant.scientificName} • {plant.category} • Mẫu demo G5.4
                </Text>
              </View>
              <Text style={g.link}>{selected === plant.id ? '✓' : 'Chọn'}</Text>
            </Pressable>
          ))}

        {selectedProfile ? (
          <>
            <Text style={g.label}>
              Tên hiển thị <Text style={g.required}>*</Text>
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Tên cây trong hồ sơ của bạn"
              style={[g.input, error && !name.trim() && g.inputError]}
            />
            <Text style={g.label}>2. Vị trí trồng</Text>
            <View style={g.choices}>
              {[
                'Trong nhà',
                'Ban công',
                'Sân thượng',
                'Sân vườn',
                'Ngoài sân',
                'Nhà kính',
                'Khác',
                'Chưa xác định',
              ].map((x) => (
                <Pressable
                  key={x}
                  accessibilityRole="button"
                  onPress={() => setPlace(x)}
                  style={[g.choice, place === x && g.choiceActive]}
                >
                  <Text style={g.body}>{x}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={g.label}>Ngày trồng / bắt đầu chăm sóc (không bắt buộc)</Text>
            <TextInput
              value={plantedAt}
              onChangeText={setPlantedAt}
              placeholder="Ngày/tháng/năm"
              style={g.input}
            />
            <Text style={g.label}>Ghi chú (không bắt buộc)</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Ghi chú về cây"
              style={[g.input, g.multiline]}
              multiline
            />
          </>
        ) : null}

        {error ? <Text style={g.error}>Vui lòng nhập đầy đủ thông tin bắt buộc.</Text> : null}
        <ActionButton label={editId ? 'Cập nhật cây demo' : 'Thêm cây vào vườn'} onPress={submit} />
      </ScrollView>
    </SafeAreaView>
  );
}

export function CreateGardenScreen() {
  const { gardenId } = useLocalSearchParams<{ gardenId?: string }>();
  return <GardenCreateEditForm gardenId={gardenId} />;
}

export function AddGardenPlantScreen() {
  return <AddPlantDemoForm />;
}

const g = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: {
    height: 52,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: { width: 34 },
  backText: { color: C.forest, fontSize: 29 },
  headerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 },
  headerSpacer: { width: 34 },
  content: { padding: 13, gap: 9, paddingBottom: 24 },
  tabWrap: { gap: 10 },
  tabActionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flexButton: { flex: 1 },
  refreshBtn: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: C.softSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBtnText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  filterPills: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 99,
    backgroundColor: '#E7EEE8',
  },
  filterPillActive: { backgroundColor: C.forest },
  filterPillText: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 10 },
  filterPillTextActive: { color: C.surface },
  gardenCard: { padding: 10, borderRadius: 14, backgroundColor: C.surface, gap: 8 },
  gardenCover: { height: 116, borderRadius: 11, backgroundColor: '#DDEFE3' },
  gardenArt: {
    minHeight: 104,
    borderRadius: 11,
    backgroundColor: '#DDEFE3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artGlyph: { color: '#49815E', fontSize: 38 },
  artLabel: { color: '#446751', fontFamily: F.semiBold, fontSize: 9, letterSpacing: 1 },
  cardBody: { gap: 6 },
  cardTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 },
  spaceTag: {
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: '#D5F2E1',
    color: C.forest,
    fontFamily: F.semiBold,
    fontSize: 10,
  },
  stateCard: { padding: 18, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', gap: 9 },
  centerState: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 10 },
  stateTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14, textAlign: 'center' },
  bodyCenter: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, textAlign: 'center', lineHeight: 17 },
  stateActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#E2F1E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyGlyph: { color: C.forest, fontSize: 30 },
  heroCover: { height: 180, borderRadius: 15, backgroundColor: '#DCEDE0' },
  hero: { height: 180, borderRadius: 15, backgroundColor: '#DCEDE0', alignItems: 'center', justifyContent: 'center' },
  heroPlant: { color: '#508664', fontSize: 64 },
  heroLabel: { color: C.forest, fontFamily: F.bold, fontSize: 10, letterSpacing: 1 },
  title: { color: C.forest, fontFamily: F.bold, fontSize: 19 },
  body: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 17 },
  metaLine: { color: C.mutedText, fontFamily: F.regular, fontSize: 10 },
  card: { padding: 11, borderRadius: 14, backgroundColor: C.surface, gap: 8 },
  sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  link: { color: C.primary, fontFamily: F.semiBold, fontSize: 11 },
  emptyPlantsBox: { padding: 10, borderRadius: 10, backgroundColor: C.softSurface, gap: 4 },
  plantCard: {
    minHeight: 66,
    padding: 8,
    borderRadius: 12,
    backgroundColor: C.softSurface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  plantThumb: { width: 46, height: 46, borderRadius: 10, backgroundColor: C.surface },
  plantImage: {
    width: 46,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
  },
  plantEmoji: { fontSize: 22 },
  plantCopy: { flex: 1, gap: 2 },
  plantName: { color: C.forest, fontFamily: F.semiBold, fontSize: 12 },
  healthLabel: { color: C.primary, fontFamily: F.semiBold, fontSize: 10 },
  action: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: C.surface, fontFamily: F.semiBold, fontSize: 12 },
  actionSecondary: { backgroundColor: C.softSurface },
  actionTextSecondary: { color: C.forest },
  actionDanger: { backgroundColor: '#FDECEC', borderWidth: 1, borderColor: '#F5C2C0' },
  actionTextDanger: { color: '#B42318' },
  actionDisabled: { opacity: 0.55 },
  noticeCard: { padding: 11, borderRadius: 12, backgroundColor: C.softSurface, gap: 3 },
  noticeTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  noteLeft: { color: C.mutedText, fontFamily: F.regular, fontSize: 10, lineHeight: 15 },
  note: { color: C.mutedText, fontFamily: F.regular, fontSize: 9, textAlign: 'center' },
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
  tip: { padding: 12, borderRadius: 12, backgroundColor: C.softSurface, gap: 4 },
  label: { color: C.text, fontFamily: F.semiBold, fontSize: 12, marginTop: 4 },
  required: { color: C.terracotta },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: C.surface,
    color: C.text,
    fontFamily: F.regular,
    fontSize: 12,
  },
  inputError: { borderWidth: 1, borderColor: '#C62828' },
  helperText: { color: C.mutedText, fontFamily: F.regular, fontSize: 10, textAlign: 'right' },
  multiline: { height: 80, textAlignVertical: 'top', paddingTop: 10 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 9, backgroundColor: C.surface },
  choiceActive: { borderWidth: 1, borderColor: C.primary, backgroundColor: '#E0F2E6' },
  choiceTextActive: { color: C.forest, fontFamily: F.semiBold },
  error: { color: '#B42318', fontFamily: F.regular, fontSize: 11 },
  submitWrap: { marginTop: 6 },
});
