package com.cmc.plant_care_backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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

    public static final int DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
    public static final int MIN_CONNECT_TIMEOUT_MS = 1_000;
    public static final int MAX_CONNECT_TIMEOUT_MS = 60_000;

    public static final int DEFAULT_READ_TIMEOUT_MS = 30_000;
    public static final int MIN_READ_TIMEOUT_MS = 1_000;
    public static final int MAX_READ_TIMEOUT_MS = 120_000;

    private static final Pattern JWT_ROLE_PATTERN = Pattern.compile("\"role\"\\s*:\\s*\"([^\"]+)\"");

    private final String url;
    private final String apiKey;
    private final String bucket;
    private final ApiKeyType configuredKeyType;
    private final ApiKeyType effectiveKeyType;
    private final long maxFileSizeBytes;
    private final int signedUrlTtlSeconds;
    private final int connectTimeoutMs;
    private final int readTimeoutMs;

    @org.springframework.beans.factory.annotation.Autowired
    public SupabaseStorageProperties(
        @Value("${supabase.url:${SUPABASE_URL:}}") String url,
        @Value("${supabase.storage.api-key:${SUPABASE_STORAGE_API_KEY:${SUPABASE_SERVICE_ROLE_KEY:}}}") String apiKey,
        @Value("${supabase.storage.api-key-type:${SUPABASE_STORAGE_API_KEY_TYPE:AUTO}}") String apiKeyTypeStr,
        @Value("${supabase.storage.bucket:${SUPABASE_STORAGE_BUCKET:goplant-private-media}}") String bucket,
        @Value("${media.max-file-size-bytes:${MEDIA_MAX_FILE_SIZE_BYTES:5242880}}") long maxFileSizeBytes,
        @Value("${media.signed-url-ttl-seconds:${MEDIA_SIGNED_URL_TTL_SECONDS:300}}") int signedUrlTtlSeconds,
        @Value("${supabase.storage.connect-timeout-ms:${SUPABASE_STORAGE_CONNECT_TIMEOUT_MS:10000}}") int connectTimeoutMs,
        @Value("${supabase.storage.read-timeout-ms:${SUPABASE_STORAGE_READ_TIMEOUT_MS:30000}}") int readTimeoutMs
    ) {
        this.url = normalizeBaseUrl(url);
        this.apiKey = apiKey != null ? apiKey.trim() : "";
        this.bucket = (bucket != null && !bucket.trim().isEmpty()) ? bucket.trim() : "goplant-private-media";

        if (apiKeyTypeStr == null || apiKeyTypeStr.trim().isEmpty()) {
            this.configuredKeyType = ApiKeyType.AUTO;
        } else {
            try {
                this.configuredKeyType = ApiKeyType.valueOf(apiKeyTypeStr.trim().toUpperCase());
            } catch (IllegalArgumentException e) {
                throw new IllegalStateException("Cấu hình supabase.storage.api-key-type không hợp lệ: '" + apiKeyTypeStr + "'. Chỉ chấp nhận: AUTO, SECRET, LEGACY_SERVICE_ROLE.");
            }
        }

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

        // Clamp connect timeout
        if (connectTimeoutMs < MIN_CONNECT_TIMEOUT_MS || connectTimeoutMs > MAX_CONNECT_TIMEOUT_MS) {
            this.connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS;
        } else {
            this.connectTimeoutMs = connectTimeoutMs;
        }

        // Clamp read timeout
        if (readTimeoutMs < MIN_READ_TIMEOUT_MS || readTimeoutMs > MAX_READ_TIMEOUT_MS) {
            this.readTimeoutMs = DEFAULT_READ_TIMEOUT_MS;
        } else {
            this.readTimeoutMs = readTimeoutMs;
        }
    }

    public SupabaseStorageProperties(String url, String apiKey, String bucket, long maxFileSizeBytes, int signedUrlTtlSeconds) {
        this(url, apiKey, "AUTO", bucket, maxFileSizeBytes, signedUrlTtlSeconds, DEFAULT_CONNECT_TIMEOUT_MS, DEFAULT_READ_TIMEOUT_MS);
    }

    public SupabaseStorageProperties(String url, String apiKey, String apiKeyTypeStr, String bucket, long maxFileSizeBytes, int signedUrlTtlSeconds) {
        this(url, apiKey, apiKeyTypeStr, bucket, maxFileSizeBytes, signedUrlTtlSeconds, DEFAULT_CONNECT_TIMEOUT_MS, DEFAULT_READ_TIMEOUT_MS);
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

        if (key.startsWith("sb_secret_")) {
            if (configured == ApiKeyType.LEGACY_SERVICE_ROLE) {
                throw new IllegalStateException("Cấu hình LEGACY_SERVICE_ROLE không tương thích với Secret key mới (sb_secret_...).");
            }
            return ApiKeyType.SECRET;
        }

        // Validate JWT format for legacy keys
        String[] parts = key.split("\\.");
        if (parts.length == 3) {
            validateLegacyJwtRole(parts[1]);
            if (configured == ApiKeyType.SECRET) {
                throw new IllegalStateException("Cấu hình SECRET không tương thích với legacy JWT service_role key.");
            }
            return ApiKeyType.LEGACY_SERVICE_ROLE;
        }

        // Neither secret key prefix nor valid 3-part JWT
        throw new IllegalStateException("Định dạng Supabase API key không hợp lệ hoặc không xác định.");
    }

    private static void validateLegacyJwtRole(String base64Payload) {
        byte[] payloadBytes;
        try {
            payloadBytes = Base64.getUrlDecoder().decode(base64Payload);
        } catch (IllegalArgumentException ex) {
            try {
                payloadBytes = Base64.getDecoder().decode(base64Payload);
            } catch (IllegalArgumentException ex2) {
                throw new IllegalStateException("Legacy JWT payload không phải Base64/Base64URL hợp lệ.");
            }
        }

        String payloadJson = new String(payloadBytes, StandardCharsets.UTF_8);
        Matcher matcher = JWT_ROLE_PATTERN.matcher(payloadJson);
        if (!matcher.find()) {
            throw new IllegalStateException("Legacy JWT key thiếu claim 'role' trong payload.");
        }

        String role = matcher.group(1).trim();
        if ("anon".equalsIgnoreCase(role)) {
            throw new IllegalStateException("Legacy JWT key có role=anon không được phép sử dụng cho Supabase Storage backend proxy.");
        }
        if (!"service_role".equalsIgnoreCase(role)) {
            throw new IllegalStateException("Legacy JWT key không có quyền service_role (role=" + role + ").");
        }
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

    public int getConnectTimeoutMs() {
        return connectTimeoutMs;
    }

    public int getReadTimeoutMs() {
        return readTimeoutMs;
    }
}
