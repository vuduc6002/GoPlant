import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Rect } from 'react-native-svg';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { formatIsoDateTimeVn } from '@/features/carelog/careLogApi';
import { getHealthStatusMeta } from '@/features/gardens/gardenTypes';
import {
  MONITORING_CARE_LOG_PROVENANCE_NOTE,
  MONITORING_DEFAULT_HEALTHY_NOTE,
  MONITORING_PROFILE_HEALTH_LABEL,
  MONITORING_SENSOR_DISCONNECTED_TEXT,
  type MonitoringOverviewDto,
} from './monitoringTypes';

interface MonitoringOverviewContentProps {
  data?: MonitoringOverviewDto;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry: () => void;
}

const CHART_WIDTH = 280;
const CHART_HEIGHT = 16;

function HealthDistributionBar({
  healthyCount,
  needsAttentionCount,
  criticalCount,
  unknownCount,
}: {
  healthyCount: number;
  needsAttentionCount: number;
  criticalCount: number;
  unknownCount: number;
}) {
  const total = healthyCount + needsAttentionCount + criticalCount + unknownCount;
  if (total <= 0) {
    return null;
  }

  const segments = [
    { key: 'healthy', count: healthyCount, color: '#2F8F5B' },
    { key: 'needsAttention', count: needsAttentionCount, color: '#E07A38' },
    { key: 'critical', count: criticalCount, color: '#D14343' },
    { key: 'unknown', count: unknownCount, color: '#94A39B' },
  ].filter((seg) => seg.count > 0);

  let currentX = 0;
  return (
    <View style={m.chartWrap}>
      <Svg
        width="100%"
        height={CHART_HEIGHT}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        accessibilityLabel={`Phân bố trạng thái hồ sơ cây: ${healthyCount} khỏe mạnh, ${needsAttentionCount} cần chú ý, ${criticalCount} nguy cấp, ${unknownCount} chưa đánh giá`}
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

function getToneTagStyles(tone: 'mint' | 'peach' | 'danger' | 'plain') {
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

export function MonitoringOverviewContent({
  data,
  isLoading,
  isFetching,
  isError,
  errorMessage,
  onRetry,
}: MonitoringOverviewContentProps) {
  if (isLoading || (!data && !isError)) {
    return (
      <View style={m.centerState} accessibilityLabel="Đang tải tổng quan theo dõi">
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={m.bodyCenter}>Đang tải dữ liệu tổng quan theo dõi...</Text>
      </View>
    );
  }

  if (isError && !data) {
    return (
      <View style={m.errorCard} accessibilityRole="alert">
        <Text style={m.errorTitle}>Không thể tải tổng quan theo dõi</Text>
        <Text style={m.body}>{errorMessage || 'Vui lòng kiểm tra kết nối và thử lại.'}</Text>
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Thử lại tải tổng quan theo dõi"
          style={m.retryBtn}
        >
          <Text style={m.retryBtnText}>Thử lại</Text>
        </Pressable>
      </View>
    );
  }

  if (!data) {
    return null;
  }

  const isEmpty = data.gardensCount === 0 && data.plantsCount === 0;
  const generatedLabel = data.generatedAt
    ? formatIsoDateTimeVn(data.generatedAt, '')
    : '';

  return (
    <View style={m.container}>
      {isError ? (
        <View style={m.inlineBanner} accessibilityRole="alert">
          <Text style={m.inlineBannerText}>
            {errorMessage || 'Không thể làm mới dữ liệu theo dõi.'}
          </Text>
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="Thử lại làm mới"
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
          onPress={onRetry}
          disabled={isFetching}
          accessibilityRole="button"
          accessibilityLabel="Làm mới tổng quan theo dõi"
          accessibilityState={{ disabled: isFetching }}
          style={[m.refreshBtn, isFetching && m.disabled]}
        >
          <Text style={m.refreshBtnText}>{isFetching ? 'Đang tải...' : 'Làm mới'}</Text>
        </Pressable>
      </View>

      <View style={m.metrics}>
        <View style={m.metric}>
          <Text style={m.metricValue}>{data.gardensCount}</Text>
          <Text style={m.metricLabel}>Khu vườn</Text>
        </View>
        <View style={m.metric}>
          <Text style={m.metricValue}>{data.plantsCount}</Text>
          <Text style={m.metricLabel}>Cây trồng</Text>
        </View>
        <View style={m.metric}>
          <Text style={m.metricValue}>{data.schedulesSummary.dueTodayCount}</Text>
          <Text style={m.metricLabel}>Đến hạn còn lại hôm nay</Text>
        </View>
        <View style={m.metric}>
          <Text
            style={[
              m.metricValue,
              data.schedulesSummary.overdueCount > 0 && m.overdueValue,
            ]}
          >
            {data.schedulesSummary.overdueCount}
          </Text>
          <Text style={m.metricLabel}>Đang quá hạn</Text>
        </View>
      </View>

      <View style={m.sensorBanner}>
        <Text style={m.sensorTitle}>
          {data.sensorConnected
            ? 'Cảm biến IoT đã kết nối'
            : MONITORING_SENSOR_DISCONNECTED_TEXT}
        </Text>
        <Text style={m.body}>
          Chưa có thiết bị đo độ ẩm, ánh sáng hoặc nhiệt độ gắn kết; các số liệu dưới đây tổng hợp trực tiếp từ hồ sơ cây, lịch và nhật ký thật.
        </Text>
      </View>

      {isEmpty ? (
        <View style={m.emptyGroup}>
          <View style={m.emptyCard}>
            <Text style={m.cardTitle}>Chưa có khu vườn để theo dõi</Text>
            <Text style={m.bodyCenter}>
              Tạo khu vườn đầu tiên và thêm cây trồng để theo dõi tình trạng hồ sơ, lịch chăm sóc và nhật ký.
            </Text>
            <View style={m.emptyActions}>
              <Pressable
                onPress={() => router.push('/garden/create' as never)}
                accessibilityRole="button"
                accessibilityLabel="Tạo khu vườn"
                style={m.primaryBtn}
              >
                <Text style={m.primaryBtnText}>Tạo khu vườn</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/garden/add-plant' as never)}
                accessibilityRole="button"
                accessibilityLabel="Thêm cây"
                style={m.secondaryBtn}
              >
                <Text style={m.secondaryBtnText}>Thêm cây</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : (
        <>
          <View style={m.card}>
            <View style={m.cardHeader}>
              <Text style={m.sectionTitle}>{MONITORING_PROFILE_HEALTH_LABEL}</Text>
              <Text style={m.hint}>{data.plantsCount} cây</Text>
            </View>
            <HealthDistributionBar
              healthyCount={data.healthDistribution.healthyCount}
              needsAttentionCount={data.healthDistribution.needsAttentionCount}
              criticalCount={data.healthDistribution.criticalCount}
              unknownCount={data.healthDistribution.unknownCount}
            />
            <View style={m.distGrid}>
              <View style={m.distItem}>
                <Text style={m.distCount}>{data.healthDistribution.healthyCount}</Text>
                <Text style={m.distLabel}>Khỏe mạnh</Text>
              </View>
              <View style={m.distItem}>
                <Text style={m.distCount}>{data.healthDistribution.needsAttentionCount}</Text>
                <Text style={m.distLabel}>Cần chú ý</Text>
              </View>
              <View style={m.distItem}>
                <Text style={m.distCount}>{data.healthDistribution.criticalCount}</Text>
                <Text style={m.distLabel}>Nguy cấp</Text>
              </View>
              <View style={m.distItem}>
                <Text style={m.distCount}>{data.healthDistribution.unknownCount}</Text>
                <Text style={m.distLabel}>Chưa đánh giá</Text>
              </View>
            </View>
            <Text style={m.provenanceNote}>{MONITORING_DEFAULT_HEALTHY_NOTE}</Text>
          </View>

          <View style={m.card}>
            <View style={m.cardHeader}>
              <Text style={m.sectionTitle}>Lịch chăm sóc đang bật</Text>
              <Text style={m.hint}>Múi giờ Asia/Ho_Chi_Minh</Text>
            </View>
            <Text style={m.body}>
              Tổng {data.schedulesSummary.activeCount} lịch đang kích hoạt •{' '}
              {data.schedulesSummary.dueTodayCount} đến hạn còn lại hôm nay •{' '}
              {data.schedulesSummary.overdueCount} đang quá hạn
            </Text>
          </View>

          <View style={m.card}>
            <Text style={m.sectionTitle}>Lượt chăm sóc đã ghi nhận</Text>

            <View style={m.windowBlock}>
              <Text style={m.windowHeading}>7 ngày gần nhất</Text>
              <View style={m.counterGrid}>
                <View style={m.counterBox}>
                  <Text style={m.counterValue}>
                    {data.careLogsSummary7d.unlinkedCompletedLogs}
                  </Text>
                  <Text style={m.counterLabel}>Không/chưa gắn lịch • Hoàn thành (7d)</Text>
                </View>
                <View style={m.counterBox}>
                  <Text style={m.counterValue}>
                    {data.careLogsSummary7d.unlinkedSkippedLogs}
                  </Text>
                  <Text style={m.counterLabel}>Không/chưa gắn lịch • Bỏ qua (7d)</Text>
                </View>
                <View style={m.counterBox}>
                  <Text style={m.counterValue}>
                    {data.careLogsSummary7d.linkedScheduledCompletedLogs}
                  </Text>
                  <Text style={m.counterLabel}>Theo lịch hiện còn • Hoàn thành (7d)</Text>
                </View>
                <View style={m.counterBox}>
                  <Text style={m.counterValue}>
                    {data.careLogsSummary7d.linkedScheduledSkippedLogs}
                  </Text>
                  <Text style={m.counterLabel}>Theo lịch hiện còn • Bỏ qua (7d)</Text>
                </View>
              </View>
            </View>

            <View style={m.windowBlock}>
              <Text style={m.windowHeading}>30 ngày gần nhất</Text>
              <View style={m.counterGrid}>
                <View style={m.counterBox}>
                  <Text style={m.counterValue}>
                    {data.careLogsSummary30d.unlinkedCompletedLogs}
                  </Text>
                  <Text style={m.counterLabel}>Không/chưa gắn lịch • Hoàn thành (30d)</Text>
                </View>
                <View style={m.counterBox}>
                  <Text style={m.counterValue}>
                    {data.careLogsSummary30d.unlinkedSkippedLogs}
                  </Text>
                  <Text style={m.counterLabel}>Không/chưa gắn lịch • Bỏ qua (30d)</Text>
                </View>
                <View style={m.counterBox}>
                  <Text style={m.counterValue}>
                    {data.careLogsSummary30d.linkedScheduledCompletedLogs}
                  </Text>
                  <Text style={m.counterLabel}>Theo lịch hiện còn • Hoàn thành (30d)</Text>
                </View>
                <View style={m.counterBox}>
                  <Text style={m.counterValue}>
                    {data.careLogsSummary30d.linkedScheduledSkippedLogs}
                  </Text>
                  <Text style={m.counterLabel}>Theo lịch hiện còn • Bỏ qua (30d)</Text>
                </View>
              </View>
            </View>

            <Text style={m.provenanceNote}>{MONITORING_CARE_LOG_PROVENANCE_NOTE}</Text>
          </View>

          <View style={m.section}>
            <View style={m.cardHeader}>
              <Text style={m.sectionTitle}>Cây cần chú ý</Text>
              <Text style={m.hint}>Tối đa 10 cây</Text>
            </View>
            {data.attentionPlants.length === 0 ? (
              <View style={m.card}>
                <Text style={m.body}>
                  Hiện chưa có cây nào được đánh dấu Cần chú ý hoặc Nguy cấp trong hồ sơ cây.
                </Text>
              </View>
            ) : (
              data.attentionPlants.map((plant) => {
                const statusMeta = getHealthStatusMeta(plant.healthStatus);
                const toneStyle = getToneTagStyles(statusMeta.tone);
                return (
                  <Pressable
                    key={plant.plantId}
                    onPress={() =>
                      router.push({
                        pathname: '/monitoring/detail',
                        params: { plantId: plant.plantId },
                      } as never)
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Xem chi tiết theo dõi ${plant.displayName}`}
                    style={m.listCard}
                  >
                    <View style={m.listCardCopy}>
                      <Text style={m.cardTitle}>{plant.displayName}</Text>
                      <Text style={m.body}>
                        {[plant.speciesName, plant.gardenName].filter(Boolean).join(' • ') ||
                          'Hồ sơ cây'}
                      </Text>
                    </View>
                    <Text
                      style={[
                        m.tag,
                        { backgroundColor: toneStyle.bg, color: toneStyle.text },
                      ]}
                    >
                      {statusMeta.label}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </View>

          <View style={m.section}>
            <View style={m.cardHeader}>
              <Text style={m.sectionTitle}>Tóm tắt theo khu vườn</Text>
              <Text style={m.hint}>{data.gardensSummary.length} vườn</Text>
            </View>
            {data.gardensSummary.length === 0 ? (
              <View style={m.card}>
                <Text style={m.body}>Chưa có khu vườn nào được tạo.</Text>
              </View>
            ) : (
              data.gardensSummary.map((garden) => (
                <Pressable
                  key={garden.gardenId}
                  onPress={() =>
                    router.push({
                      pathname: '/garden-detail',
                      params: { gardenId: garden.gardenId },
                    } as never)
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Mở khu vườn ${garden.name}`}
                  style={m.listCard}
                >
                  <View style={m.listCardCopy}>
                    <Text style={m.cardTitle}>{garden.name}</Text>
                    <Text style={m.body}>
                      {garden.plantCount} cây trồng • {garden.attentionCount} cây cần chú ý
                    </Text>
                  </View>
                  <Text style={m.chevron}>›</Text>
                </Pressable>
              ))
            )}
          </View>
        </>
      )}
    </View>
  );
}

const m = StyleSheet.create({
  container: { gap: 10 },
  centerState: {
    padding: 20,
    borderRadius: 14,
    backgroundColor: C.surface,
    alignItems: 'center',
    gap: 8,
  },
  bodyCenter: {
    color: C.secondaryText,
    fontFamily: F.regular,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },
  errorCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: '#F5C2C0',
    gap: 8,
    alignItems: 'flex-start',
  },
  errorTitle: {
    color: '#991B1B',
    fontFamily: F.semiBold,
    fontSize: 13,
  },
  retryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: C.primary,
  },
  retryBtnText: {
    color: C.surface,
    fontFamily: F.semiBold,
    fontSize: 11,
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
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  metric: {
    width: '48%',
    minHeight: 54,
    padding: 10,
    borderRadius: 12,
    backgroundColor: C.surface,
    gap: 2,
  },
  metricValue: {
    color: C.forest,
    fontFamily: F.bold,
    fontSize: 16,
  },
  overdueValue: {
    color: '#B42318',
  },
  metricLabel: {
    color: C.secondaryText,
    fontFamily: F.regular,
    fontSize: 11,
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
  emptyGroup: {
    gap: 8,
  },
  emptyCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: C.surface,
    alignItems: 'center',
    gap: 8,
  },
  emptyActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  primaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: C.primary,
  },
  primaryBtnText: {
    color: C.surface,
    fontFamily: F.semiBold,
    fontSize: 11,
  },
  secondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: '#E7EEE8',
  },
  secondaryBtnText: {
    color: C.forest,
    fontFamily: F.semiBold,
    fontSize: 11,
  },
  card: {
    padding: 11,
    borderRadius: 14,
    backgroundColor: C.surface,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  section: {
    gap: 7,
    marginTop: 2,
  },
  sectionTitle: {
    color: C.forest,
    fontFamily: F.semiBold,
    fontSize: 14,
  },
  hint: {
    color: C.mutedText,
    fontFamily: F.regular,
    fontSize: 10,
  },
  chartWrap: {
    width: '100%',
    paddingVertical: 2,
  },
  distGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  distItem: {
    width: '48%',
    padding: 8,
    borderRadius: 10,
    backgroundColor: C.softSurface,
    gap: 2,
  },
  distCount: {
    color: C.forest,
    fontFamily: F.bold,
    fontSize: 14,
  },
  distLabel: {
    color: C.secondaryText,
    fontFamily: F.regular,
    fontSize: 10,
  },
  provenanceNote: {
    color: C.mutedText,
    fontFamily: F.regular,
    fontSize: 10,
    lineHeight: 15,
  },
  windowBlock: {
    gap: 5,
    paddingTop: 2,
  },
  windowHeading: {
    color: C.forest,
    fontFamily: F.semiBold,
    fontSize: 12,
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
  listCard: {
    padding: 11,
    borderRadius: 14,
    backgroundColor: C.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  listCardCopy: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    color: C.forest,
    fontFamily: F.semiBold,
    fontSize: 13,
  },
  body: {
    color: C.secondaryText,
    fontFamily: F.regular,
    fontSize: 11,
    lineHeight: 16,
  },
  tag: {
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 99,
    fontFamily: F.semiBold,
    fontSize: 10,
  },
  chevron: {
    color: C.forest,
    fontSize: 20,
    fontFamily: F.semiBold,
    paddingHorizontal: 4,
  },
});
