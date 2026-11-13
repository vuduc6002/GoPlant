package com.cmc.plant_care_backend.service.storage;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

public class InMemoryStorageSimulator {

    private final Map<String, byte[]> storage = new ConcurrentHashMap<>();
    private final Set<String> deferredUploads = ConcurrentHashMap.newKeySet();
    private volatile boolean failDeletes = false;
    private volatile boolean failUploads = false;

    private String buildPath(String bucket, String key) {
        return bucket + "/" + key;
    }

    public void put(String bucket, String key, byte[] content) {
        if (failUploads) {
            throw new RuntimeException("Simulated storage upload network failure");
        }
        storage.put(buildPath(bucket, key), content != null ? content : new byte[0]);
    }

    public void putDeferred(String bucket, String key) {
        deferredUploads.add(buildPath(bucket, key));
    }

    public void completeDeferred(String bucket, String key, byte[] content) {
        deferredUploads.remove(buildPath(bucket, key));
        storage.put(buildPath(bucket, key), content != null ? content : new byte[0]);
    }

    public boolean exists(String bucket, String key) {
        return storage.containsKey(buildPath(bucket, key));
    }

    public boolean isDeferred(String bucket, String key) {
        return deferredUploads.contains(buildPath(bucket, key));
    }

    public boolean delete(String bucket, String key) {
        if (failDeletes) {
            throw new RuntimeException("Simulated storage delete outage (503 Service Unavailable)");
        }
        String path = buildPath(bucket, key);
        byte[] removed = storage.remove(path);
        // Idempotent: returns true if object existed and was removed, false if 404 (absent)
        return removed != null;
    }

    public void setFailDeletes(boolean failDeletes) {
        this.failDeletes = failDeletes;
    }

    public void setFailUploads(boolean failUploads) {
        this.failUploads = failUploads;
    }

    public void clear() {
        storage.clear();
        deferredUploads.clear();
        failDeletes = false;
        failUploads = false;
    }
}
