package com.cmc.plant_care_backend.common.media;

import com.cmc.plant_care_backend.common.exception.ValidationException;
import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.Metadata;
import com.drew.metadata.exif.GpsDirectory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;

class ImageMetadataProcessorTest {

    private ImageMetadataProcessor processor;

    @BeforeEach
    void setUp() {
        processor = new ImageMetadataProcessor();
    }

    private byte[] createTestImage(String format, int width, int height) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.GREEN);
        g.fillRect(0, 0, width, height);
        g.setColor(Color.BLACK);
        g.drawString("GoPlant Test", 5, height / 2);
        g.dispose();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(image, format, baos);
        return baos.toByteArray();
    }

    private byte[] createTestPngWithAlpha(int width, int height) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        g.setColor(new Color(0, 255, 0, 128));
        g.fillRect(0, 0, width, height);
        g.dispose();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(image, "PNG", baos);
        return baos.toByteArray();
    }

    private byte[] createMinimalValidWebp() {
        // Minimal valid 1x1 lossy WebP
        return new byte[] {
            'R', 'I', 'F', 'F',
            0x1c, 0x00, 0x00, 0x00, // 28 bytes
            'W', 'E', 'B', 'P',
            'V', 'P', '8', ' ',
            0x10, 0x00, 0x00, 0x00, // 16 bytes payload
            0x30, 0x01, 0x00, (byte) 0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00, 0x02, 0x00, 0x34, 0x25, (byte) 0xa4, 0x00
        };
    }

    @Test
    @DisplayName("Process valid JPEG image: strips metadata, preserves dimensions, generates SHA-256")
    void processJpeg_Success() throws Exception {
        byte[] input = createTestImage("JPEG", 120, 80);
        ProcessedImage result = processor.process(input, "image/jpeg");

        assertNotNull(result);
        assertEquals("image/jpeg", result.getMimeType());
        assertEquals(120, result.getWidth());
        assertEquals(80, result.getHeight());
        assertNotNull(result.getSha256());
        assertEquals(64, result.getSha256().length());
        assertTrue(result.getBytes().length > 0);

        // Verify output is valid JPEG
        assertEquals((byte) 0xFF, result.getBytes()[0]);
        assertEquals((byte) 0xD8, result.getBytes()[1]);

        // Verify no GPS metadata in processed image
        Metadata metadata = ImageMetadataReader.readMetadata(new ByteArrayInputStream(result.getBytes()));
        GpsDirectory gpsDir = metadata.getFirstDirectoryOfType(GpsDirectory.class);
        assertTrue(gpsDir == null || gpsDir.getTagCount() == 0, "Processed JPEG must not contain GPS metadata");
    }

    @Test
    @DisplayName("Process valid PNG image with transparency: preserves alpha channel and dimensions")
    void processPng_Success() throws Exception {
        byte[] input = createTestPngWithAlpha(64, 64);
        ProcessedImage result = processor.process(input, "image/png");

        assertNotNull(result);
        assertEquals("image/png", result.getMimeType());
        assertEquals(64, result.getWidth());
        assertEquals(64, result.getHeight());
        assertNotNull(result.getSha256());
        assertEquals(64, result.getSha256().length());
        assertTrue(result.getBytes().length > 0);

        // Verify PNG magic bytes
        assertEquals((byte) 0x89, result.getBytes()[0]);
        assertEquals((byte) 'P', result.getBytes()[1]);
        assertEquals((byte) 'N', result.getBytes()[2]);
        assertEquals((byte) 'G', result.getBytes()[3]);
    }

    @Test
    @DisplayName("Process valid minimal WebP image: extracts dimensions and strips container metadata")
    void processWebp_Success() throws Exception {
        byte[] input = createMinimalValidWebp();
        ProcessedImage result = processor.process(input, "image/webp");

        assertNotNull(result);
        assertEquals("image/webp", result.getMimeType());
        assertEquals(1, result.getWidth());
        assertEquals(1, result.getHeight());
        assertNotNull(result.getSha256());
        assertEquals(64, result.getSha256().length());
        assertTrue(result.getBytes().length > 0);

        // Verify WebP magic bytes
        assertEquals('R', result.getBytes()[0]);
        assertEquals('I', result.getBytes()[1]);
        assertEquals('F', result.getBytes()[2]);
        assertEquals('F', result.getBytes()[3]);
    }

    @Test
    @DisplayName("Reject file exceeding maximum size (5 MB)")
    void rejectOversizedFile() {
        byte[] largeData = new byte[5 * 1024 * 1024 + 1];
        com.cmc.plant_care_backend.common.exception.AppException ex = assertThrows(
            com.cmc.plant_care_backend.common.exception.AppException.class,
            () -> processor.process(largeData, "image/jpeg"));
        assertEquals(org.springframework.http.HttpStatus.PAYLOAD_TOO_LARGE, ex.getStatus());
        assertTrue(ex.getMessage().contains("5MB"));
    }

    @Test
    @DisplayName("Reject empty byte array")
    void rejectEmptyData() {
        ValidationException ex = assertThrows(ValidationException.class,
            () -> processor.process(new byte[0], "image/jpeg"));
        assertTrue(ex.getMessage().contains("trống"));
    }

    @Test
    @DisplayName("Reject unsupported or dangerous MIME types (e.g. SVG, GIF)")
    void rejectUnsupportedMime() throws IOException {
        byte[] gifData = new byte[] { 'G', 'I', 'F', '8', '9', 'a', 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00 };
        ValidationException ex = assertThrows(ValidationException.class,
            () -> processor.process(gifData, "image/gif"));
        assertTrue(ex.getMessage().contains("không được hỗ trợ"));

        byte[] svgData = "<svg xmlns='http://www.w3.org/2000/svg'><circle r='10'/></svg>".getBytes(StandardCharsets.UTF_8);
        assertThrows(ValidationException.class, () -> processor.process(svgData, "image/svg+xml"));
    }

    @Test
    @DisplayName("Reject MIME type mismatch where magic bytes do not match header")
    void rejectMimeMismatch() throws IOException {
        byte[] pngData = createTestPngWithAlpha(50, 50);
        ValidationException ex = assertThrows(ValidationException.class,
            () -> processor.process(pngData, "image/jpeg"));
        assertTrue(ex.getMessage().contains("không khớp"));
    }

    @Test
    @DisplayName("Reject corrupted image content")
    void rejectCorruptedImage() {
        byte[] corruptedJpeg = new byte[] { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0x00, 0x01, 0x02, 0x03, 0x04 };
        assertThrows(ValidationException.class, () -> processor.process(corruptedJpeg, "image/jpeg"));
    }

    @Test
    @DisplayName("Reject animated WebP images")
    void rejectAnimatedWebp() {
        // Construct extended WebP (VP8X) with Animation flag (bit 1 of flags set: 0x02)
        byte[] animWebp = new byte[] {
            'R', 'I', 'F', 'F',
            0x1a, 0x00, 0x00, 0x00,
            'W', 'E', 'B', 'P',
            'V', 'P', '8', 'X',
            0x0a, 0x00, 0x00, 0x00, // 10 bytes chunk size
            0x02, 0x00, 0x00, 0x00, // flags with ANIMATION bit (0x02) set
            0x00, 0x00, 0x00,       // canvas width minus one
            0x00, 0x00, 0x00        // canvas height minus one
        };
        ValidationException ex = assertThrows(ValidationException.class,
            () -> processor.process(animWebp, "image/webp"));
        assertTrue(ex.getMessage().contains("động"));
    }
}
