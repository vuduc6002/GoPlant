package com.cmc.plant_care_backend.dto.media;

import com.cmc.plant_care_backend.model.Media;

import java.time.OffsetDateTime;
import java.util.UUID;

public class MediaResponse {

    private UUID id;
    private String bucket;
    private String objectKey;
    private String mimeType;
    private long sizeBytes;
    private String sha256;
    private Integer width;
    private Integer height;
    private String status;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;

    public MediaResponse() {}

    public static MediaResponse fromEntity(Media media) {
        MediaResponse res = new MediaResponse();
        res.setId(media.getId());
        res.setBucket(media.getBucket());
        res.setObjectKey(media.getObjectKey());
        res.setMimeType(media.getMimeType());
        res.setSizeBytes(media.getSizeBytes());
        res.setSha256(media.getSha256());
        res.setWidth(media.getWidth());
        res.setHeight(media.getHeight());
        res.setStatus(media.getStatus() != null ? media.getStatus().name() : null);
        res.setCreatedAt(media.getCreatedAt());
        res.setUpdatedAt(media.getUpdatedAt());
        return res;
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getBucket() {
        return bucket;
    }

    public void setBucket(String bucket) {
        this.bucket = bucket;
    }

    public String getObjectKey() {
        return objectKey;
    }

    public void setObjectKey(String objectKey) {
        this.objectKey = objectKey;
    }

    public String getMimeType() {
        return mimeType;
    }

    public void setMimeType(String mimeType) {
        this.mimeType = mimeType;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public void setSizeBytes(long sizeBytes) {
        this.sizeBytes = sizeBytes;
    }

    public String getSha256() {
        return sha256;
    }

    public void setSha256(String sha256) {
        this.sha256 = sha256;
    }

    public Integer getWidth() {
        return width;
    }

    public void setWidth(Integer width) {
        this.width = width;
    }

    public Integer getHeight() {
        return height;
    }

    public void setHeight(Integer height) {
        this.height = height;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(OffsetDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
