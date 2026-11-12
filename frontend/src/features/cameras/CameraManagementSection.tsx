import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { AppApiError } from '@/services/api/apiError';
import { getSessionGeneration } from '@/services/api/tokenStorage';
import {
  useCreateCameraMutation,
  useDeleteCameraMutation,
  useGardenCameras,
  useUpdateCameraMutation,
} from './cameraHooks';
import {
  CAMERA_MANUAL_STATUS_DISCLAIMER,
  CAMERA_SECURITY_HELPER_NOTE,
  CAMERA_STATUS_OPTIONS,
  getCameraStatusMeta,
  type CameraDto,
  type CameraStatus,
} from './cameraTypes';
import {
  CAMERA_NAME_MAX_LENGTH,
  validateCameraConnectionNote,
  validateCameraName,
} from './cameraValidation';

interface CameraManagementSectionProps {
  gardenId: string;
  enabled?: boolean;
  disabled?: boolean;
}

type FormFieldErrors = {
  name?: string;
  connectionNote?: string;
};

function getToneColors(tone: 'mint' | 'plain' | 'danger') {
  switch (tone) {
    case 'mint':
      return { bg: '#D5F2E1', text: C.forest };
    case 'danger':
      return { bg: '#FDECEC', text: '#991B1B' };
    case 'plain':
    default:
      return { bg: '#E7EEE8', text: C.secondaryText };
  }
}

