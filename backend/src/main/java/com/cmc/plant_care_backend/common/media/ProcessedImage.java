package com.cmc.plant_care_backend.common.media;

public class ProcessedImage {

    private final byte[] bytes;
    private final String mimeType;
    private final int width;
    private final int height;
    private final long sizeBytes;
    private final String sha256;

    public ProcessedImage(byte[] bytes, String mimeType, int width, int height, long sizeBytes, String sha256) {
        this.bytes = bytes;
        this.mimeType = mimeType;
        this.width = width;
        this.height = height;
        this.sizeBytes = sizeBytes;
        this.sha256 = sha256;
    }

    public byte[] getBytes() {
        return bytes;
    }

    public String getMimeType() {
        return mimeType;
    }

    public int getWidth() {
        return width;
    }

    public int getHeight() {
        return height;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public String getSha256() {
        return sha256;
    }
}
