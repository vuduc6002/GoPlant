package com.cmc.plant_care_backend.common.exception;

import org.springframework.http.HttpStatus;

import java.util.UUID;

public class MediaAttachedException extends AppException {

    private final UUID mediaId;

    public MediaAttachedException(String message) {
        this(message, null);
    }

    public MediaAttachedException(String message, UUID mediaId) {
        super(HttpStatus.CONFLICT, "MEDIA_ATTACHED", message, "mediaId");
        this.mediaId = mediaId;
    }

    public UUID getMediaId() {
        return mediaId;
    }
}
