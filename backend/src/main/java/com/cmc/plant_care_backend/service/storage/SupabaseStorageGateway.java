package com.cmc.plant_care_backend.service.storage;

import com.cmc.plant_care_backend.common.exception.StorageUnavailableException;
import com.cmc.plant_care_backend.config.SupabaseStorageProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Map;

@Component
public class SupabaseStorageGateway {

    private static final Logger log = LoggerFactory.getLogger(SupabaseStorageGateway.class);

    private final SupabaseStorageProperties properties;
    private final RestClient restClient;
    private final int connectTimeoutMs;
    private final int readTimeoutMs;

    public SupabaseStorageGateway(SupabaseStorageProperties properties) {
        this(properties, RestClient.builder(), true);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public SupabaseStorageGateway(SupabaseStorageProperties properties, RestClient.Builder restClientBuilder) {
        this(properties, restClientBuilder, true);
    }

    public SupabaseStorageGateway(SupabaseStorageProperties properties, RestClient.Builder restClientBuilder, boolean applyTimeoutFactory) {
        this.properties = properties;
        this.connectTimeoutMs = properties.getConnectTimeoutMs();
        this.readTimeoutMs = properties.getReadTimeoutMs();

        if (applyTimeoutFactory) {
            SimpleClientHttpRequestFactory requestFactory = createRequestFactory(this.connectTimeoutMs, this.readTimeoutMs);
            restClientBuilder.requestFactory(requestFactory);
        }

        this.restClient = restClientBuilder.build();
    }

    public static SimpleClientHttpRequestFactory createRequestFactory(int connectTimeoutMs, int readTimeoutMs) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofMillis(connectTimeoutMs));
        requestFactory.setReadTimeout(Duration.ofMillis(readTimeoutMs));
        return requestFactory;
    }

    public boolean isConfigured() {
        return properties.isConfigured();
    }

    public int getConnectTimeoutMs() {
        return connectTimeoutMs;
    }

    public int getReadTimeoutMs() {
        return readTimeoutMs;
    }

    public void upload(String bucket, String objectKey, byte[] data, String mimeType) {
        if (!properties.isConfigured()) {
            throw new StorageUnavailableException("Dịch vụ lưu trữ Supabase Storage chưa được cấu hình.");
        }

        String baseUrl = properties.getUrl();
        String url = baseUrl + "/storage/v1/object/" + bucket + "/" + objectKey;

        try {
            RestClient.RequestBodySpec requestSpec = restClient.post()
                .uri(url)
                .header("apikey", properties.getApiKey())
                .header("x-upsert", "false")
                .contentType(MediaType.parseMediaType(mimeType))
                .body(data);

            if (properties.getEffectiveKeyType() == SupabaseStorageProperties.ApiKeyType.LEGACY_SERVICE_ROLE) {
                requestSpec = requestSpec.header("Authorization", "Bearer " + properties.getApiKey());
            }

            requestSpec
                .retrieve()
                .onStatus(HttpStatusCode::isError, (req, res) -> {
                    int statusCode = res.getStatusCode().value();
                    log.warn("Supabase Storage upload returned HTTP status [{}] for bucket [{}]", statusCode, bucket);
                    boolean indefinite = statusCode >= 500;
                    throw new StorageUnavailableException("Dịch vụ lưu trữ không thể lưu trữ tệp tin (mã lỗi: " + statusCode + ").", indefinite);
                })
                .toBodilessEntity();
        } catch (StorageUnavailableException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("Failed to upload object to Supabase Storage: {}", sanitizeLogMessage(ex.getMessage()));
            throw new StorageUnavailableException("Lỗi kết nối tới dịch vụ lưu trữ hình ảnh.", true);
        }
    }

    public String createSignedUrl(String bucket, String objectKey, int ttlSeconds) {
        if (!properties.isConfigured()) {
            throw new StorageUnavailableException("Dịch vụ lưu trữ Supabase Storage chưa được cấu hình.");
        }

        String baseUrl = properties.getUrl();
        String url = baseUrl + "/storage/v1/object/sign/" + bucket + "/" + objectKey;
        int ttl = ttlSeconds > 0 ? ttlSeconds : properties.getSignedUrlTtlSeconds();

        try {
            RestClient.RequestBodySpec requestSpec = restClient.post()
                .uri(url)
                .header("apikey", properties.getApiKey())
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("expiresIn", ttl));

            if (properties.getEffectiveKeyType() == SupabaseStorageProperties.ApiKeyType.LEGACY_SERVICE_ROLE) {
                requestSpec = requestSpec.header("Authorization", "Bearer " + properties.getApiKey());
            }

            Map<String, Object> response = requestSpec
                .retrieve()
                .onStatus(HttpStatusCode::isError, (req, res) -> {
                    int statusCode = res.getStatusCode().value();
                    log.warn("Supabase Storage createSignedUrl returned HTTP status [{}] for bucket [{}]", statusCode, bucket);
                    throw new StorageUnavailableException("Dịch vụ lưu trữ không thể tạo URL truy cập (mã lỗi: " + statusCode + ").");
                })
                .body(new ParameterizedTypeReference<Map<String, Object>>() {});

            if (response == null) {
                throw new StorageUnavailableException("Phản hồi từ dịch vụ lưu trữ rỗng.");
            }

            Object signedUrlObj = response.get("signedURL");
            if (signedUrlObj == null) {
                signedUrlObj = response.get("signedUrl");
            }
            if (signedUrlObj == null) {
                throw new StorageUnavailableException("Không tìm thấy trường signedURL trong phản hồi của dịch vụ lưu trữ.");
            }

            String signedUrl = signedUrlObj.toString();
            return resolveFullSignedUrl(baseUrl, signedUrl);
        } catch (StorageUnavailableException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("Failed to generate signed URL from Supabase Storage: {}", sanitizeLogMessage(ex.getMessage()));
            throw new StorageUnavailableException("Lỗi kết nối tới dịch vụ lưu trữ khi tạo URL truy cập.");
        }
    }

    public void delete(String bucket, String objectKey) {
        if (!properties.isConfigured()) {
            throw new StorageUnavailableException("Dịch vụ lưu trữ Supabase Storage chưa được cấu hình.");
        }

        String baseUrl = properties.getUrl();
        String url = baseUrl + "/storage/v1/object/" + bucket;

        try {
            RestClient.RequestBodySpec requestSpec = restClient.method(HttpMethod.DELETE)
                .uri(url)
                .header("apikey", properties.getApiKey())
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("prefixes", List.of(objectKey)));

            if (properties.getEffectiveKeyType() == SupabaseStorageProperties.ApiKeyType.LEGACY_SERVICE_ROLE) {
                requestSpec = requestSpec.header("Authorization", "Bearer " + properties.getApiKey());
            }

            requestSpec
                .retrieve()
                .onStatus(status -> status.value() == 404, (req, res) -> {
                    // Object already gone, consider delete idempotent
                    log.debug("Object to delete not found in storage (404), treating as deleted.");
                })
                .onStatus(HttpStatusCode::isError, (req, res) -> {
                    int statusCode = res.getStatusCode().value();
                    log.warn("Supabase Storage delete returned HTTP status [{}] for bucket [{}]", statusCode, bucket);
                    throw new StorageUnavailableException("Dịch vụ lưu trữ không thể xóa tệp tin (mã lỗi: " + statusCode + ").");
                })
                .toBodilessEntity();
        } catch (StorageUnavailableException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("Failed to delete object from Supabase Storage: {}", sanitizeLogMessage(ex.getMessage()));
            throw new StorageUnavailableException("Lỗi kết nối tới dịch vụ lưu trữ khi xóa tệp tin.");
        }
    }

    public String resolveFullSignedUrl(String baseUrl, String rawSignedUrl) {
        if (rawSignedUrl == null || rawSignedUrl.trim().isEmpty()) {
            throw new StorageUnavailableException("URL truy cập tệp tin từ dịch vụ lưu trữ rỗng.");
        }

        String trimmed = rawSignedUrl.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("http://")) {
            throw new StorageUnavailableException("Dịch vụ lưu trữ trả về giao thức không an toàn hoặc không hợp lệ.");
        }

        URI baseUri;
        try {
            baseUri = URI.create(baseUrl);
        } catch (Exception e) {
            throw new StorageUnavailableException("Cấu hình URL dịch vụ lưu trữ không hợp lệ.");
        }

        if (trimmed.startsWith("https://")) {
            URI signedUri;
            try {
                signedUri = URI.create(trimmed);
            } catch (Exception e) {
                throw new StorageUnavailableException("URL truy cập tệp tin không đúng định dạng URI.");
            }

            if (!"https".equalsIgnoreCase(signedUri.getScheme())) {
                throw new StorageUnavailableException("Chỉ chấp nhận URL truy cập sử dụng giao thức HTTPS.");
            }

            if (signedUri.getUserInfo() != null || (signedUri.getRawAuthority() != null && signedUri.getRawAuthority().contains("@"))) {
                throw new StorageUnavailableException("URL truy cập tệp tin chứa thông tin nhạy cảm userinfo.");
            }

            String signedHost = signedUri.getHost();
            String baseHost = baseUri.getHost();
            if (signedHost == null || !signedHost.equalsIgnoreCase(baseHost)) {
                throw new StorageUnavailableException("URL truy cập tệp tin không thuộc máy chủ lưu trữ hợp lệ.");
            }

            int signedPort = signedUri.getPort() == -1 ? 443 : signedUri.getPort();
            int basePort = baseUri.getPort() == -1 ? (baseUri.getScheme() != null && baseUri.getScheme().equalsIgnoreCase("https") ? 443 : 80) : baseUri.getPort();
            if (signedPort != basePort) {
                throw new StorageUnavailableException("Cổng kết nối trong URL truy cập tệp tin không khớp máy chủ lưu trữ.");
            }

            String path = signedUri.getPath();
            if (path == null || !path.startsWith("/storage/v1/")) {
                throw new StorageUnavailableException("Đường dẫn trong URL truy cập tệp tin không thuộc phân hệ Storage hợp lệ.");
            }

            return trimmed;
        }

        // Relative path
        String relativePath = trimmed;
        if (!relativePath.startsWith("/")) {
            relativePath = "/" + relativePath;
        }

        if (!relativePath.startsWith("/storage/v1/")) {
            relativePath = "/storage/v1" + relativePath;
        }

        return baseUrl + relativePath;
    }

    public String sanitizeLogMessage(String raw) {
        if (raw == null) return "";
        String sanitized = raw;
        if (properties != null && properties.getApiKey() != null && !properties.getApiKey().isEmpty()) {
            sanitized = sanitized.replace(properties.getApiKey(), "[REDACTED]");
        }
        sanitized = sanitized.replaceAll("(?i)(apikey|token|secret|key|bearer)\\s*[=:]\\s*[^&\\s]+", "$1=[REDACTED]");
        sanitized = sanitized.replaceAll("Bearer\\s+[A-Za-z0-9._~+/-]+", "Bearer [REDACTED]");
        return sanitized;
    }
}
