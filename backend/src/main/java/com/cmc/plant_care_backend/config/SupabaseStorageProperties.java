package com.cmc.plant_care_backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class SupabaseStorageProperties {

    private final String url;
    private final String apiKey;
    private final String bucket;
    private final long maxFileSizeBytes;
    private final int signedUrlTtlSeconds;

    public SupabaseStorageProperties(
        @Value("${supabase.url:${SUPABASE_URL:}}") String url,
        @Value("${supabase.storage.api-key:${SUPABASE_STORAGE_API_KEY:${SUPABASE_SERVICE_ROLE_KEY:}}}") String apiKey,
        @Value("${supabase.storage.bucket:${SUPABASE_STORAGE_BUCKET:goplant-private-media}}") String bucket,
        @Value("${media.max-file-size-bytes:${MEDIA_MAX_FILE_SIZE_BYTES:5242880}}") long maxFileSizeBytes,
        @Value("${media.signed-url-ttl-seconds:${MEDIA_SIGNED_URL_TTL_SECONDS:300}}") int signedUrlTtlSeconds
    ) {
        this.url = url != null ? url.trim() : "";
        this.apiKey = apiKey != null ? apiKey.trim() : "";
        this.bucket = (bucket != null && !bucket.trim().isEmpty()) ? bucket.trim() : "goplant-private-media";
        this.maxFileSizeBytes = maxFileSizeBytes > 0 ? maxFileSizeBytes : 5242880L;
        this.signedUrlTtlSeconds = signedUrlTtlSeconds > 0 ? signedUrlTtlSeconds : 300;
    }

    public boolean isConfigured() {
        return !url.isEmpty() && !apiKey.isEmpty() && !bucket.isEmpty();
    }

    public String getUrl() {
        return url;
    }

    public String getApiKey() {
        return apiKey;
    }

    public String getBucket() {
        return bucket;
    }

    public long getMaxFileSizeBytes() {
        return maxFileSizeBytes;
    }

    public int getSignedUrlTtlSeconds() {
        return signedUrlTtlSeconds;
    }
}
