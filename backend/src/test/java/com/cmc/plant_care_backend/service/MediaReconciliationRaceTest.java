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

    @Autowired
    private MediaReconciliationService reconciliationService;

    @Autowired
    private MediaService mediaService;

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
    // MANDATORY FIX B: 10 SCENARIOS (REAL CONCURRENT RACES + CONTROLLED RECOVERY)
    // =========================================================================

    // -------------------------------------------------------------------------
    // GROUP 1: REAL MULTI-THREADED CONCURRENT RACE TESTS (Latches + Production Flow)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("Race 1: Two workers claim the same Media simultaneously - exactly one acquires lease")
    void test1_twoWorkersClaimSameMediaSimultaneously() throws Exception {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.PENDING, past, past);

        CountDownLatch readyLatch = new CountDownLatch(2);
        CountDownLatch startLatch = new CountDownLatch(1);
        String token1 = "worker-1-" + UUID.randomUUID();
        String token2 = "worker-2-" + UUID.randomUUID();

        Future<MediaTransactionCoordinator.ReconciliationCandidate> f1 = executor.submit(() -> {
            readyLatch.countDown();
            startLatch.await();
            return coordinator.beginReconciliation(media.getId(), token1, Duration.ofSeconds(60));
        });

        Future<MediaTransactionCoordinator.ReconciliationCandidate> f2 = executor.submit(() -> {
            readyLatch.countDown();
            startLatch.await();
            return coordinator.beginReconciliation(media.getId(), token2, Duration.ofSeconds(60));
        });

        assertTrue(readyLatch.await(5, TimeUnit.SECONDS), "Workers must be ready");
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
    @DisplayName("Race 5: User DELETE while reconciliation worker is in Storage I/O - no duplicate delete or lease wiping")
    void test5_userDeleteWhileReconciliationWorkerInStorageIO() throws Exception {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.PENDING, past, past);
        simulator.put(media.getBucket(), media.getObjectKey(), "test-data".getBytes());

        CountDownLatch workerInStorageLatch = new CountDownLatch(1);
        CountDownLatch continueWorkerStorageLatch = new CountDownLatch(1);

        // Hook storageGateway to hold worker during Storage deletion
        simulator.setDeleteHook((bucket, key) -> {
            workerInStorageLatch.countDown();
            try {
                assertTrue(continueWorkerStorageLatch.await(5, TimeUnit.SECONDS), "Worker storage delete latch timed out");
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });

        // Worker runs production reconciliation service in Thread 1
        Future<Integer> workerFuture = executor.submit(() ->
            reconciliationService.reconcileStuckMedia(Duration.ofSeconds(1))
        );

        // Wait until reconciliation worker has claimed lease and is actively executing storageGateway.delete()
        assertTrue(workerInStorageLatch.await(5, TimeUnit.SECONDS), "Worker must enter storage I/O");

        // Verify media in DB is currently in RECONCILING with active lease
        Media inProgress = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(MediaStatus.RECONCILING, inProgress.getStatus());
        assertNotNull(inProgress.getLeaseToken());

        // Concurrently on Thread 2 (or test thread): User calls production MediaService.deleteMedia()
        // Because reconciliation worker is actively processing it with a valid lease, User DELETE
        // handles it idempotently (does not issue duplicate storage delete or throw error)
        assertDoesNotThrow(() -> mediaService.deleteMedia(media.getId(), testUser.getId()));

        // Release the worker from storage I/O
        continueWorkerStorageLatch.countDown();

        int reconciledCount = workerFuture.get(10, TimeUnit.SECONDS);
        assertEquals(1, reconciledCount);

        // Verify storage object was removed exactly once
        assertFalse(simulator.exists(media.getBucket(), media.getObjectKey()));
        assertEquals(1, simulator.getDeleteCallCount(), "Storage delete must be called exactly once (no duplicate from user)");

        // Verify final DB state is DELETED
        Media finalMedia = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(MediaStatus.DELETED, finalMedia.getStatus());
        assertNull(finalMedia.getLeaseToken());
    }

    @Test
    @DisplayName("Race 6: Reconciliation while user DELETE is in Storage I/O - worker cannot usurp active delete lease")
    void test6_reconciliationWhileUserDeleteInStorageIO() throws Exception {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.READY, past, past);
        simulator.put(media.getBucket(), media.getObjectKey(), "test-data".getBytes());

        CountDownLatch userInStorageLatch = new CountDownLatch(1);
        CountDownLatch continueUserStorageLatch = new CountDownLatch(1);

        simulator.setDeleteHook((bucket, key) -> {
            userInStorageLatch.countDown();
            try {
                assertTrue(continueUserStorageLatch.await(5, TimeUnit.SECONDS), "User delete storage latch timed out");
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });

        // User DELETE runs production MediaService.deleteMedia() in Thread 1
        Future<Void> userDeleteFuture = executor.submit(() -> {
            mediaService.deleteMedia(media.getId(), testUser.getId());
            return null;
        });

        // Wait until User DELETE has set status to DELETING and is inside storageGateway.delete()
        assertTrue(userInStorageLatch.await(5, TimeUnit.SECONDS), "User delete must enter storage I/O");

        Media inProgress = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(MediaStatus.DELETING, inProgress.getStatus());
        assertNotNull(inProgress.getLeaseToken());

        // Concurrently in Thread 2: Reconciliation worker runs
        // Because user DELETE has active lease in DELETING, worker cannot claim media
        int reconciledCount = reconciliationService.reconcileStuckMedia(Duration.ZERO);
        assertEquals(0, reconciledCount, "Reconciliation worker must not usurp active user delete lease");

        // Release user delete
        continueUserStorageLatch.countDown();
        userDeleteFuture.get(10, TimeUnit.SECONDS);

        // Verify object deleted and DB state
        assertFalse(simulator.exists(media.getBucket(), media.getObjectKey()));
        assertEquals(1, simulator.getDeleteCallCount());

        Media finalMedia = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(MediaStatus.DELETED, finalMedia.getStatus());
        assertNull(finalMedia.getLeaseToken());
    }

    @Test
    @DisplayName("Race 9: Concurrent markReady and reconciliation claim - exactly one transition succeeds")
    void test9_concurrentMarkReadyAndReconciliationClaim() throws Exception {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.PENDING, past, past);

        CountDownLatch readyLatch = new CountDownLatch(2);
        CountDownLatch startLatch = new CountDownLatch(1);
        String workerToken = "worker-" + UUID.randomUUID();

        Future<Media> markReadyFuture = executor.submit(() -> {
            readyLatch.countDown();
            startLatch.await();
            try {
                return coordinator.markReady(media.getId());
            } catch (IllegalStateException e) {
                return null;
            }
        });

        Future<MediaTransactionCoordinator.ReconciliationCandidate> reconcileFuture = executor.submit(() -> {
            readyLatch.countDown();
            startLatch.await();
            return coordinator.beginReconciliation(media.getId(), workerToken, Duration.ofSeconds(60));
        });

        assertTrue(readyLatch.await(5, TimeUnit.SECONDS), "Both tasks must be ready");
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
        simulator.put(media.getBucket(), media.getObjectKey(), "test-data".getBytes());

        CountDownLatch readyLatch = new CountDownLatch(2);
        CountDownLatch startLatch = new CountDownLatch(1);

        Future<Void> deleteFuture = executor.submit(() -> {
            readyLatch.countDown();
            startLatch.await();
            mediaService.deleteMedia(media.getId(), testUser.getId());
            return null;
        });

        String staleWorkerToken = "stale-worker-" + UUID.randomUUID();
        Future<Void> failureFuture = executor.submit(() -> {
            readyLatch.countDown();
            startLatch.await();
            coordinator.recordReconciliationFailure(media.getId(), staleWorkerToken, "500 Internal Error", 1, Duration.ofSeconds(10));
            return null;
        });

        assertTrue(readyLatch.await(5, TimeUnit.SECONDS));
        startLatch.countDown();
        deleteFuture.get(10, TimeUnit.SECONDS);
        failureFuture.get(10, TimeUnit.SECONDS);

        Media finalMedia = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(MediaStatus.DELETED, finalMedia.getStatus(), "User delete must succeed, stale worker failure must not corrupt state");
        assertNull(finalMedia.getLeaseToken());
        assertFalse(simulator.exists(media.getBucket(), media.getObjectKey()));
    }

    // -------------------------------------------------------------------------
    // GROUP 2: CONTROLLED INTERLEAVING & CRASH RECOVERY TESTS
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("Scenario 2: Stale worker failure after another worker takes over - token B and state preserved")
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
    @DisplayName("Scenario 3: Stale worker success after another worker takes over - stale success rejected")
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
    @DisplayName("Scenario 4: Stale failure after Media is already DELETED - record remains DELETED, never FAILED")
    void test4_staleFailureAfterMediaAlreadyDeleted() throws Exception {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.PENDING, past, past);
        simulator.put(media.getBucket(), media.getObjectKey(), "test-data".getBytes());

        String tokenA = "worker-A-" + UUID.randomUUID();
        String tokenB = "worker-B-" + UUID.randomUUID();

        // Worker A claims
        coordinator.beginReconciliation(media.getId(), tokenA, Duration.ofSeconds(1));

        // Lease expires
        Media dbMedia = mediaRepository.findById(media.getId()).orElseThrow();
        dbMedia.setLeaseExpiresAt(OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(5));
        mediaRepository.saveAndFlush(dbMedia);

        // Worker B claims and completes via production storage gateway
        coordinator.beginReconciliation(media.getId(), tokenB, Duration.ofSeconds(60));
        storageGateway.delete(media.getBucket(), media.getObjectKey());
        coordinator.completeReconciliationSuccess(media.getId(), tokenB);

        Media deletedMedia = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(MediaStatus.DELETED, deletedMedia.getStatus());
        assertFalse(simulator.exists(media.getBucket(), media.getObjectKey()));

        // Worker A sends late failure with max attempts
        coordinator.recordReconciliationFailure(media.getId(), tokenA, "Network failure", 1, Duration.ofSeconds(10));

        // Record MUST remain DELETED, not FAILED
        Media finalMedia = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(MediaStatus.DELETED, finalMedia.getStatus(), "DELETED status must never be overwritten to FAILED by stale worker");
        assertNull(finalMedia.getLeaseToken());
    }

    @Test
    @DisplayName("Scenario 7: Worker crash after Storage DELETE before DB checkpoint - retry idempotently handles 404 and completes")
    void test7_workerCrashAfterStorageDeleteBeforeDbCheckpoint() throws Exception {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.PENDING, past, past);
        simulator.put(media.getBucket(), media.getObjectKey(), "test-content".getBytes());

        String worker1Token = "worker-1-" + UUID.randomUUID();
        MediaTransactionCoordinator.ReconciliationCandidate claim1 =
            coordinator.beginReconciliation(media.getId(), worker1Token, Duration.ofSeconds(1));
        assertNotNull(claim1);

        // Worker 1 deletes object via storage gateway
        storageGateway.delete(claim1.bucket(), claim1.objectKey());
        assertFalse(simulator.exists(claim1.bucket(), claim1.objectKey()));
        assertEquals(1, simulator.getDeleteCallCount());

        // Worker 1 crashes! Simulate lease expiration:
        Media leased = mediaRepository.findById(media.getId()).orElseThrow();
        leased.setLeaseExpiresAt(OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(5));
        mediaRepository.saveAndFlush(leased);

        // Worker 2 runs production reconciliation service
        int count = reconciliationService.reconcileStuckMedia(Duration.ZERO);
        assertEquals(1, count, "Worker 2 must successfully recover and reconcile stuck media");

        // Storage was called second time (idempotent 404 / false in simulator)
        assertEquals(2, simulator.getDeleteCallCount());

        Media finalMedia = mediaRepository.findById(media.getId()).orElseThrow();
        assertEquals(MediaStatus.DELETED, finalMedia.getStatus());
        assertFalse(simulator.exists(media.getBucket(), media.getObjectKey()));
    }

    @Test
    @DisplayName("Scenario 8: Late upload after initial timeout - object appears late, reconciliation cleans orphan")
    void test8_lateUploadAfterInitialTimeout() throws Exception {
        OffsetDateTime past = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Media media = createMediaInDb(MediaStatus.PENDING, past, past);

        // Simulator simulates timeout: upload was deferred, compensation delete runs before arrival
        simulator.putDeferred(media.getBucket(), media.getObjectKey());
        storageGateway.delete(media.getBucket(), media.getObjectKey());
        assertFalse(simulator.exists(media.getBucket(), media.getObjectKey()));

        // Storage finishes writing late
        simulator.completeDeferred(media.getBucket(), media.getObjectKey(), "late-arrived-bytes".getBytes());
        assertTrue(simulator.exists(media.getBucket(), media.getObjectKey()));

        // Background reconciliation worker runs production reconciliation
        int reconciledCount = reconciliationService.reconcileStuckMedia(Duration.ZERO);
        assertEquals(1, reconciledCount, "Reconciliation must find and clean late-arrived orphan media");

        // Verify storage object was removed by reconciliation
        assertFalse(simulator.exists(media.getBucket(), media.getObjectKey()));

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
