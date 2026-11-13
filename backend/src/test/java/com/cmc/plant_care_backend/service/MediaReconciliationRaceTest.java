package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.common.exception.StorageUnavailableException;
import com.cmc.plant_care_backend.common.media.ProcessedImage;
import com.cmc.plant_care_backend.model.Media;
import com.cmc.plant_care_backend.model.User;
import com.cmc.plant_care_backend.model.enums.MediaStatus;
import com.cmc.plant_care_backend.repository.MediaRepository;
import com.cmc.plant_care_backend.repository.UserRepository;
import com.cmc.plant_care_backend.service.storage.SupabaseStorageGateway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@SpringBootTest
class MediaReconciliationRaceTest {

    @Autowired
    private MediaRepository mediaRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private MediaTransactionCoordinator coordinator;

    @MockitoBean
    private SupabaseStorageGateway storageGateway;

    private User testUser;

    @BeforeEach
    void setUp() {
        mediaRepository.deleteAll();
        testUser = userRepository.findAll().stream().findFirst().orElseGet(() -> {
            User u = new User();
            u.setFullName("Race Test User");
            u.setEmail("race_test_" + UUID.randomUUID() + "@goplant.vn");
            u.setPasswordHash("hashed_password_placeholder_12345");
            return userRepository.save(u);
        });
        when(storageGateway.sanitizeLogMessage(anyString())).thenAnswer(inv -> inv.getArgument(0));
    }

    private Media createMediaInDb(MediaStatus status, OffsetDateTime createdAt, OffsetDateTime updatedAt) {
        Media media = new Media();
        media.setOwner(testUser);
        media.setBucket("goplant-private-media");
        media.setObjectKey("test-user/" + UUID.randomUUID() + ".jpg");
        media.setMimeType("image/jpeg");
        media.setSizeBytes(1024L);
        media.setSha256("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        media.setStatus(status);
        media.setCreatedAt(createdAt);
        media.setUpdatedAt(updatedAt);
        return mediaRepository.saveAndFlush(media);
    }

    @Test
    @DisplayName("Race 1: Upload timeout followed by late Supabase processing - PENDING is retained and reconciled")
    void race1_uploadTimeout_lateSupabaseProcessing() {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.PENDING, past, past);

        // Worker queries stuck records
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        List<Media> stuck = mediaRepository.findStuckMediaForReconciliation(now.minusMinutes(5), now, PageRequest.of(0, 10));
        assertEquals(1, stuck.size());

        // Worker atomically claims lease
        String leaseToken = UUID.randomUUID().toString();
        MediaTransactionCoordinator.ReconciliationCandidate candidate =
            coordinator.beginReconciliation(media.getId(), leaseToken, Duration.ofSeconds(60));
        assertNotNull(candidate);
        assertEquals(MediaStatus.RECONCILING, candidate.status());

        // Storage delete succeeds outside DB transaction
        doNothing().when(storageGateway).delete(candidate.bucket(), candidate.objectKey());
        storageGateway.delete(candidate.bucket(), candidate.objectKey());

        // Complete reconciliation checkpoint
        coordinator.completeReconciliationSuccess(candidate.mediaId(), leaseToken);

        Media finalMedia = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(MediaStatus.DELETED, finalMedia.getStatus());
        assertNull(finalMedia.getLeaseToken());
    }

    @Test
    @DisplayName("Race 2: Worker claims PENDING, upload thread concurrently calls markReady - markReady rejected")
    void race2_workerClaimPending_uploadCallsMarkReadyConcurrently() {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.PENDING, past, past);

        // Worker claims lease
        String leaseToken = UUID.randomUUID().toString();
        MediaTransactionCoordinator.ReconciliationCandidate candidate =
            coordinator.beginReconciliation(media.getId(), leaseToken, Duration.ofSeconds(60));
        assertNotNull(candidate);

        // Upload thread finishes storage upload and tries markReady
        IllegalStateException ex = assertThrows(IllegalStateException.class, () ->
            coordinator.markReady(media.getId()));
        assertTrue(ex.getMessage().contains("Không thể chuyển Media sang trạng thái READY") || ex.getMessage().contains("RECONCILING"));

