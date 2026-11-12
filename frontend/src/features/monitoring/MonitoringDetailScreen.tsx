import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { formatIsoDateTimeVn } from '@/features/carelog/careLogApi';
import { getHealthStatusMeta } from '@/features/gardens/gardenTypes';
import { getEntryTypeMeta, getJournalHealthStatusMeta } from '@/features/journal/journalTypes';
import { usePlantMonitoringDetail } from './monitoringHooks';
import {
  getMonitoringActivitySourceMeta,
  MONITORING_CARE_LOG_PROVENANCE_NOTE,
  MONITORING_DEFAULT_HEALTHY_NOTE,
  MONITORING_JOURNAL_HEALTH_NOTE,
  MONITORING_PROFILE_HEALTH_LABEL,
  MONITORING_SENSOR_DISCONNECTED_TEXT,
  MONITORING_SPECIES_GUIDE_TITLE,
  SPECIES_CARE_GUIDE_FIELDS,
  type CareLogsWindowSummaryDto,
} from './monitoringTypes';

const CHART_WIDTH = 280;
const CHART_HEIGHT = 16;

function DetailHeader({ title }: { title: string }) {
  return (
    <View style={m.header}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Quay lại"
        style={m.backButton}
      >
        <Text style={m.back}>‹</Text>
      </Pressable>
      <Text style={m.headerTitle}>{title}</Text>
      <View style={m.headerSpacer} />
    </View>
  );
}

function getToneTagColors(tone: 'mint' | 'peach' | 'danger' | 'plain') {
  switch (tone) {
    case 'mint':
      return { bg: '#D5F2E1', text: C.forest };
    case 'peach':
      return { bg: '#FFE0CF', text: '#914218' };
    case 'danger':
      return { bg: '#FDECEC', text: '#991B1B' };
    case 'plain':
    default:
      return { bg: '#E7EEE8', text: C.secondaryText };
  }
}

function CareLogs30dBar({ summary }: { summary: CareLogsWindowSummaryDto }) {
  const segments = [
    { key: 'unlinkedCompleted', count: summary.unlinkedCompletedLogs, color: '#568568' },
    { key: 'unlinkedSkipped', count: summary.unlinkedSkippedLogs, color: '#94A39B' },
    { key: 'linkedCompleted', count: summary.linkedScheduledCompletedLogs, color: '#2F8F5B' },
    { key: 'linkedSkipped', count: summary.linkedScheduledSkippedLogs, color: '#E07A38' },
  ].filter((seg) => seg.count > 0);

  const total = segments.reduce((acc, item) => acc + item.count, 0);
  if (total <= 0) {
    return null;
  }

  let currentX = 0;
  return (
    <View style={m.chartWrap}>
      <Svg
        width="100%"
        height={CHART_HEIGHT}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        accessibilityLabel={`Tỷ lệ nhóm CareLog 30 ngày: ${summary.unlinkedCompletedLogs} không/chưa gắn lịch hoàn thành, ${summary.unlinkedSkippedLogs} không/chưa gắn lịch bỏ qua, ${summary.linkedScheduledCompletedLogs} theo lịch hiện còn hoàn thành, ${summary.linkedScheduledSkippedLogs} theo lịch hiện còn bỏ qua`}
      >
        {segments.map((seg, idx) => {
          const isLast = idx === segments.length - 1;
          const segWidth = isLast
            ? Math.max(0, CHART_WIDTH - currentX)
            : (seg.count / total) * CHART_WIDTH;
          const x = currentX;
          currentX += segWidth;
          return (
            <Rect
              key={seg.key}
              x={x}
              y={0}
              width={segWidth}
              height={CHART_HEIGHT}
              rx={idx === 0 || isLast ? 4 : 0}
              fill={seg.color}
            />
          );
        })}
      </Svg>
    </View>
  );
}

