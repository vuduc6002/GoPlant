package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.model.Media;
import com.cmc.plant_care_backend.repository.MediaRepository;
import com.cmc.plant_care_backend.service.storage.SupabaseStorageGateway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

@Service
public class MediaReconciliationService {

    private static final Logger log = LoggerFactory.getLogger(MediaReconciliationService.class);
    public static final Duration DEFAULT_SAFETY_WINDOW = Duration.ofMinutes(5);

    private final MediaRepository mediaRepository;
    private final MediaTransactionCoordinator coordinator;
    private final SupabaseStorageGateway storageGateway;

    public MediaReconciliationService(
        MediaRepository mediaRepository,
        MediaTransactionCoordinator coordinator,
        SupabaseStorageGateway storageGateway
    ) {
        this.mediaRepository = mediaRepository;
        this.coordinator = coordinator;
        this.storageGateway = storageGateway;
    }

    public int reconcileStuckMedia(Duration safetyWindow) {
        Duration window = (safetyWindow != null) ? safetyWindow : DEFAULT_SAFETY_WINDOW;
        OffsetDateTime cutoff = OffsetDateTime.now(ZoneOffset.UTC).minus(window);

        List<Media> stuckList = mediaRepository.findStuckMediaForReconciliation(cutoff);
        if (stuckList.isEmpty()) {
            return 0;
        }

        int reconciledCount = 0;
        for (Media summary : stuckList) {
            try {
                // Short transaction #1: Lock and verify candidate eligibility
                MediaTransactionCoordinator.ReconciliationCandidate candidate = coordinator.beginReconciliation(summary.getId());
                if (candidate == null) {
                    continue; // Skip if status changed or candidate is protected (READY/ATTACHED/already DELETED)
                }

                // Supabase Storage HTTP cleanup OUTSIDE database transaction
                try {
                    storageGateway.delete(candidate.bucket(), candidate.objectKey());
                } catch (Exception storageEx) {
                    log.error("Failed to delete orphaned object [{}/{}] from storage during reconciliation: {}",
                        candidate.bucket(), candidate.objectKey(), storageEx.getMessage());
                    // Skip completing reconciliation this cycle, leaving candidate for retry on next run
                    continue;
                }

                // Short transaction #2: Mark DELETED tombstone
                coordinator.completeReconciliation(candidate.mediaId());
                reconciledCount++;
                log.info("Successfully reconciled stuck media [{}] (former status: {})", candidate.mediaId(), candidate.status());
            } catch (Exception ex) {
                log.error("Error during reconciliation of media [{}]: {}", summary.getId(), ex.getMessage());
            }
        }

        return reconciledCount;
    }

    @Scheduled(
        fixedDelayString = "${media.reconciliation.fixed-delay-ms:900000}",
        initialDelayString = "${media.reconciliation.initial-delay-ms:60000}"
    )
    public void scheduledReconcile() {
        try {
            int count = reconcileStuckMedia(DEFAULT_SAFETY_WINDOW);
            if (count > 0) {
                log.info("Media reconciliation completed: {} stuck items reconciled.", count);
            }
        } catch (Exception ex) {
            log.error("Scheduled media reconciliation encountered an error: {}", ex.getMessage());
        }
    }
}
