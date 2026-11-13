package com.cmc.plant_care_backend.service.storage;

import com.cmc.plant_care_backend.common.exception.StorageUnavailableException;
import com.cmc.plant_care_backend.config.SupabaseStorageProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;

@Component
public class SupabaseStorageGateway {

    private static final Logger log = LoggerFactory.getLogger(SupabaseStorageGateway.class);

    private final SupabaseStorageProperties properties;
    private final RestClient restClient;

    public SupabaseStorageGateway(SupabaseStorageProperties properties) {
        this(properties, RestClient.builder());
    }

    @org.springframework.beans.factory.annotation.Autowired
    public SupabaseStorageGateway(SupabaseStorageProperties properties, RestClient.Builder restClientBuilder) {
        this.properties = properties;
        this.restClient = restClientBuilder.build();
    }

    public boolean isConfigured() {
        return properties.isConfigured();
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
                    throw new StorageUnavailableException("Dịch vụ lưu trữ không thể lưu trữ tệp tin (mã lỗi: " + statusCode + ").");
                })
                .toBodilessEntity();
        } catch (StorageUnavailableException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("Failed to upload object to Supabase Storage: {}", ex.getMessage());
            throw new StorageUnavailableException("Lỗi kết nối tới dịch vụ lưu trữ hình ảnh.");
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
            log.error("Failed to generate signed URL from Supabase Storage: {}", ex.getMessage());
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
            RestClient.RequestBodySpec requestSpec = restClient.method(org.springframework.http.HttpMethod.DELETE)
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
            log.error("Failed to delete object from Supabase Storage: {}", ex.getMessage());
            throw new StorageUnavailableException("Lỗi kết nối tới dịch vụ lưu trữ khi xóa tệp tin.");
        }
    }

    private String trimTrailingSlash(String url) {
        if (url == null) return "";
        String trimmed = url.trim();
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed;
    }

    private String resolveFullSignedUrl(String baseUrl, String signedUrl) {
        if (signedUrl.startsWith("http://") || signedUrl.startsWith("https://")) {
            return signedUrl;
        }
        if (signedUrl.startsWith("/storage/v1/")) {
            return baseUrl + signedUrl;
        }
        if (signedUrl.startsWith("/")) {
            return baseUrl + "/storage/v1" + signedUrl;
        }
        return baseUrl + "/storage/v1/" + signedUrl;
    }
}