export default function MonitoringDetailScreen() {
  const { plantId } = useLocalSearchParams<{ plantId?: string }>();
  const cleanPlantId = typeof plantId === 'string' ? plantId.trim() : '';

  const detailQuery = usePlantMonitoringDetail(cleanPlantId, {
    enabled: Boolean(cleanPlantId),
  });

  if (!cleanPlantId) {
    return (
      <SafeAreaView style={m.safe} edges={['top']}>
        <DetailHeader title="Chi tiết theo dõi cây" />
        <View style={m.centerState} accessibilityRole="alert">
          <Text style={m.stateTitle}>Không xác định được cây trồng</Text>
          <Text style={m.bodyCenter}>Thiếu mã cây trồng (plantId) để tải chi tiết theo dõi.</Text>
          <View style={m.actionsRow}>
            <Pressable
              onPress={() => router.replace('/monitoring' as never)}
              accessibilityRole="button"
              style={m.primaryBtn}
            >
              <Text style={m.primaryBtnText}>Quay lại theo dõi</Text>
            </Pressable>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              style={m.secondaryBtn}
            >
              <Text style={m.secondaryBtnText}>Quay lại</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const detail = detailQuery.data;

  if (detailQuery.isLoading && !detail) {
    return (
      <SafeAreaView style={m.safe} edges={['top']}>
        <DetailHeader title="Chi tiết theo dõi cây" />
        <View style={m.centerState} accessibilityLabel="Đang tải chi tiết theo dõi cây">
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={m.bodyCenter}>Đang tải dữ liệu theo dõi cây trồng...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (detailQuery.isError && !detail) {
    const statusCode = detailQuery.error?.statusCode;
    const isForbidden = statusCode === 403;
    const isNotFound = statusCode === 404;

    return (
      <SafeAreaView style={m.safe} edges={['top']}>
        <DetailHeader title="Chi tiết theo dõi cây" />
        <View style={m.centerState} accessibilityRole="alert">
          <Text style={m.stateTitle}>
            {isForbidden
              ? 'Không có quyền truy cập cây trồng'
              : isNotFound
                ? 'Không tìm thấy cây trồng'
                : 'Không thể tải chi tiết theo dõi'}
          </Text>
          <Text style={m.bodyCenter}>
            {isForbidden
              ? 'Bạn không có quyền xem dữ liệu theo dõi của cây trồng này.'
              : detailQuery.error?.message || 'Vui lòng thử lại sau.'}
          </Text>
          <View style={m.actionsRow}>
            {!isForbidden && !isNotFound ? (
              <Pressable
                onPress={() => void detailQuery.refetch()}
                accessibilityRole="button"
                accessibilityLabel="Thử lại tải chi tiết theo dõi"
                style={m.primaryBtn}
              >
                <Text style={m.primaryBtnText}>Thử lại</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              style={m.secondaryBtn}
            >
              <Text style={m.secondaryBtnText}>Quay lại</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!detail) {
    return null;
  }

  const healthMeta = getHealthStatusMeta(detail.currentHealthStatus);
  const healthTagColors = getToneTagColors(healthMeta.tone);
  const generatedLabel = detail.generatedAt ? formatIsoDateTimeVn(detail.generatedAt, '') : '';
  const visibleGuideFields = SPECIES_CARE_GUIDE_FIELDS.filter((field) => {
    const val = detail.speciesCareGuide[field.key];
    return typeof val === 'string' && val.trim().length > 0;
  });

  const careLogsTotal30d =
    detail.careLogsSummary30d.unlinkedCompletedLogs +
    detail.careLogsSummary30d.unlinkedSkippedLogs +
    detail.careLogsSummary30d.linkedScheduledCompletedLogs +
    detail.careLogsSummary30d.linkedScheduledSkippedLogs;

  return (
    <SafeAreaView style={m.safe} edges={['top']}>
      <DetailHeader title="Chi tiết theo dõi cây" />
      <ScrollView contentContainerStyle={m.content} showsVerticalScrollIndicator={false}>
        {detailQuery.isError ? (
          <View style={m.inlineBanner} accessibilityRole="alert">
            <Text style={m.inlineBannerText}>
              {detailQuery.error?.message || 'Không thể làm mới chi tiết theo dõi.'}
            </Text>
            <Pressable
              onPress={() => void detailQuery.refetch()}
              accessibilityRole="button"
              accessibilityLabel="Thử lại"
            >
              <Text style={m.inlineRetryText}>Thử lại</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={m.toolbarRow}>
          <Text style={m.generatedText}>
            {generatedLabel ? `Cập nhật: ${generatedLabel}` : 'Dữ liệu đồng bộ từ máy chủ'}
          </Text>
          <Pressable
            onPress={() => void detailQuery.refetch()}
            disabled={detailQuery.isFetching}
            accessibilityRole="button"
            accessibilityLabel="Làm mới chi tiết theo dõi"
            style={[m.refreshBtn, detailQuery.isFetching && m.disabled]}
          >
            <Text style={m.refreshBtnText}>
              {detailQuery.isFetching ? 'Đang tải...' : 'Làm mới'}
            </Text>
          </Pressable>
        </View>

        <View style={m.identityCard}>
          <Text style={m.title}>{detail.displayName}</Text>
          {detail.species ? (
            <Text style={m.body}>
              {[
                detail.species.commonName,
                detail.species.scientificName,
                detail.species.category,
              ]
                .filter(Boolean)
                .join(' • ')}
            </Text>
          ) : null}
          {detail.garden ? (
            <Text style={m.body}>Khu vườn: {detail.garden.name}</Text>
          ) : null}

          <View style={m.quickActions}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/plant-detail',
                  params: { plantId: detail.plantId },
                } as never)
              }
              accessibilityRole="button"
              accessibilityLabel="Mở hồ sơ cây"
              style={m.secondaryBtn}
            >
              <Text style={m.secondaryBtnText}>Mở hồ sơ cây</Text>
            </Pressable>
            {detail.garden?.id ? (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/garden-detail',
                    params: { gardenId: detail.garden?.id ?? '' },
                  } as never)
                }
                accessibilityRole="button"
                accessibilityLabel="Mở khu vườn"
                style={m.secondaryBtn}
              >
                <Text style={m.secondaryBtnText}>Mở khu vườn</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/journal/new',
                  params: { plantId: detail.plantId },
                } as never)
              }
              accessibilityRole="button"
              accessibilityLabel="Ghi nhận tiến triển"
              style={m.primaryBtn}
            >
              <Text style={m.primaryBtnText}>＋ Ghi nhật ký</Text>
            </Pressable>
          </View>
        </View>

        <View style={m.card}>
          <Text style={m.section}>{MONITORING_PROFILE_HEALTH_LABEL}</Text>
          <View style={m.healthRow}>
            <Text
              style={[
                m.tag,
                { backgroundColor: healthTagColors.bg, color: healthTagColors.text },
              ]}
            >
              {healthMeta.label}
            </Text>
          </View>
          <Text style={m.provenanceNote}>{MONITORING_DEFAULT_HEALTHY_NOTE}</Text>

          <View style={m.metricsRow}>
            <View style={m.metricBox}>
              <Text style={m.metricValue}>
                {detail.ageDays !== null ? `${detail.ageDays} ngày` : 'Chưa xác định'}
              </Text>
              <Text style={m.metricLabel}>Tuổi cây (ngày VN)</Text>
            </View>
            <View style={m.metricBox}>
              <Text style={m.metricValue}>{detail.plantedAt ?? 'Chưa ghi nhận'}</Text>
              <Text style={m.metricLabel}>Ngày trồng</Text>
            </View>
          </View>
        </View>

        <View style={m.sensorBanner}>
          <Text style={m.sensorTitle}>
            {detail.sensorConnected
              ? 'Cảm biến IoT đã kết nối'
              : MONITORING_SENSOR_DISCONNECTED_TEXT}
          </Text>
          <Text style={m.body}>
            Chưa có thiết bị cảm biến môi trường gắn với cây trồng này.
          </Text>
        </View>

        <View style={m.card}>
          <Text style={m.section}>Tóm tắt lịch chăm sóc</Text>
          <View style={m.metricsRow}>
            <View style={m.metricBox}>
              <Text style={m.metricValue}>{detail.schedulesSummary.activeCount}</Text>
              <Text style={m.metricLabel}>Lịch đang bật</Text>
            </View>
            <View style={m.metricBox}>
              <Text style={m.metricValue}>{detail.schedulesSummary.dueTodayCount}</Text>
              <Text style={m.metricLabel}>Đến hạn hôm nay</Text>
            </View>
            <View style={m.metricBox}>
              <Text
                style={[
                  m.metricValue,
                  detail.schedulesSummary.overdueCount > 0 && m.overdueValue,
                ]}
              >
                {detail.schedulesSummary.overdueCount}
              </Text>
              <Text style={m.metricLabel}>Quá hạn</Text>
            </View>
          </View>
        </View>

        <View style={m.card}>
          <Text style={m.section}>Thống kê chăm sóc 30 ngày gần nhất</Text>
          {careLogsTotal30d > 0 ? (
            <CareLogs30dBar summary={detail.careLogsSummary30d} />
          ) : (
            <Text style={m.body}>Chưa có lượt chăm sóc nào được ghi nhận trong 30 ngày qua.</Text>
          )}
          <View style={m.counterGrid}>
            <View style={m.counterBox}>
              <Text style={m.counterValue}>
                {detail.careLogsSummary30d.unlinkedCompletedLogs}
              </Text>
              <Text style={m.counterLabel}>Không/chưa gắn lịch • Hoàn thành</Text>
            </View>
            <View style={m.counterBox}>
              <Text style={m.counterValue}>
                {detail.careLogsSummary30d.unlinkedSkippedLogs}
              </Text>
              <Text style={m.counterLabel}>Không/chưa gắn lịch • Bỏ qua</Text>
            </View>
            <View style={m.counterBox}>
              <Text style={m.counterValue}>
                {detail.careLogsSummary30d.linkedScheduledCompletedLogs}
              </Text>
              <Text style={m.counterLabel}>Theo lịch hiện còn • Hoàn thành</Text>
            </View>
            <View style={m.counterBox}>
              <Text style={m.counterValue}>
                {detail.careLogsSummary30d.linkedScheduledSkippedLogs}
              </Text>
              <Text style={m.counterLabel}>Theo lịch hiện còn • Bỏ qua</Text>
            </View>
          </View>
          <Text style={m.provenanceNote}>{MONITORING_CARE_LOG_PROVENANCE_NOTE}</Text>
        </View>

        <View style={m.card}>
          <Text style={m.section}>Dòng thời gian hoạt động gần đây</Text>
          {detail.recentActivityTimeline.length === 0 ? (
            <Text style={m.body}>Chưa có hoạt động chăm sóc hoặc nhật ký gần đây.</Text>
          ) : (
            detail.recentActivityTimeline.map((item) => {
              const sourceMeta = getMonitoringActivitySourceMeta(item.sourceType);
              const sourceTagColors = getToneTagColors(sourceMeta.tone);
              const journalHealth = item.healthStatus
                ? getJournalHealthStatusMeta(item.healthStatus)
                : null;
              return (
                <View key={`${item.sourceType}-${item.id}`} style={m.timelineItem}>
                  <View style={m.timelineHeader}>
                    <Text style={m.timelineTitle}>{item.title}</Text>
                    <Text
                      style={[
                        m.tag,
                        { backgroundColor: sourceTagColors.bg, color: sourceTagColors.text },
                      ]}
                    >
                      {sourceMeta.label}
                    </Text>
                  </View>
                  <Text style={m.metaText}>{formatIsoDateTimeVn(item.occurredAt)}</Text>
                  {journalHealth ? (
                    <Text style={m.metaText}>Nhật ký ghi nhận: {journalHealth.label}</Text>
                  ) : null}
                  {item.notePreview ? <Text style={m.body}>{item.notePreview}</Text> : null}
                </View>
              );
            })
          )}
        </View>

        <View style={m.card}>
          <Text style={m.section}>Nhật ký phát triển gần đây</Text>
          <Text style={m.provenanceNote}>{MONITORING_JOURNAL_HEALTH_NOTE}</Text>
          {detail.recentJournalObservations.length === 0 ? (
            <Text style={m.body}>Chưa có ghi nhận nhật ký phát triển gần đây.</Text>
          ) : (
            detail.recentJournalObservations.map((obs) => {
              const entryMeta = getEntryTypeMeta(obs.entryType);
              const jHealthMeta = getJournalHealthStatusMeta(obs.healthStatus);
              const jHealthColors = getToneTagColors(jHealthMeta.tone);
              return (
                <View key={obs.journalId} style={m.timelineItem}>
                  <View style={m.timelineHeader}>
                    <Text style={m.timelineTitle}>{entryMeta.label}</Text>
                    <Text
                      style={[
                        m.tag,
                        { backgroundColor: jHealthColors.bg, color: jHealthColors.text },
                      ]}
                    >
                      {jHealthMeta.label}
                    </Text>
                  </View>
                  <Text style={m.metaText}>{formatIsoDateTimeVn(obs.recordedAt)}</Text>
                  {obs.notePreview ? <Text style={m.body}>{obs.notePreview}</Text> : null}
                </View>
              );
            })
          )}
        </View>

        <View style={m.card}>
          <Text style={m.section}>{MONITORING_SPECIES_GUIDE_TITLE}</Text>
          {visibleGuideFields.length === 0 ? (
            <Text style={m.body}>Chưa có hướng dẫn chăm sóc tham khảo cho loài cây này.</Text>
          ) : (
            visibleGuideFields.map((field) => (
              <View key={field.key} style={m.guideRow}>
                <Text style={m.guideLabel}>{field.label}</Text>
                <Text style={m.guideValue}>{detail.speciesCareGuide[field.key]}</Text>
              </View>
            ))
          )}
          <Text style={m.provenanceNote}>
            Thông tin tham khảo theo loài; không phải ngưỡng đo cảm biến hoặc cảnh báo tự động.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const m = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: {
    minHeight: 54,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DDE8E0',
  },
  backButton: { width: 28, height: 36, justifyContent: 'center' },
  back: { color: C.forest, fontSize: 29, lineHeight: 33 },
  headerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 },
  headerSpacer: { width: 28 },
  content: { padding: 14, gap: 10, paddingBottom: 28 },
  centerState: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  stateTitle: {
    color: C.forest,
    fontFamily: F.semiBold,
    fontSize: 15,
    textAlign: 'center',
  },
  bodyCenter: {
    color: C.secondaryText,
    fontFamily: F.regular,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  inlineBanner: {
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
  inlineBannerText: {
    flex: 1,
    color: '#991B1B',
    fontFamily: F.regular,
    fontSize: 11,
  },
  inlineRetryText: {
    color: '#991B1B',
    fontFamily: F.semiBold,
    fontSize: 11,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  generatedText: {
    flex: 1,
    color: C.mutedText,
    fontFamily: F.regular,
    fontSize: 10,
  },
  refreshBtn: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#E7EEE8',
  },
  refreshBtnText: {
    color: C.forest,
    fontFamily: F.semiBold,
    fontSize: 11,
  },
  disabled: {
    opacity: 0.55,
  },
  identityCard: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: C.surface,
    gap: 5,
  },
  title: {
    color: C.forest,
    fontFamily: F.bold,
    fontSize: 16,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  primaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: C.primary,
  },
  primaryBtnText: {
    color: C.surface,
    fontFamily: F.semiBold,
    fontSize: 11,
  },
  secondaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: '#E7EEE8',
  },
  secondaryBtnText: {
    color: C.forest,
    fontFamily: F.semiBold,
    fontSize: 11,
  },
  card: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: C.surface,
    gap: 8,
  },
  section: {
    color: C.forest,
    fontFamily: F.semiBold,
    fontSize: 13,
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tag: {
    overflow: 'hidden',
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 99,
    fontFamily: F.semiBold,
    fontSize: 10,
  },
  provenanceNote: {
    color: C.mutedText,
    fontFamily: F.regular,
    fontSize: 10,
    lineHeight: 15,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 7,
  },
  metricBox: {
    flex: 1,
    padding: 9,
    borderRadius: 10,
    backgroundColor: C.softSurface,
    gap: 2,
  },
  metricValue: {
    color: C.forest,
    fontFamily: F.bold,
    fontSize: 13,
  },
  overdueValue: {
    color: '#B42318',
  },
  metricLabel: {
    color: C.secondaryText,
    fontFamily: F.regular,
    fontSize: 10,
  },
  sensorBanner: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: C.softSurface,
    borderWidth: 1,
    borderColor: '#DDE8E0',
    gap: 3,
  },
  sensorTitle: {
    color: C.forest,
    fontFamily: F.semiBold,
    fontSize: 12,
  },
  chartWrap: {
    width: '100%',
    paddingVertical: 2,
  },
  counterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  counterBox: {
    width: '48%',
    padding: 8,
    borderRadius: 10,
    backgroundColor: C.softSurface,
    gap: 2,
  },
  counterValue: {
    color: C.forest,
    fontFamily: F.bold,
    fontSize: 14,
  },
  counterLabel: {
    color: C.secondaryText,
    fontFamily: F.regular,
    fontSize: 10,
    lineHeight: 14,
  },
  timelineItem: {
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E3EBE5',
    gap: 3,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  timelineTitle: {
    flex: 1,
    color: C.forest,
    fontFamily: F.semiBold,
    fontSize: 12,
  },
  metaText: {
    color: C.mutedText,
    fontFamily: F.regular,
    fontSize: 10,
  },
  body: {
    color: C.secondaryText,
    fontFamily: F.regular,
    fontSize: 11,
    lineHeight: 16,
  },
  guideRow: {
    paddingTop: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E3EBE5',
    gap: 2,
  },
  guideLabel: {
    color: C.forest,
    fontFamily: F.semiBold,
    fontSize: 11,
  },
  guideValue: {
    color: C.secondaryText,
    fontFamily: F.regular,
    fontSize: 11,
    lineHeight: 16,
  },
});
