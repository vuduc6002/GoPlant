package com.cmc.plant_care_backend.dto.media;

import java.time.OffsetDateTime;
import java.util.UUID;

public class MediaReadUrlResponse {

    private UUID mediaId;
    private String readUrl;
    private OffsetDateTime expiresAt;

    public MediaReadUrlResponse() {}

    public MediaReadUrlResponse(UUID mediaId, String readUrl, OffsetDateTime expiresAt) {
        this.mediaId = mediaId;
        this.readUrl = readUrl;
        this.expiresAt = expiresAt;
    }

    public UUID getMediaId() {
        return mediaId;
    }

    public void setMediaId(UUID mediaId) {
        this.mediaId = mediaId;
    }

    public String getReadUrl() {
        return readUrl;
    }

    public void setReadUrl(String readUrl) {
        this.readUrl = readUrl;
    }

    public OffsetDateTime getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(OffsetDateTime expiresAt) {
        this.expiresAt = expiresAt;
    }
}