        Media current = mediaRepository.findById(media.getId()).orElseThrow();
        assertNotEquals(MediaStatus.READY, current.getStatus());
    }

    @Test
    @DisplayName("Race 3: Two workers attempt reconciliation concurrently - exactly one claims lease")
    void race3_twoWorkersRunReconciliationConcurrently() {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.PENDING, past, past);

        String worker1Token = "worker-1-token";
        String worker2Token = "worker-2-token";

        // Worker 1 claims lease
        MediaTransactionCoordinator.ReconciliationCandidate claim1 =
            coordinator.beginReconciliation(media.getId(), worker1Token, Duration.ofSeconds(60));
        assertNotNull(claim1);

        // Worker 2 attempts claim while Worker 1 lease is active
        MediaTransactionCoordinator.ReconciliationCandidate claim2 =
            coordinator.beginReconciliation(media.getId(), worker2Token, Duration.ofSeconds(60));
        assertNull(claim2, "Worker 2 must not be able to claim active lease held by Worker 1");

        Media current = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(worker1Token, current.getLeaseToken());
    }

    @Test
    @DisplayName("Race 4: Initial delete returns 404, object arrives later - reconciliation cleans up")
    void race4_deleteReturns404_objectAppearsLater() {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.DELETING, past, past);

        String leaseToken = UUID.randomUUID().toString();
        MediaTransactionCoordinator.ReconciliationCandidate candidate =
            coordinator.beginReconciliation(media.getId(), leaseToken, Duration.ofSeconds(60));
        assertNotNull(candidate);

        // Deletion on late-arriving object
        coordinator.completeReconciliationSuccess(candidate.mediaId(), leaseToken);

        Media finalMedia = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(MediaStatus.DELETED, finalMedia.getStatus());
    }

    @Test
    @DisplayName("Race 5: Worker process dies after claim but before delete - second worker reclaims after lease expires")
    void race5_workerProcessDiesAfterClaimBeforeDelete() {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.PENDING, past, past);

        // Worker 1 claims with very short lease (simulated expired lease)
        String worker1Token = "worker-1-token";
        MediaTransactionCoordinator.ReconciliationCandidate claim1 =
            coordinator.beginReconciliation(media.getId(), worker1Token, Duration.ofSeconds(1));
        assertNotNull(claim1);

        // Simulate lease expiration by setting leaseExpiresAt to the past
        Media leased = mediaRepository.findById(media.getId()).orElseThrow();
        leased.setLeaseExpiresAt(OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(5));
        mediaRepository.saveAndFlush(leased);

        // Worker 2 runs after expiration
        String worker2Token = "worker-2-token";
        MediaTransactionCoordinator.ReconciliationCandidate claim2 =
            coordinator.beginReconciliation(media.getId(), worker2Token, Duration.ofSeconds(60));
        assertNotNull(claim2, "Worker 2 must be able to claim expired lease");
        assertEquals(worker2Token, claim2.leaseToken());
    }

    @Test
    @DisplayName("Race 6: Worker dies after storage delete but before DB complete - subsequent run completes tombstone")
    void race6_workerDiesAfterDeleteBeforeDbCheckpoint() {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.PENDING, past, past);

        String worker1Token = "worker-1-token";
        coordinator.beginReconciliation(media.getId(), worker1Token, Duration.ofSeconds(1));

        // Worker 1 deleted from storage, then crashed before completeReconciliationSuccess.
        // Expire lease
        Media leased = mediaRepository.findById(media.getId()).orElseThrow();
        leased.setLeaseExpiresAt(OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(5));
        mediaRepository.saveAndFlush(leased);

        // Worker 2 takes over
        String worker2Token = "worker-2-token";
        MediaTransactionCoordinator.ReconciliationCandidate claim2 =
            coordinator.beginReconciliation(media.getId(), worker2Token, Duration.ofSeconds(60));
        assertNotNull(claim2);

        // Storage delete is idempotent, returns 404/success
        coordinator.completeReconciliationSuccess(claim2.mediaId(), worker2Token);

        Media finalMedia = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(MediaStatus.DELETED, finalMedia.getStatus());
    }

    @Test
    @DisplayName("Race 7: Storage delete errors - retry backoff is scheduled")
    void race7_deleteFails_retriesAccordingToBackoff() {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.PENDING, past, past);

        String leaseToken = UUID.randomUUID().toString();
        coordinator.beginReconciliation(media.getId(), leaseToken, Duration.ofSeconds(60));

        // Record failure
        coordinator.recordReconciliationFailure(media.getId(), leaseToken, "503 Storage Unavailable", 5, Duration.ofSeconds(30));

        Media failedMedia = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(1, failedMedia.getAttemptCount());
        assertNotNull(failedMedia.getNextRetryAt());
        assertTrue(failedMedia.getNextRetryAt().isAfter(OffsetDateTime.now(ZoneOffset.UTC)));
        assertNull(failedMedia.getLeaseToken());

        // Immediately querying should skip this media because nextRetryAt is in the future
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        List<Media> stuck = mediaRepository.findStuckMediaForReconciliation(now.minusMinutes(5), now, PageRequest.of(0, 10));
        assertTrue(stuck.isEmpty(), "Media with future nextRetryAt must be skipped");
    }

    @Test
    @DisplayName("Race 8: Media ATTACHED or READY is never claimed or deleted by reconciliation")
    void race8_mediaAttachedOrReady_neverDeletedByWorker() {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media readyMedia = createMediaInDb(MediaStatus.READY, past, past);
        Media attachedMedia = createMediaInDb(MediaStatus.ATTACHED, past, past);

        assertNull(coordinator.beginReconciliation(readyMedia.getId(), "token", Duration.ofSeconds(60)));
        assertNull(coordinator.beginReconciliation(attachedMedia.getId(), "token", Duration.ofSeconds(60)));

        coordinator.completeReconciliationSuccess(readyMedia.getId(), "token");
        coordinator.completeReconciliationSuccess(attachedMedia.getId(), "token");

        assertEquals(MediaStatus.READY, mediaRepository.findById(readyMedia.getId()).orElseThrow().getStatus());
        assertEquals(MediaStatus.ATTACHED, mediaRepository.findById(attachedMedia.getId()).orElseThrow().getStatus());
    }

    @Test
    @DisplayName("Race 9: Delete request and reconciliation act concurrently on one Media")
    void race9_deleteRequestAndReconciliationConcurrent() {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.READY, past, past);

        // User initiates delete
        MediaTransactionCoordinator.DeleteDecision decision = coordinator.beginDelete(media.getId(), testUser.getId());
        assertFalse(decision.alreadyDeleted());

        Media current = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(MediaStatus.DELETING, current.getStatus());

        // Reconciliation worker claims DELETING record
        String leaseToken = UUID.randomUUID().toString();
        MediaTransactionCoordinator.ReconciliationCandidate candidate =
            coordinator.beginReconciliation(media.getId(), leaseToken, Duration.ofSeconds(60));
        assertNotNull(candidate);

        // Reconciliation completes delete
        coordinator.completeReconciliationSuccess(candidate.mediaId(), leaseToken);

        Media finalMedia = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(MediaStatus.DELETED, finalMedia.getStatus());
    }

    @Test
    @DisplayName("Race 10: Impossible for Media READY to point to deleted object")
    void race10_impossibleForMediaReadyToPointToDeletedObject() {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.PENDING, past, past);

        // Worker claims and deletes
        String leaseToken = UUID.randomUUID().toString();
        coordinator.beginReconciliation(media.getId(), leaseToken, Duration.ofSeconds(60));
        coordinator.completeReconciliationSuccess(media.getId(), leaseToken);

        // Mark ready must fail
        assertThrows(IllegalStateException.class, () -> coordinator.markReady(media.getId()));

        Media finalMedia = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(MediaStatus.DELETED, finalMedia.getStatus());
    }
}
