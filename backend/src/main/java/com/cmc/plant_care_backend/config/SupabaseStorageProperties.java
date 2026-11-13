package com.cmc.plant_care_backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class SupabaseStorageProperties {

    public enum ApiKeyType {
        AUTO,
        SECRET,
        LEGACY_SERVICE_ROLE
    }

    public static final long DEFAULT_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024L; // 5 MB
    public static final int DEFAULT_SIGNED_URL_TTL_SECONDS = 300; // 5 minutes
    public static final int MIN_SIGNED_URL_TTL_SECONDS = 60;
    public static final int MAX_SIGNED_URL_TTL_SECONDS = 900;

    private final String url;
    private final String apiKey;
    private final String bucket;
    private final ApiKeyType configuredKeyType;
    private final ApiKeyType effectiveKeyType;
    private final long maxFileSizeBytes;
    private final int signedUrlTtlSeconds;

    @org.springframework.beans.factory.annotation.Autowired
    public SupabaseStorageProperties(
        @Value("${supabase.url:${SUPABASE_URL:}}") String url,
        @Value("${supabase.storage.api-key:${SUPABASE_STORAGE_API_KEY:${SUPABASE_SERVICE_ROLE_KEY:}}}") String apiKey,
        @Value("${supabase.storage.api-key-type:${SUPABASE_STORAGE_API_KEY_TYPE:AUTO}}") String apiKeyTypeStr,
        @Value("${supabase.storage.bucket:${SUPABASE_STORAGE_BUCKET:goplant-private-media}}") String bucket,
        @Value("${media.max-file-size-bytes:${MEDIA_MAX_FILE_SIZE_BYTES:5242880}}") long maxFileSizeBytes,
        @Value("${media.signed-url-ttl-seconds:${MEDIA_SIGNED_URL_TTL_SECONDS:300}}") int signedUrlTtlSeconds
    ) {
        this.url = normalizeBaseUrl(url);
        this.apiKey = apiKey != null ? apiKey.trim() : "";
        this.bucket = (bucket != null && !bucket.trim().isEmpty()) ? bucket.trim() : "goplant-private-media";

        ApiKeyType parsedType;
        try {
            parsedType = apiKeyTypeStr != null && !apiKeyTypeStr.trim().isEmpty()
                ? ApiKeyType.valueOf(apiKeyTypeStr.trim().toUpperCase())
                : ApiKeyType.AUTO;
        } catch (IllegalArgumentException e) {
            parsedType = ApiKeyType.AUTO;
        }
        this.configuredKeyType = parsedType;
        this.effectiveKeyType = resolveEffectiveKeyType(this.apiKey, this.configuredKeyType);

        // Clamp max file size: strictly at most 5MB
        if (maxFileSizeBytes <= 0 || maxFileSizeBytes > DEFAULT_MAX_FILE_SIZE_BYTES) {
            this.maxFileSizeBytes = DEFAULT_MAX_FILE_SIZE_BYTES;
        } else {
            this.maxFileSizeBytes = maxFileSizeBytes;
        }

        // Clamp TTL: 60s to 900s, default 300s
        if (signedUrlTtlSeconds < MIN_SIGNED_URL_TTL_SECONDS || signedUrlTtlSeconds > MAX_SIGNED_URL_TTL_SECONDS) {
            this.signedUrlTtlSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS;
        } else {
            this.signedUrlTtlSeconds = signedUrlTtlSeconds;
        }
    }

    public SupabaseStorageProperties(String url, String apiKey, String bucket, long maxFileSizeBytes, int signedUrlTtlSeconds) {
        this(url, apiKey, "AUTO", bucket, maxFileSizeBytes, signedUrlTtlSeconds);
    }

    public static String normalizeBaseUrl(String rawUrl) {
        if (rawUrl == null) return "";
        String normalized = rawUrl.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        if (normalized.endsWith("/storage/v1")) {
            normalized = normalized.substring(0, normalized.length() - "/storage/v1".length());
            while (normalized.endsWith("/")) {
                normalized = normalized.substring(0, normalized.length() - 1);
            }
        }
        return normalized;
    }

    private static ApiKeyType resolveEffectiveKeyType(String key, ApiKeyType configured) {
        if (key == null || key.isEmpty()) {
            return configured == ApiKeyType.AUTO ? ApiKeyType.SECRET : configured;
        }

        if (key.startsWith("sb_publishable_") || key.startsWith("sb_anon_")) {
            throw new IllegalStateException("Publishable/Anon key không được phép sử dụng cho Supabase Storage backend proxy.");
        }

        if (configured == ApiKeyType.SECRET) {
            return ApiKeyType.SECRET;
        }
        if (configured == ApiKeyType.LEGACY_SERVICE_ROLE) {
            return ApiKeyType.LEGACY_SERVICE_ROLE;
        }

        // AUTO detection
        if (key.startsWith("sb_secret_")) {
            return ApiKeyType.SECRET;
        }

        // If key contains JWT dot structure or explicit legacy format
        return ApiKeyType.LEGACY_SERVICE_ROLE;
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

    public ApiKeyType getConfiguredKeyType() {
        return configuredKeyType;
    }

    public ApiKeyType getEffectiveKeyType() {
        return effectiveKeyType;
    }

    public long getMaxFileSizeBytes() {
        return maxFileSizeBytes;
    }

    public int getSignedUrlTtlSeconds() {
        return signedUrlTtlSeconds;
    }
}
