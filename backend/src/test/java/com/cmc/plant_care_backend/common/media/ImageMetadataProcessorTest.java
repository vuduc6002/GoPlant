package com.cmc.plant_care_backend.common.media;

import com.cmc.plant_care_backend.common.exception.AppException;
import com.cmc.plant_care_backend.common.exception.ValidationException;
import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.Metadata;
import com.drew.metadata.exif.ExifIFD0Directory;
import com.drew.metadata.exif.ExifSubIFDDirectory;
import com.drew.metadata.exif.GpsDirectory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

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
        // Authentic valid 1x1 lossless (VP8L) WebP
        return java.util.Base64.getDecoder().decode("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==");
    }

    private byte[] createWebpWithExif() throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        byte[] vp8lData = new byte[] {
            0x2f, 0x00, 0x00, 0x00, 0x10, 0x07, 0x10, 0x11, 0x11, (byte) 0x88, (byte) 0x88, (byte) 0xfe, 0x07
        };

        // Exif chunk: minimal TIFF header + 1 tag (Make = "GoPlantCam")
        byte[] exifChunkPayload = "Exif\0\0II*\0\b\0\0\0\1\0\17\1\2\0\13\0\0\0\32\0\0\0\0\0\0\0GoPlantCam\0".getBytes(StandardCharsets.US_ASCII);
        int exifPadding = (exifChunkPayload.length % 2 != 0) ? 1 : 0;
        int vp8lPadding = (vp8lData.length % 2 != 0) ? 1 : 0;

        int vp8xChunkLen = 10;
        int exifChunkLen = 8 + exifChunkPayload.length + exifPadding;
        int vp8lChunkLen = 8 + vp8lData.length + vp8lPadding;
        int totalPayload = 4 + (8 + vp8xChunkLen) + exifChunkLen + vp8lChunkLen;

        baos.write('R'); baos.write('I'); baos.write('F'); baos.write('F');
        // 4 bytes size
        baos.write(totalPayload & 0xFF);
        baos.write((totalPayload >> 8) & 0xFF);
        baos.write((totalPayload >> 16) & 0xFF);
        baos.write((totalPayload >> 24) & 0xFF);

        baos.write('W'); baos.write('E'); baos.write('B'); baos.write('P');

        // VP8X chunk with EXIF bit set (bit 3: 0x08)
        baos.write('V'); baos.write('P'); baos.write('8'); baos.write('X');
        baos.write(10); baos.write(0); baos.write(0); baos.write(0);
        baos.write(0x08); baos.write(0); baos.write(0); baos.write(0); // flags
        baos.write(0); baos.write(0); baos.write(0); // width - 1 = 0 (1px)
        baos.write(0); baos.write(0); baos.write(0); // height - 1 = 0 (1px)

        // EXIF chunk
        baos.write('E'); baos.write('X'); baos.write('I'); baos.write('F');
        baos.write(exifChunkPayload.length & 0xFF);
        baos.write((exifChunkPayload.length >> 8) & 0xFF);
        baos.write((exifChunkPayload.length >> 16) & 0xFF);
        baos.write((exifChunkPayload.length >> 24) & 0xFF);
        baos.write(exifChunkPayload);
        if (exifPadding > 0) baos.write(0);

        // VP8L chunk
        baos.write('V'); baos.write('P'); baos.write('8'); baos.write('L');
        baos.write(vp8lData.length & 0xFF);
        baos.write((vp8lData.length >> 8) & 0xFF);
        baos.write((vp8lData.length >> 16) & 0xFF);
        baos.write((vp8lData.length >> 24) & 0xFF);
        baos.write(vp8lData);
        if (vp8lPadding > 0) baos.write(0);

        return baos.toByteArray();
    }

    @Test
    @DisplayName("Genuine JPEG with EXIF: parser confirms input has GPS, Make, Model, DateTime; processor strips all sensitive metadata")
    void processJpeg_WithGenuineExif_VerifiesInputAndStripsOutput() throws Exception {
        byte[] inputWithExif = ExifTestFixtureGenerator.createJpegWithSensitiveExif(120, 80, 1);

        // 1. Verify input REALLY contains sensitive EXIF metadata before processing
        Metadata inMeta = ImageMetadataReader.readMetadata(new ByteArrayInputStream(inputWithExif));
        GpsDirectory inGps = inMeta.getFirstDirectoryOfType(GpsDirectory.class);
        assertNotNull(inGps, "Input test fixture must contain GPSDirectory");
        assertTrue(inGps.getTagCount() >= 2, "Input fixture must contain GPS tags");

        ExifIFD0Directory inIfd0 = inMeta.getFirstDirectoryOfType(ExifIFD0Directory.class);
        assertNotNull(inIfd0, "Input test fixture must contain ExifIFD0Directory");
        assertEquals("GoPlantCam", inIfd0.getString(ExifIFD0Directory.TAG_MAKE));
        assertEquals("TestBot-2026", inIfd0.getString(ExifIFD0Directory.TAG_MODEL));

        ExifSubIFDDirectory inSubIfd = inMeta.getFirstDirectoryOfType(ExifSubIFDDirectory.class);
        assertNotNull(inSubIfd, "Input test fixture must contain ExifSubIFDDirectory");
        assertEquals("2026:01:01 10:00:00", inSubIfd.getString(ExifSubIFDDirectory.TAG_DATETIME_ORIGINAL));

        // 2. Process image through processor
        ProcessedImage result = processor.process(inputWithExif, "image/jpeg");

        assertNotNull(result);
        assertEquals("image/jpeg", result.getMimeType());
        assertEquals(120, result.getWidth());
        assertEquals(80, result.getHeight());
        assertEquals(result.getBytes().length, result.getSizeBytes());
        assertEquals(ImageMetadataProcessor.calculateSha256(result.getBytes()), result.getSha256());

        // 3. Verify output image is decodable
        BufferedImage outImage = ImageIO.read(new ByteArrayInputStream(result.getBytes()));
        assertNotNull(outImage, "Output JPEG must be decodable");
        assertEquals(120, outImage.getWidth());
        assertEquals(80, outImage.getHeight());

        // 4. Verify output image NO LONGER contains sensitive metadata
        Metadata outMeta = ImageMetadataReader.readMetadata(new ByteArrayInputStream(result.getBytes()));
        GpsDirectory outGps = outMeta.getFirstDirectoryOfType(GpsDirectory.class);
        assertTrue(outGps == null || outGps.getTagCount() == 0, "Processed JPEG must not contain any GPS metadata");

        ExifIFD0Directory outIfd0 = outMeta.getFirstDirectoryOfType(ExifIFD0Directory.class);
        if (outIfd0 != null) {
            assertNull(outIfd0.getString(ExifIFD0Directory.TAG_MAKE), "Processed JPEG must not contain Camera Make");
            assertNull(outIfd0.getString(ExifIFD0Directory.TAG_MODEL), "Processed JPEG must not contain Camera Model");
            assertNull(outIfd0.getString(ExifIFD0Directory.TAG_DATETIME), "Processed JPEG must not contain DateTime");
        }

        ExifSubIFDDirectory outSubIfd = outMeta.getFirstDirectoryOfType(ExifSubIFDDirectory.class);
        if (outSubIfd != null) {
            assertNull(outSubIfd.getString(ExifSubIFDDirectory.TAG_DATETIME_ORIGINAL), "Processed JPEG must not contain DateTimeOriginal");
        }
    }

    @ParameterizedTest
    @ValueSource(ints = { 1, 2, 3, 4, 5, 6, 7, 8 })
    @DisplayName("EXIF orientation 1 through 8 are correctly applied and normalized upright")
    void processJpeg_Orientations1Through8_NormalizedUpright(int orientation) throws Exception {
        int origWidth = 100;
        int origHeight = 60;
        byte[] input = ExifTestFixtureGenerator.createJpegWithSensitiveExif(origWidth, origHeight, orientation);

        ProcessedImage result = processor.process(input, "image/jpeg");
        assertNotNull(result);

        // Orientations 5, 6, 7, 8 rotate 90 or 270 degrees, swapping width and height
        if (orientation >= 5 && orientation <= 8) {
            assertEquals(origHeight, result.getWidth(), "Orientation " + orientation + " should swap width to height");
            assertEquals(origWidth, result.getHeight(), "Orientation " + orientation + " should swap height to width");
        } else {
            assertEquals(origWidth, result.getWidth());
            assertEquals(origHeight, result.getHeight());
        }

        // Verify output decodability
        BufferedImage outImage = ImageIO.read(new ByteArrayInputStream(result.getBytes()));
        assertNotNull(outImage);
        assertEquals(result.getWidth(), outImage.getWidth());
        assertEquals(result.getHeight(), outImage.getHeight());
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

        assertEquals((byte) 0x89, result.getBytes()[0]);
        assertEquals((byte) 'P', result.getBytes()[1]);
        assertEquals((byte) 'N', result.getBytes()[2]);
        assertEquals((byte) 'G', result.getBytes()[3]);
    }

    @Test
    @DisplayName("Process valid minimal WebP image: decodes and strips container metadata")
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

        assertEquals('R', result.getBytes()[0]);
        assertEquals('I', result.getBytes()[1]);
        assertEquals('F', result.getBytes()[2]);
        assertEquals('F', result.getBytes()[3]);
    }

    @Test
    @DisplayName("Process WebP with EXIF metadata: strips EXIF chunk and ensures output is decodable without EXIF")
    void processWebp_WithExif_StripsMetadataAndDecodes() throws Exception {
        byte[] input = createWebpWithExif();
        ProcessedImage result = processor.process(input, "image/webp");

        assertNotNull(result);
        assertEquals("image/webp", result.getMimeType());
        assertEquals(1, result.getWidth());
        assertEquals(1, result.getHeight());
        assertTrue(result.getBytes().length > 0);

        // Verify output decodes cleanly
        BufferedImage outImage = ImageIO.read(new ByteArrayInputStream(result.getBytes()));
        assertNotNull(outImage);
        assertEquals(1, outImage.getWidth());
        assertEquals(1, outImage.getHeight());

        // Verify no EXIF in stripped WebP
        Metadata outMeta = ImageMetadataReader.readMetadata(new ByteArrayInputStream(result.getBytes()));
        ExifIFD0Directory ifd0 = outMeta.getFirstDirectoryOfType(ExifIFD0Directory.class);
        assertTrue(ifd0 == null || ifd0.getTagCount() == 0 || !ifd0.containsTag(ExifIFD0Directory.TAG_MAKE));
    }

    @Test
    @DisplayName("Reject file exceeding maximum size (5 MB)")
    void rejectOversizedFile() {
        byte[] largeData = new byte[5 * 1024 * 1024 + 1];
        AppException ex = assertThrows(AppException.class,
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
    @DisplayName("Reject animated WebP images with VP8X animation bit set")
    void rejectAnimatedWebp_FlagsBit() {
        byte[] animWebp = new byte[] {
            'R', 'I', 'F', 'F',
            0x1a, 0x00, 0x00, 0x00,
            'W', 'E', 'B', 'P',
            'V', 'P', '8', 'X',
            0x0a, 0x00, 0x00, 0x00,
            0x02, 0x00, 0x00, 0x00, // ANIMATION bit set
            0x00, 0x00, 0x00,
            0x00, 0x00, 0x00
        };
        ValidationException ex = assertThrows(ValidationException.class,
            () -> processor.process(animWebp, "image/webp"));
        assertTrue(ex.getMessage().contains("động"));
    }

    @Test
    @DisplayName("Reject animated WebP images with ANIM chunk")
    void rejectAnimatedWebp_AnimChunk() {
        byte[] animChunkWebp = new byte[] {
            'R', 'I', 'F', 'F',
            0x20, 0x00, 0x00, 0x00,
            'W', 'E', 'B', 'P',
            'A', 'N', 'I', 'M',
            0x06, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00
        };
        ValidationException ex = assertThrows(ValidationException.class,
            () -> processor.process(animChunkWebp, "image/webp"));
        assertTrue(ex.getMessage().contains("động"));
    }

    @Test
    @DisplayName("Reject WebP with truncated chunk header or length")
    void rejectTruncatedWebpChunk() {
        byte[] truncated = new byte[] {
            'R', 'I', 'F', 'F',
            0x30, 0x00, 0x00, 0x00,
            'W', 'E', 'B', 'P',
            'V', 'P', '8', ' '
            // missing chunk length and payload
        };
        assertThrows(ValidationException.class, () -> processor.process(truncated, "image/webp"));
    }

    @Test
    @DisplayName("Reject WebP missing image payload (no VP8 or VP8L chunk)")
    void rejectWebpWithoutImagePayload() {
        byte[] noPayload = new byte[] {
            'R', 'I', 'F', 'F',
            0x10, 0x00, 0x00, 0x00,
            'W', 'E', 'B', 'P',
            'I', 'C', 'C', 'P',
            0x02, 0x00, 0x00, 0x00,
            0x01, 0x02
        };
        assertThrows(ValidationException.class, () -> processor.process(noPayload, "image/webp"));
    }
}
