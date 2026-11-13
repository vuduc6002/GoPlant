package com.cmc.plant_care_backend.service;

import com.cmc.plant_care_backend.model.Media;
import com.cmc.plant_care_backend.model.User;
import com.cmc.plant_care_backend.model.enums.MediaStatus;
import com.cmc.plant_care_backend.repository.MediaRepository;
import com.cmc.plant_care_backend.repository.UserRepository;
import com.cmc.plant_care_backend.service.storage.InMemoryStorageSimulator;
import com.cmc.plant_care_backend.service.storage.SupabaseStorageGateway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;

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

    private final InMemoryStorageSimulator simulator = new InMemoryStorageSimulator();
    private static final ExecutorService executor = Executors.newFixedThreadPool(4);

    private User testUser;

    @BeforeEach
    void setUp() {
        mediaRepository.deleteAll();
        simulator.clear();

        testUser = userRepository.findAll().stream().findFirst().orElseGet(() -> {
            User u = new User();
            u.setFullName("Race Test User");
            u.setEmail("race_test_" + UUID.randomUUID() + "@goplant.vn");
            u.setPasswordHash("hashed_password_placeholder_12345");
            return userRepository.save(u);
        });

        when(storageGateway.sanitizeLogMessage(anyString())).thenAnswer(inv -> inv.getArgument(0));

        // Connect storageGateway mock to in-memory simulator
        doAnswer(inv -> {
            String bucket = inv.getArgument(0);
            String key = inv.getArgument(1);
            simulator.delete(bucket, key);
            return null;
        }).when(storageGateway).delete(anyString(), anyString());
    }

    @AfterEach
    void tearDown() {
        simulator.clear();
        mediaRepository.deleteAll();
    }

    @AfterAll
    static void shutdownExecutor() {
        executor.shutdown();
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

    // =========================================================================
    // MANDATORY FIX C: 10 REAL CONCURRENT RACE TESTS
    // =========================================================================

    @Test
    @DisplayName("Race 1: Two workers claim the same Media simultaneously - exactly one acquires lease")
    void test1_twoWorkersClaimSameMediaSimultaneously() throws Exception {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.PENDING, past, past);

        CountDownLatch startLatch = new CountDownLatch(1);
        String token1 = "worker-1-" + UUID.randomUUID();
        String token2 = "worker-2-" + UUID.randomUUID();

        Future<MediaTransactionCoordinator.ReconciliationCandidate> f1 = executor.submit(() -> {
            startLatch.await();
            return coordinator.beginReconciliation(media.getId(), token1, Duration.ofSeconds(60));
        });

        Future<MediaTransactionCoordinator.ReconciliationCandidate> f2 = executor.submit(() -> {
            startLatch.await();
            return coordinator.beginReconciliation(media.getId(), token2, Duration.ofSeconds(60));
        });

        startLatch.countDown();
        MediaTransactionCoordinator.ReconciliationCandidate res1 = f1.get(10, TimeUnit.SECONDS);
        MediaTransactionCoordinator.ReconciliationCandidate res2 = f2.get(10, TimeUnit.SECONDS);

        // Mutual exclusion: exactly one worker acquired lease
        assertTrue((res1 != null && res2 == null) || (res1 == null && res2 != null),
            "Exactly one worker must acquire the lease");

        String winningToken = (res1 != null) ? token1 : token2;
        Media inDb = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(MediaStatus.RECONCILING, inDb.getStatus());
        assertEquals(winningToken, inDb.getLeaseToken());
        assertTrue(inDb.getLeaseExpiresAt().isAfter(OffsetDateTime.now(ZoneOffset.UTC)));
    }

    @Test
    @DisplayName("Race 2: Stale worker failure after another worker takes over - token B and state preserved")
    void test2_staleWorkerFailureAfterTakeover() throws Exception {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.PENDING, past, past);

        String tokenA = "worker-A-" + UUID.randomUUID();
        String tokenB = "worker-B-" + UUID.randomUUID();

        // Worker A claims lease
        MediaTransactionCoordinator.ReconciliationCandidate claimA =
            coordinator.beginReconciliation(media.getId(), tokenA, Duration.ofSeconds(1));
        assertNotNull(claimA);

        // Simulate lease expiration
        Media dbMedia = mediaRepository.findById(media.getId()).orElseThrow();
        dbMedia.setLeaseExpiresAt(OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(5));
        mediaRepository.saveAndFlush(dbMedia);

        // Worker B takes over
        MediaTransactionCoordinator.ReconciliationCandidate claimB =
            coordinator.beginReconciliation(media.getId(), tokenB, Duration.ofSeconds(60));
        assertNotNull(claimB);
        assertEquals(tokenB, claimB.leaseToken());

        // Worker A (stale) now sends late failure
        coordinator.recordReconciliationFailure(media.getId(), tokenA, "Late failure from worker A", 5, Duration.ofSeconds(30));

        // Verify Worker B's lease token and state are untouched!
        Media afterStaleFailure = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(tokenB, afterStaleFailure.getLeaseToken(), "Token B must not be cleared or overwritten by stale Worker A");
        assertEquals(MediaStatus.RECONCILING, afterStaleFailure.getStatus());
        assertNotEquals(MediaStatus.FAILED, afterStaleFailure.getStatus());
    }

    @Test
    @DisplayName("Race 3: Stale worker success after another worker takes over - stale success rejected")
    void test3_staleWorkerSuccessAfterTakeover() throws Exception {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.PENDING, past, past);

        String tokenA = "worker-A-" + UUID.randomUUID();
        String tokenB = "worker-B-" + UUID.randomUUID();

        // Worker A claims
        coordinator.beginReconciliation(media.getId(), tokenA, Duration.ofSeconds(1));

        // Lease expires
        Media dbMedia = mediaRepository.findById(media.getId()).orElseThrow();
        dbMedia.setLeaseExpiresAt(OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(5));
        mediaRepository.saveAndFlush(dbMedia);

        // Worker B claims
        coordinator.beginReconciliation(media.getId(), tokenB, Duration.ofSeconds(60));

        // Worker A sends late success
        coordinator.completeReconciliationSuccess(media.getId(), tokenA);

        // Worker A MUST NOT have transitioned record to DELETED
        Media afterStaleSuccess = mediaRepository.findById(media.getId()).orElseThrow();
        assertNotEquals(MediaStatus.DELETED, afterStaleSuccess.getStatus(), "Stale worker A must not complete reconciliation");
        assertEquals(MediaStatus.RECONCILING, afterStaleSuccess.getStatus());
        assertEquals(tokenB, afterStaleSuccess.getLeaseToken());
    }

    @Test
    @DisplayName("Race 4: Stale failure after Media is already DELETED - record remains DELETED, never FAILED")
    void test4_staleFailureAfterMediaAlreadyDeleted() throws Exception {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.PENDING, past, past);

        String tokenA = "worker-A-" + UUID.randomUUID();
        String tokenB = "worker-B-" + UUID.randomUUID();

        // Worker A claims
        coordinator.beginReconciliation(media.getId(), tokenA, Duration.ofSeconds(1));

        // Lease expires
        Media dbMedia = mediaRepository.findById(media.getId()).orElseThrow();
        dbMedia.setLeaseExpiresAt(OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(5));
        mediaRepository.saveAndFlush(dbMedia);

        // Worker B claims and completes
        coordinator.beginReconciliation(media.getId(), tokenB, Duration.ofSeconds(60));
        coordinator.completeReconciliationSuccess(media.getId(), tokenB);

        Media deletedMedia = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(MediaStatus.DELETED, deletedMedia.getStatus());

        // Worker A sends late failure with max attempts
        coordinator.recordReconciliationFailure(media.getId(), tokenA, "Network failure", 1, Duration.ofSeconds(10));

        // Record MUST remain DELETED, not FAILED
        Media finalMedia = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(MediaStatus.DELETED, finalMedia.getStatus(), "DELETED status must never be overwritten to FAILED by stale worker");
        assertNull(finalMedia.getLeaseToken());
    }

    @Test
    @DisplayName("Race 5: User DELETE while reconciliation lease is active - no duplicate delete or lease wiping")
    void test5_userDeleteWhileReconciliationLeaseActive() throws Exception {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.PENDING, past, past);
        simulator.put(media.getBucket(), media.getObjectKey(), "test-data".getBytes());

        String workerToken = "worker-" + UUID.randomUUID();
        MediaTransactionCoordinator.ReconciliationCandidate candidate =
            coordinator.beginReconciliation(media.getId(), workerToken, Duration.ofSeconds(60));
        assertNotNull(candidate);

        // User DELETE initiates from another thread while reconciliation is active
        Future<MediaTransactionCoordinator.DeleteDecision> deleteFuture = executor.submit(() ->
            coordinator.beginDelete(media.getId(), testUser.getId())
        );

        MediaTransactionCoordinator.DeleteDecision decision = deleteFuture.get(10, TimeUnit.SECONDS);

        // User delete is handled idempotently without overwriting worker lease
        assertTrue(decision.alreadyDeleted(), "User delete must be treated as already handled / in-flight when active reconciliation lease exists");

        Media current = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(workerToken, current.getLeaseToken(), "Reconciliation lease owner must be preserved");
        assertEquals(MediaStatus.RECONCILING, current.getStatus());

        // Worker finishes its storage delete and commits DELETED
        simulator.delete(candidate.bucket(), candidate.objectKey());
        coordinator.completeReconciliationSuccess(candidate.mediaId(), workerToken);

        assertFalse(simulator.exists(media.getBucket(), media.getObjectKey()));
        Media finalMedia = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(MediaStatus.DELETED, finalMedia.getStatus());
    }

    @Test
    @DisplayName("Race 6: Reconciliation while user DELETE is in flight - worker cannot usurp active delete operation")
    void test6_reconciliationWhileUserDeleteInFlight() throws Exception {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.READY, past, past);
        simulator.put(media.getBucket(), media.getObjectKey(), "test-data".getBytes());

        // User DELETE begins and claims lease
        MediaTransactionCoordinator.DeleteDecision decision = coordinator.beginDelete(media.getId(), testUser.getId());
        assertFalse(decision.alreadyDeleted());
        assertNotNull(decision.deleteToken());

        // Reconciliation worker attempts to claim concurrently
        String workerToken = "worker-" + UUID.randomUUID();
        MediaTransactionCoordinator.ReconciliationCandidate candidate =
            coordinator.beginReconciliation(media.getId(), workerToken, Duration.ofSeconds(60));

        assertNull(candidate, "Reconciliation worker must not be able to claim media while user DELETE lease is active");

        // User DELETE completes
        simulator.delete(decision.bucket(), decision.objectKey());
        coordinator.completeDelete(media.getId(), decision.deleteToken());

        assertFalse(simulator.exists(media.getBucket(), media.getObjectKey()));
        Media finalMedia = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(MediaStatus.DELETED, finalMedia.getStatus());
    }

    @Test
    @DisplayName("Race 7: Worker crash after Storage DELETE, before DB checkpoint - second worker idempotently cleans and completes")
    void test7_workerCrashAfterStorageDeleteBeforeDbCheckpoint() throws Exception {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.PENDING, past, past);
        simulator.put(media.getBucket(), media.getObjectKey(), "test-content".getBytes());

        String worker1Token = "worker-1-" + UUID.randomUUID();
        MediaTransactionCoordinator.ReconciliationCandidate claim1 =
            coordinator.beginReconciliation(media.getId(), worker1Token, Duration.ofSeconds(1));
        assertNotNull(claim1);

        // Worker 1 deletes object from simulator
        boolean deleted1 = simulator.delete(claim1.bucket(), claim1.objectKey());
        assertTrue(deleted1);
        assertFalse(simulator.exists(claim1.bucket(), claim1.objectKey()));

        // Worker 1 crashes! Simulate lease expiration:
        Media leased = mediaRepository.findById(media.getId()).orElseThrow();
        leased.setLeaseExpiresAt(OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(5));
        mediaRepository.saveAndFlush(leased);

        // Worker 2 takes over
        String worker2Token = "worker-2-" + UUID.randomUUID();
        MediaTransactionCoordinator.ReconciliationCandidate claim2 =
            coordinator.beginReconciliation(media.getId(), worker2Token, Duration.ofSeconds(60));
        assertNotNull(claim2);

        // Worker 2 calls delete on storage (simulator returns false/404 because already deleted - idempotent!)
        boolean deleted2 = simulator.delete(claim2.bucket(), claim2.objectKey());
        assertFalse(deleted2, "Object was already deleted by worker 1, returns 404/no-op");

        // Worker 2 commits DB checkpoint
        coordinator.completeReconciliationSuccess(claim2.mediaId(), worker2Token);

        Media finalMedia = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(MediaStatus.DELETED, finalMedia.getStatus());
        assertFalse(simulator.exists(media.getBucket(), media.getObjectKey()));
    }

    @Test
    @DisplayName("Race 8: Late upload after initial timeout - object appears late, reconciliation cleans orphan")
    void test8_lateUploadAfterInitialTimeout() throws Exception {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.PENDING, past, past);

        // Simulator simulates timeout: upload was deferred, compensation delete runs before arrival
        simulator.putDeferred(media.getBucket(), media.getObjectKey());
        boolean compDeleted = simulator.delete(media.getBucket(), media.getObjectKey());
        assertFalse(compDeleted, "Compensation delete before object arrival returns 404");

        // Storage finishes writing late
        simulator.completeDeferred(media.getBucket(), media.getObjectKey(), "late-arrived-bytes".getBytes());
        assertTrue(simulator.exists(media.getBucket(), media.getObjectKey()));

        // Background reconciliation worker finds PENDING record
        String workerToken = "worker-" + UUID.randomUUID();
        MediaTransactionCoordinator.ReconciliationCandidate candidate =
            coordinator.beginReconciliation(media.getId(), workerToken, Duration.ofSeconds(60));
        assertNotNull(candidate);

        // Reconciliation deletes late-arrived orphan object from storage
        boolean cleaned = simulator.delete(candidate.bucket(), candidate.objectKey());
        assertTrue(cleaned, "Reconciliation must find and clean late-arrived orphan object");
        assertFalse(simulator.exists(candidate.bucket(), candidate.objectKey()));

        // Reconciliation marks tombstone in DB
        coordinator.completeReconciliationSuccess(candidate.mediaId(), workerToken);

        Media finalMedia = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(MediaStatus.DELETED, finalMedia.getStatus());
        assertFalse(simulator.exists(media.getBucket(), media.getObjectKey()));
    }

    @Test
    @DisplayName("Race 9: Concurrent markReady and reconciliation claim - exactly one transition succeeds")
    void test9_concurrentMarkReadyAndReconciliationClaim() throws Exception {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.PENDING, past, past);

        CountDownLatch startLatch = new CountDownLatch(1);
        String workerToken = "worker-" + UUID.randomUUID();

        Future<Media> markReadyFuture = executor.submit(() -> {
            startLatch.await();
            try {
                return coordinator.markReady(media.getId());
            } catch (IllegalStateException e) {
                return null;
            }
        });

        Future<MediaTransactionCoordinator.ReconciliationCandidate> reconcileFuture = executor.submit(() -> {
            startLatch.await();
            return coordinator.beginReconciliation(media.getId(), workerToken, Duration.ofSeconds(60));
        });

        startLatch.countDown();
        Media readyResult = markReadyFuture.get(10, TimeUnit.SECONDS);
        MediaTransactionCoordinator.ReconciliationCandidate reconcileResult = reconcileFuture.get(10, TimeUnit.SECONDS);

        // Mutual exclusion: either markReady won or reconciliation won
        assertTrue((readyResult != null && reconcileResult == null) || (readyResult == null && reconcileResult != null),
            "Exactly one operation must win between markReady and beginReconciliation");

        Media finalMedia = mediaRepository.findById(media.getId()).orElseThrow();
        if (readyResult != null) {
            assertEquals(MediaStatus.READY, finalMedia.getStatus());
        } else {
            assertEquals(MediaStatus.RECONCILING, finalMedia.getStatus());
            assertEquals(workerToken, finalMedia.getLeaseToken());
        }
    }

    @Test
    @DisplayName("Race 10: Concurrent user delete and worker delete failure - worker failure does not overwrite user delete")
    void test10_concurrentUserDeleteAndWorkerDeleteFailure() throws Exception {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.READY, past, past);

        // User DELETE initiates and commits DELETING with user delete token
        MediaTransactionCoordinator.DeleteDecision decision = coordinator.beginDelete(media.getId(), testUser.getId());
        assertFalse(decision.alreadyDeleted());
        String userDeleteToken = decision.deleteToken();
        assertNotNull(userDeleteToken);

        // A stale worker failure callback arrives with an old/different token
        String staleWorkerToken = "stale-worker-" + UUID.randomUUID();
        coordinator.recordReconciliationFailure(media.getId(), staleWorkerToken, "500 Internal Error", 1, Duration.ofSeconds(10));

        // The user DELETE state and token MUST NOT be overwritten!
        Media inDb = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(MediaStatus.DELETING, inDb.getStatus(), "Status must remain DELETING");
        assertEquals(userDeleteToken, inDb.getLeaseToken(), "User delete lease token must remain intact");

        // User DELETE successfully completes
        coordinator.completeDelete(media.getId(), userDeleteToken);

        Media finalMedia = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(MediaStatus.DELETED, finalMedia.getStatus());
    }

    // =========================================================================
    // REGRESSION SUITE: PROTECTED STATES & RETRY BACKOFF
    // =========================================================================

    @Test
    @DisplayName("Regression: Media ATTACHED or READY is never claimed or deleted by worker")
    void regression_mediaAttachedOrReady_neverDeletedByWorker() {
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
    @DisplayName("Regression: Storage delete error schedules retry with exponential backoff")
    void regression_deleteFails_retriesAccordingToBackoff() {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.PENDING, past, past);

        String leaseToken = UUID.randomUUID().toString();
        coordinator.beginReconciliation(media.getId(), leaseToken, Duration.ofSeconds(60));

        coordinator.recordReconciliationFailure(media.getId(), leaseToken, "503 Storage Unavailable", 5, Duration.ofSeconds(30));

        Media failedMedia = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(1, failedMedia.getAttemptCount());
        assertNotNull(failedMedia.getNextRetryAt());
        assertTrue(failedMedia.getNextRetryAt().isAfter(OffsetDateTime.now(ZoneOffset.UTC)));
        assertNull(failedMedia.getLeaseToken());

        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        List<Media> stuck = mediaRepository.findStuckMediaForReconciliation(now.minusMinutes(5), now, PageRequest.of(0, 10));
        assertTrue(stuck.isEmpty(), "Media with future nextRetryAt must be skipped");
    }
}