export function CameraManagementSection({
  gardenId,
  enabled = true,
  disabled = false,
}: CameraManagementSectionProps) {
  const { user } = useAuth();
  const currentUserId = typeof user?.id === 'string' ? user.id.trim() : '';
  const currentUserIdRef = useRef(currentUserId);
  const prevUserIdRef = useRef(currentUserId);
  const prevGardenIdRef = useRef(gardenId);

  const camerasQuery = useGardenCameras(gardenId, { enabled });
  const createMutation = useCreateCameraMutation();
  const updateMutation = useUpdateCameraMutation();
  const deleteMutation = useDeleteCameraMutation();

  const [formMode, setFormMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editingCamera, setEditingCamera] = useState<CameraDto | null>(null);
  const [name, setName] = useState('');
  const [locationDesc, setLocationDesc] = useState('');
  const [connectionNote, setConnectionNote] = useState('');
  const [status, setStatus] = useState<CameraStatus>('OFFLINE');
  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deletingCameraId, setDeletingCameraId] = useState<string | null>(null);

  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    const prevGardenId = prevGardenIdRef.current;
    prevUserIdRef.current = currentUserId;
    prevGardenIdRef.current = gardenId;
    currentUserIdRef.current = currentUserId;

    if ((prevUserId && prevUserId !== currentUserId) || prevGardenId !== gardenId) {
      setFormMode('closed');
      setEditingCamera(null);
      setName('');
      setLocationDesc('');
      setConnectionNote('');
      setStatus('OFFLINE');
      setFieldErrors({});
      setSubmitError(null);
      setDeletingCameraId(null);
    }
  }, [currentUserId, gardenId]);

  const isMutating =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const cameras = camerasQuery.data ?? [];

  const openCreateForm = () => {
    setFormMode('create');
    setEditingCamera(null);
    setName('');
    setLocationDesc('');
    setConnectionNote('');
    setStatus('OFFLINE');
    setFieldErrors({});
    setSubmitError(null);
  };

  const openEditForm = (cam: CameraDto) => {
    setFormMode('edit');
    setEditingCamera(cam);
    setName(cam.name);
    setLocationDesc(cam.locationDesc ?? '');
    setConnectionNote(cam.connectionNote ?? '');
    setStatus(cam.status);
    setFieldErrors({});
    setSubmitError(null);
  };

  const closeForm = () => {
    setFormMode('closed');
    setEditingCamera(null);
    setName('');
    setLocationDesc('');
    setConnectionNote('');
    setStatus('OFFLINE');
    setFieldErrors({});
    setSubmitError(null);
  };

  const validateLocal = (): boolean => {
    const nextErrors: FormFieldErrors = {};

    try {
      validateCameraName(name);
    } catch (err) {
      nextErrors.name = err instanceof AppApiError ? err.message : 'Tên camera không hợp lệ.';
    }

    try {
      validateCameraConnectionNote(connectionNote);
    } catch (err) {
      nextErrors.connectionNote =
        err instanceof AppApiError
          ? err.message
          : 'Ghi chú kết nối chứa thông tin không được phép.';
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

    const trimmedName = name.trim();
    const trimmedLocationDesc = locationDesc.trim();
    const trimmedConnectionNote = connectionNote.trim();

    try {
      if (formMode === 'edit' && editingCamera) {
        await updateMutation.mutateAsync({
          cameraId: editingCamera.id,
          gardenId,
          data: {
            name: trimmedName,
            locationDesc: trimmedLocationDesc,
            status,
            connectionNote: trimmedConnectionNote,
          },
        });
      } else {
        await createMutation.mutateAsync({
          gardenId,
          request: {
            name: trimmedName,
            ...(trimmedLocationDesc ? { locationDesc: trimmedLocationDesc } : {}),
            ...(trimmedConnectionNote ? { connectionNote: trimmedConnectionNote } : {}),
          },
        });
      }
      if (hasSwitchedSession()) {
        return;
      }
      closeForm();
    } catch (err) {
      if (hasSwitchedSession()) {
        return;
      }
      if (err instanceof AppApiError) {
        if (err.code === 'SESSION_USER_MISMATCH') {
          return;
        }
        if (err.field === 'name') {
          setFieldErrors((prev) => ({ ...prev, name: err.message }));
        } else if (err.field === 'connectionNote') {
          setFieldErrors((prev) => ({ ...prev, connectionNote: err.message }));
        }
        setSubmitError(err.message);
        return;
      }
      setSubmitError('Không thể lưu thông tin camera. Vui lòng thử lại.');
    }
  };

  const executeDelete = async (camera: CameraDto) => {
    const initiatedGeneration = getSessionGeneration();
    const initiatedByUserId = currentUserIdRef.current;
    const hasSwitchedSession = () =>
      getSessionGeneration() !== initiatedGeneration ||
      (Boolean(initiatedByUserId) && currentUserIdRef.current !== initiatedByUserId);

    setSubmitError(null);
    setDeletingCameraId(camera.id);
    try {
      await deleteMutation.mutateAsync({ cameraId: camera.id, gardenId });
      if (hasSwitchedSession()) {
        return;
      }
      if (editingCamera?.id === camera.id) {
        closeForm();
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
      } else {
        setSubmitError('Không thể xóa camera. Vui lòng thử lại.');
      }
    } finally {
      if (!hasSwitchedSession()) {
        setDeletingCameraId(null);
      }
    }
  };

  const handleRequestDelete = (camera: CameraDto) => {
    Alert.alert(
      'Xác nhận xóa camera',
      `Xóa camera “${camera.name}”? Thao tác này không xóa khu vườn hay cây trồng, và không thể hoàn tác.`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa camera',
          style: 'destructive',
          onPress: () => {
            void executeDelete(camera);
          },
        },
      ]
    );
  };

  const statusCode = camerasQuery.error?.statusCode;
  const isForbiddenOrNotFound = statusCode === 403 || statusCode === 404;

  return (
    <View style={c.card}>
      <View style={c.headerRow}>
        <Text style={c.sectionTitle}>
          Camera giám sát{camerasQuery.data ? ` (${cameras.length})` : ''}
        </Text>
        <Pressable
          disabled={disabled || isMutating}
          onPress={formMode === 'closed' ? openCreateForm : closeForm}
          accessibilityRole="button"
          accessibilityLabel={formMode === 'closed' ? 'Thêm camera' : 'Đóng biểu mẫu camera'}
          accessibilityState={{ disabled: disabled || isMutating }}
          style={disabled || isMutating ? c.disabled : undefined}
        >
          <Text style={c.link}>{formMode === 'closed' ? '＋ Thêm camera' : 'Đóng'}</Text>
        </Pressable>
      </View>

      <Text style={c.disclaimer}>{CAMERA_MANUAL_STATUS_DISCLAIMER}</Text>

      {submitError ? (
        <View style={c.errorBanner} accessibilityRole="alert">
          <Text style={c.errorBannerText}>{submitError}</Text>
          <Pressable
            onPress={() => setSubmitError(null)}
            accessibilityRole="button"
            accessibilityLabel="Đóng thông báo lỗi camera"
          >
            <Text style={c.dismissText}>Đóng</Text>
          </Pressable>
        </View>
      ) : null}

      {formMode !== 'closed' ? (
        <View style={c.formCard}>
          <Text style={c.formTitle}>
            {formMode === 'edit' ? 'Chỉnh sửa camera' : 'Thêm camera mới'}
          </Text>

          <Text style={c.label}>
            Tên camera <Text style={c.required}>*</Text>
          </Text>
          <TextInput
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (fieldErrors.name) {
                setFieldErrors((prev) => ({ ...prev, name: undefined }));
              }
            }}
            placeholder="Ví dụ: Camera Ban Công Đông"
            maxLength={220}
            editable={!isMutating && !disabled}
            style={[c.input, fieldErrors.name && c.inputError]}
            accessibilityLabel="Tên camera"
          />
          <Text style={c.helperText}>
            {name.trim().length}/{CAMERA_NAME_MAX_LENGTH} ký tự
          </Text>
          {fieldErrors.name ? <Text style={c.errorText}>{fieldErrors.name}</Text> : null}

          <Text style={c.label}>Vị trí lắp đặt (không bắt buộc)</Text>
          <TextInput
            value={locationDesc}
            onChangeText={setLocationDesc}
            placeholder="Ví dụ: Góc tường hướng Tây Nam"
            editable={!isMutating && !disabled}
            style={c.input}
            accessibilityLabel="Vị trí lắp đặt camera"
          />

          {formMode === 'edit' ? (
            <>
              <Text style={c.label}>Trạng thái ghi nhận</Text>
              <View style={c.statusGrid}>
                {CAMERA_STATUS_OPTIONS.map((opt) => {
                  const active = status === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      disabled={isMutating || disabled}
                      onPress={() => setStatus(opt.value)}
                      accessibilityRole="button"
                      accessibilityLabel={`Trạng thái ${opt.label}`}
                      accessibilityState={{ selected: active, disabled: isMutating || disabled }}
                      style={[c.statusBtn, active && c.statusBtnActive]}
                    >
                      <Text style={[c.statusBtnText, active && c.statusBtnTextActive]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : (
            <Text style={c.helperText}>
              Camera mới tạo luôn bắt đầu ở trạng thái Offline (OFFLINE).
            </Text>
          )}

          <Text style={c.label}>Ghi chú kết nối (không bắt buộc)</Text>
          <TextInput
            value={connectionNote}
            onChangeText={(text) => {
              setConnectionNote(text);
              if (fieldErrors.connectionNote) {
                setFieldErrors((prev) => ({ ...prev, connectionNote: undefined }));
              }
            }}
            placeholder="Ví dụ: Đã kiểm tra nguồn điện và cáp mạng"
            multiline
            editable={!isMutating && !disabled}
            style={[c.input, c.multiline, fieldErrors.connectionNote && c.inputError]}
            accessibilityLabel="Ghi chú kết nối camera"
          />
          <Text style={c.securityNote}>{CAMERA_SECURITY_HELPER_NOTE}</Text>
          {fieldErrors.connectionNote ? (
            <Text style={c.errorText}>{fieldErrors.connectionNote}</Text>
          ) : null}

          <View style={c.formActions}>
            <View style={c.flexBtn}>
              <Pressable
                disabled={isMutating || disabled}
                onPress={() => {
                  void handleSubmit();
                }}
                accessibilityRole="button"
                accessibilityLabel={
                  formMode === 'edit' ? 'Lưu thay đổi camera' : 'Lưu camera mới'
                }
                accessibilityState={{ disabled: isMutating || disabled }}
                style={[c.primaryBtn, (isMutating || disabled) && c.disabled]}
              >
                <Text style={c.primaryBtnText}>
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Đang lưu...'
                    : formMode === 'edit'
                      ? 'Lưu thay đổi'
                      : 'Lưu camera'}
                </Text>
              </Pressable>
            </View>
            <View style={c.flexBtn}>
              <Pressable
                disabled={isMutating}
                onPress={closeForm}
                accessibilityRole="button"
                accessibilityLabel="Hủy biểu mẫu camera"
                accessibilityState={{ disabled: isMutating }}
                style={[c.secondaryBtn, isMutating && c.disabled]}
              >
                <Text style={c.secondaryBtnText}>Hủy</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {camerasQuery.isLoading ? (
        <View style={c.stateBox}>
          <ActivityIndicator size="small" color={C.primary} />
          <Text style={c.bodyCenter}>Đang tải danh sách camera...</Text>
        </View>
      ) : camerasQuery.isError && !camerasQuery.data ? (
        <View style={c.errorStateBox} accessibilityRole="alert">
          <Text style={c.errorTitle}>Không thể tải danh sách camera</Text>
          <Text style={c.bodyCenter}>
            {camerasQuery.error?.message || 'Đã xảy ra lỗi khi tải thông tin camera.'}
          </Text>
          {!isForbiddenOrNotFound ? (
            <Pressable
              onPress={() => {
                void camerasQuery.refetch();
              }}
              accessibilityRole="button"
              accessibilityLabel="Thử lại tải danh sách camera"
              style={c.retryBtn}
            >
              <Text style={c.retryBtnText}>Thử lại</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <>
          {camerasQuery.isError ? (
            <View style={c.errorBanner} accessibilityRole="alert">
              <Text style={c.errorBannerText}>
                {camerasQuery.error?.message || 'Không thể làm mới danh sách camera.'}
              </Text>
              <Pressable
                onPress={() => {
                  void camerasQuery.refetch();
                }}
                accessibilityRole="button"
                accessibilityLabel="Thử lại làm mới camera"
              >
                <Text style={c.dismissText}>Thử lại</Text>
              </Pressable>
            </View>
          ) : null}

          {cameras.length === 0 ? (
            <View style={c.stateBox}>
              <Text style={c.bodyCenter}>Khu vườn này chưa có camera giám sát nào.</Text>
              <Text style={c.helperCenter}>
                Nhấn “＋ Thêm camera” để lưu tên, vị trí và ghi chú metadata cho camera.
              </Text>
            </View>
          ) : (
            cameras.map((cam) => {
              const statusMeta = getCameraStatusMeta(cam.status);
              const toneColors = getToneColors(statusMeta.tone);
              const isDeletingThis = deletingCameraId === cam.id && deleteMutation.isPending;

              return (
                <View key={cam.id} style={c.cameraItem}>
                  <View style={c.cameraHeader}>
                    <Text style={c.cameraName}>{cam.name}</Text>
                    <Text
                      style={[
                        c.statusTag,
                        { backgroundColor: toneColors.bg, color: toneColors.text },
                      ]}
                    >
                      {statusMeta.label}
                    </Text>
                  </View>

                  <Text style={c.body}>
                    Vị trí: {cam.locationDesc || 'Chưa ghi vị trí cụ thể'}
                  </Text>
                  <Text style={c.body}>
                    Ghi chú kết nối: {cam.connectionNote || 'Không có ghi chú kết nối'}
                  </Text>

                  <View style={c.itemActions}>
                    <Pressable
                      disabled={isMutating || disabled}
                      onPress={() => openEditForm(cam)}
                      accessibilityRole="button"
                      accessibilityLabel={`Chỉnh sửa camera ${cam.name}`}
                      accessibilityState={{ disabled: isMutating || disabled }}
                      style={[c.itemEditBtn, (isMutating || disabled) && c.disabled]}
                    >
                      <Text style={c.itemEditBtnText}>Chỉnh sửa</Text>
                    </Pressable>
                    <Pressable
                      disabled={isMutating || disabled}
                      onPress={() => handleRequestDelete(cam)}
                      accessibilityRole="button"
                      accessibilityLabel={`Xóa camera ${cam.name}`}
                      accessibilityState={{ disabled: isMutating || disabled }}
                      style={[c.itemDeleteBtn, (isMutating || disabled) && c.disabled]}
                    >
                      <Text style={c.itemDeleteBtnText}>
                        {isDeletingThis ? 'Đang xóa...' : 'Xóa'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </>
      )}
    </View>
  );
}

const c = StyleSheet.create({
  card: {
    padding: 11,
    borderRadius: 14,
    backgroundColor: C.surface,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    color: C.forest,
    fontFamily: F.semiBold,
    fontSize: 14,
  },
  link: {
    color: C.primary,
    fontFamily: F.semiBold,
    fontSize: 11,
  },
  disclaimer: {
    color: C.mutedText,
    fontFamily: F.regular,
    fontSize: 10,
    lineHeight: 15,
  },
  stateBox: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: C.softSurface,
    alignItems: 'center',
    gap: 5,
  },
  errorStateBox: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: '#F5C2C0',
    alignItems: 'center',
    gap: 6,
  },
  errorTitle: {
    color: '#991B1B',
    fontFamily: F.semiBold,
    fontSize: 12,
  },
  retryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: C.primary,
  },
  retryBtnText: {
    color: C.surface,
    fontFamily: F.semiBold,
    fontSize: 11,
  },
  body: {
    color: C.secondaryText,
    fontFamily: F.regular,
    fontSize: 11,
    lineHeight: 16,
  },
  bodyCenter: {
    color: C.secondaryText,
    fontFamily: F.regular,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  helperCenter: {
    color: C.mutedText,
    fontFamily: F.regular,
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 15,
  },
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
  errorBannerText: {
    flex: 1,
    color: '#991B1B',
    fontFamily: F.regular,
    fontSize: 11,
  },
  dismissText: {
    color: '#991B1B',
    fontFamily: F.semiBold,
    fontSize: 11,
  },
  formCard: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: C.softSurface,
    gap: 6,
  },
  formTitle: {
    color: C.forest,
    fontFamily: F.semiBold,
    fontSize: 13,
  },
  label: {
    color: C.text,
    fontFamily: F.semiBold,
    fontSize: 11,
    marginTop: 2,
  },
  required: {
    color: C.terracotta,
  },
  input: {
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: '#DDE8E0',
    color: C.text,
    fontFamily: F.regular,
    fontSize: 12,
  },
  multiline: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: '#D14343',
  },
  helperText: {
    color: C.mutedText,
    fontFamily: F.regular,
    fontSize: 10,
  },
  securityNote: {
    color: C.secondaryText,
    fontFamily: F.regular,
    fontSize: 10,
    lineHeight: 14,
  },
  errorText: {
    color: '#B42318',
    fontFamily: F.regular,
    fontSize: 10,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statusBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: '#DDE8E0',
  },
  statusBtnActive: {
    backgroundColor: C.forest,
    borderColor: C.forest,
  },
  statusBtnText: {
    color: C.secondaryText,
    fontFamily: F.semiBold,
    fontSize: 10,
  },
  statusBtnTextActive: {
    color: C.surface,
  },
  formActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  flexBtn: {
    flex: 1,
  },
  primaryBtn: {
    minHeight: 40,
    borderRadius: 9,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  primaryBtnText: {
    color: C.surface,
    fontFamily: F.semiBold,
    fontSize: 11,
  },
  secondaryBtn: {
    minHeight: 40,
    borderRadius: 9,
    backgroundColor: '#E7EEE8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  secondaryBtnText: {
    color: C.forest,
    fontFamily: F.semiBold,
    fontSize: 11,
  },
  cameraItem: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: C.softSurface,
    gap: 4,
  },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cameraName: {
    flex: 1,
    color: C.forest,
    fontFamily: F.semiBold,
    fontSize: 13,
  },
  statusTag: {
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    fontFamily: F.semiBold,
    fontSize: 10,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  itemEditBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#E7EEE8',
  },
  itemEditBtnText: {
    color: C.forest,
    fontFamily: F.semiBold,
    fontSize: 11,
  },
  itemDeleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: '#F5C2C0',
  },
  itemDeleteBtnText: {
    color: '#B42318',
    fontFamily: F.semiBold,
    fontSize: 11,
  },
  disabled: {
    opacity: 0.55,
  },
});
