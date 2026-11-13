package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.model.Media;
import com.cmc.plant_care_backend.repository.MediaRepository;
import com.cmc.plant_care_backend.service.storage.SupabaseStorageGateway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

@Service
public class MediaReconciliationService {

    private static final Logger log = LoggerFactory.getLogger(MediaReconciliationService.class);
    public static final Duration DEFAULT_SAFETY_WINDOW = Duration.ofMinutes(5);

    private final MediaRepository mediaRepository;
    private final MediaTransactionCoordinator coordinator;
    private final SupabaseStorageGateway storageGateway;

    private final int batchSize;
    private final long safetyWindowSeconds;
    private final long leaseDurationSeconds;
    private final int maxAttempts;
    private final long baseBackoffSeconds;

    public MediaReconciliationService(
        MediaRepository mediaRepository,
        MediaTransactionCoordinator coordinator,
        SupabaseStorageGateway storageGateway
    ) {
        this(mediaRepository, coordinator, storageGateway, 50, 300, 60, 5, 30);
    }

    @Autowired
    public MediaReconciliationService(
        MediaRepository mediaRepository,
        MediaTransactionCoordinator coordinator,
        SupabaseStorageGateway storageGateway,
        @Value("${media.reconciliation.batch-size:50}") int batchSize,
        @Value("${media.reconciliation.safety-window-seconds:300}") long safetyWindowSeconds,
        @Value("${media.reconciliation.lease-duration-seconds:60}") long leaseDurationSeconds,
        @Value("${media.reconciliation.max-attempts:5}") int maxAttempts,
        @Value("${media.reconciliation.base-backoff-seconds:30}") long baseBackoffSeconds
    ) {
        this.mediaRepository = mediaRepository;
        this.coordinator = coordinator;
        this.storageGateway = storageGateway;
        this.batchSize = batchSize > 0 ? batchSize : 50;
        this.safetyWindowSeconds = safetyWindowSeconds > 0 ? safetyWindowSeconds : 300;
        this.leaseDurationSeconds = leaseDurationSeconds > 0 ? leaseDurationSeconds : 60;
        this.maxAttempts = maxAttempts > 0 ? maxAttempts : 5;
        this.baseBackoffSeconds = baseBackoffSeconds > 0 ? baseBackoffSeconds : 30;
    }

    public int reconcileStuckMedia(Duration safetyWindow) {
        Duration window = (safetyWindow != null) ? safetyWindow : Duration.ofSeconds(safetyWindowSeconds);
        Duration leaseDuration = Duration.ofSeconds(leaseDurationSeconds);
        Duration baseBackoff = Duration.ofSeconds(baseBackoffSeconds);

        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        OffsetDateTime cutoff = now.minus(window);

        Pageable pageable = PageRequest.of(0, batchSize);
        List<Media> stuckList = mediaRepository.findStuckMediaForReconciliation(cutoff, now, pageable);
        if (stuckList.isEmpty()) {
            return 0;
        }

        log.info("Found {} stuck media records eligible for reconciliation", stuckList.size());
        String leaseToken = UUID.randomUUID().toString();

        int reconciledCount = 0;
        int retriedCount = 0;
        int errorCount = 0;

        for (Media summary : stuckList) {
            try {
                // Short transaction #1: Atomically claim reconciliation lease
                MediaTransactionCoordinator.ReconciliationCandidate candidate =
                    coordinator.beginReconciliation(summary.getId(), leaseToken, leaseDuration);
                if (candidate == null) {
                    continue; // Skip if candidate is protected (READY/ATTACHED/already DELETED) or leased by another worker
                }

                // Supabase Storage HTTP cleanup OUTSIDE database transaction
                try {
                    storageGateway.delete(candidate.bucket(), candidate.objectKey());
                } catch (Exception storageEx) {
                    log.warn("Storage delete failed for candidate [{}/{}] during reconciliation: {}",
                        candidate.bucket(), candidate.objectKey(), storageGateway.sanitizeLogMessage(storageEx.getMessage()));
                    coordinator.recordReconciliationFailure(candidate.mediaId(), leaseToken, storageEx.getMessage(), maxAttempts, baseBackoff);
                    retriedCount++;
                    continue; // Skip completing, next item
                }

                // Short transaction #2: Mark DELETED tombstone and clear lease
                coordinator.completeReconciliationSuccess(candidate.mediaId(), leaseToken);
                reconciledCount++;
                log.info("Successfully reconciled stuck media [{}] (former status: {})", candidate.mediaId(), candidate.status());
            } catch (Exception ex) {
                errorCount++;
                log.error("Unexpected error during reconciliation of media [{}]: {}", summary.getId(), storageGateway.sanitizeLogMessage(ex.getMessage()));
            }
        }

        log.info("Reconciliation cycle finished: {} processed, {} succeeded, {} retried, {} errors",
            stuckList.size(), reconciledCount, retriedCount, errorCount);
        return reconciledCount;
    }

    @Scheduled(
        fixedDelayString = "${media.reconciliation.fixed-delay-ms:900000}",
        initialDelayString = "${media.reconciliation.initial-delay-ms:60000}"
    )
    public void scheduledReconcile() {
        try {
            int count = reconcileStuckMedia(Duration.ofSeconds(safetyWindowSeconds));
            if (count > 0) {
                log.info("Scheduled media reconciliation completed: {} stuck items reconciled.", count);
            }
        } catch (Exception ex) {
            log.error("Scheduled media reconciliation encountered an error: {}", storageGateway.sanitizeLogMessage(ex.getMessage()));
        }
    }
}
