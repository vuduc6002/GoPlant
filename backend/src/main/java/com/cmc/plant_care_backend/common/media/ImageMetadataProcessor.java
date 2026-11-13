package com.cmc.plant_care_backend.common.media;

import com.cmc.plant_care_backend.common.exception.AppException;
import com.cmc.plant_care_backend.common.exception.ValidationException;
import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.Metadata;
import com.drew.metadata.exif.ExifIFD0Directory;
import com.drew.metadata.exif.ExifSubIFDDirectory;
import com.drew.metadata.exif.GpsDirectory;
import com.drew.metadata.iptc.IptcDirectory;
import com.drew.metadata.xmp.XmpDirectory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.*;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Iterator;
import java.util.Set;

@Component
public class ImageMetadataProcessor {

    private static final Logger log = LoggerFactory.getLogger(ImageMetadataProcessor.class);

    public static final long MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5,242,880 bytes (5 MB)
    public static final long MAX_PIXEL_COUNT = 25_000_000L; // 25 Megapixels
    public static final int MAX_DIMENSION = 10_000; // 10,000 pixels

    private static final Set<String> ALLOWED_MIME_TYPES = Set.of(
        "image/jpeg",
        "image/png",
        "image/webp"
    );

    public ProcessedImage process(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ValidationException("Tệp tải lên không được để trống.", "file");
        }

        if (file.getSize() > MAX_FILE_SIZE_BYTES) {
            throw new AppException(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE",
                "Kích thước tệp vượt quá giới hạn tối đa 5MB.", "file");
        }

        byte[] rawBytes;
        try {
            rawBytes = file.getBytes();
        } catch (IOException e) {
            throw new ValidationException("Không thể đọc dữ liệu tệp tải lên.", "file");
        }

        return process(rawBytes, file.getContentType());
    }

    public ProcessedImage process(byte[] rawBytes, String declaredMimeType) {
        if (rawBytes == null || rawBytes.length == 0) {
            throw new ValidationException("Tệp tải lên không được để trống.", "file");
        }

        if (rawBytes.length > MAX_FILE_SIZE_BYTES) {
            throw new AppException(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE",
                "Kích thước tệp vượt quá giới hạn tối đa 5MB.", "file");
        }

        String detectedMime = detectMimeType(rawBytes);
        if (detectedMime == null || !ALLOWED_MIME_TYPES.contains(detectedMime)) {
            throw new ValidationException("Định dạng tệp không được hỗ trợ. Chỉ chấp nhận JPEG, PNG hoặc WebP.", "file");
        }

        if (declaredMimeType != null && !declaredMimeType.trim().isEmpty()) {
            String normalizedDeclared = declaredMimeType.trim().toLowerCase();
            if ("image/jpg".equals(normalizedDeclared)) {
                normalizedDeclared = "image/jpeg";
            }
            if (!normalizedDeclared.equals(detectedMime)) {
                throw new ValidationException("Định dạng tệp khai báo không khớp với định dạng thực tế của tệp.", "file");
            }
        }

        if ("image/webp".equals(detectedMime) && isAnimatedWebP(rawBytes)) {
            throw new ValidationException("Ảnh động WebP không được hỗ trợ trong phạm vi hiện tại.", "file");
        }

        // STEP 1: Decode dimensions BEFORE allocating full raster memory to prevent decompression bombs
        int[] dimensions = extractDimensionsWithoutRaster(rawBytes, detectedMime);
        int width = dimensions[0];
        int height = dimensions[1];

        if (width <= 0 || height <= 0) {
            throw new ValidationException("Kích thước hình ảnh không hợp lệ.", "file");
        }

        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            throw new ValidationException("Kích thước chiều rộng hoặc chiều cao vượt quá giới hạn tối đa " + MAX_DIMENSION + "px.", "file");
        }

        long totalPixels = (long) width * height;
        if (totalPixels > MAX_PIXEL_COUNT) {
            throw new ValidationException("Số lượng pixel hình ảnh (" + totalPixels + ") vượt quá giới hạn tối đa 25MP.", "file");
        }

        // STEP 2: Full decode & strip processing
        int orientation = extractOrientation(rawBytes);
        byte[] processedBytes;
        int finalWidth = width;
        int finalHeight = height;

        if ("image/webp".equals(detectedMime)) {
            // WebP EXIF Orientation: if rotated (> 1), reject fail-closed because
            // re-encoding WebP raster is not supported without native binaries.
            if (orientation > 1) {
                throw new ValidationException(
                    "Hình ảnh WebP chứa thông tin xoay hướng (EXIF orientation=" + orientation + ") không thể xử lý an toàn.", "file");
            }

            // Full decode check using ImageIO WebP plugin
            BufferedImage decodedWebP;
            try (InputStream in = new ByteArrayInputStream(rawBytes)) {
                decodedWebP = ImageIO.read(in);
            } catch (Exception e) {
                throw new ValidationException("Tệp hình ảnh WebP bị lỗi hoặc không thể giải mã.", "file");
            }
            if (decodedWebP == null) {
                throw new ValidationException("Không thể giải mã dữ liệu hình ảnh WebP.", "file");
            }

            // Strip metadata via hardened container parser
            processedBytes = stripWebPMetadata(rawBytes);

            // Verify the stripped WebP can be fully decoded again
            BufferedImage verifiedWebP;
            try (InputStream in = new ByteArrayInputStream(processedBytes)) {
                verifiedWebP = ImageIO.read(in);
            } catch (Exception e) {
                throw new ValidationException("Tệp WebP sau khi loại bỏ siêu dữ liệu không thể giải mã lại.", "file");
            }
            if (verifiedWebP == null) {
                throw new ValidationException("Tệp WebP sau khi xử lý bị lỗi hoặc rỗng.", "file");
            }
            if (verifiedWebP.getWidth() != width || verifiedWebP.getHeight() != height) {
                throw new ValidationException("Kích thước tệp WebP sau khi xử lý không khớp với kích thước ban đầu.", "file");
            }
        } else {
            BufferedImage decodedImage;
            try (InputStream in = new ByteArrayInputStream(rawBytes)) {
                decodedImage = ImageIO.read(in);
            } catch (Exception e) {
                throw new ValidationException("Tệp hình ảnh bị lỗi hoặc không thể giải mã.", "file");
            }

            if (decodedImage == null) {
                throw new ValidationException("Không thể giải mã dữ liệu hình ảnh.", "file");
            }

            // Apply EXIF orientation transformation before stripping
            BufferedImage uprightImage = applyOrientation(decodedImage, orientation);
            finalWidth = uprightImage.getWidth();
            finalHeight = uprightImage.getHeight();

            if ("image/jpeg".equals(detectedMime)) {
                processedBytes = encodeJpeg(uprightImage);
            } else {
                processedBytes = encodePng(uprightImage);
            }
        }

        // Output size constraints
        if (processedBytes == null || processedBytes.length == 0) {
            throw new ValidationException("Dữ liệu hình ảnh sau xử lý rỗng.", "file");
        }
        if (processedBytes.length > MAX_FILE_SIZE_BYTES) {
            throw new AppException(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE",
                "Kích thước tệp sau xử lý vượt quá giới hạn tối đa 5MB.", "file");
        }

        // STEP 3: Fail-closed metadata verification
        verifyNoSensitiveMetadata(processedBytes);

        String sha256 = calculateSha256(processedBytes);

        return new ProcessedImage(
            processedBytes,
            detectedMime,
            finalWidth,
            finalHeight,
            processedBytes.length,
            sha256
        );
    }

    public static int[] extractDimensionsWithoutRaster(byte[] rawBytes, String detectedMime) {
        if ("image/webp".equals(detectedMime)) {
            int[] dims = extractWebPDimensions(rawBytes);
            if (dims != null && dims[0] > 0 && dims[1] > 0) {
                return dims;
            }
        }

        try (ByteArrayInputStream bais = new ByteArrayInputStream(rawBytes);
             ImageInputStream iis = ImageIO.createImageInputStream(bais)) {
            if (iis == null) {
                throw new ValidationException("Không thể đọc luồng dữ liệu hình ảnh.", "file");
            }
            Iterator<ImageReader> readers = ImageIO.getImageReaders(iis);
            if (!readers.hasNext()) {
                throw new ValidationException("Định dạng hình ảnh không được hỗ trợ bởi hệ thống giải mã.", "file");
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(iis, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                return new int[] { width, height };
            } finally {
                reader.dispose();
            }
        } catch (ValidationException ve) {
            throw ve;
        } catch (Exception e) {
            throw new ValidationException("Không thể đọc thông số kích thước hình ảnh.", "file");
        }
    }

    public static String detectMimeType(byte[] bytes) {
        if (bytes == null || bytes.length < 12) {
            return null;
        }

        // JPEG: FF D8 FF
        if ((bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8 && (bytes[2] & 0xFF) == 0xFF) {
            return "image/jpeg";
        }

        // PNG: 89 50 4E 47 0D 0A 1A 0A
        if (bytes.length >= 8
            && (bytes[0] & 0xFF) == 0x89 && (bytes[1] & 0xFF) == 0x50
            && (bytes[2] & 0xFF) == 0x4E && (bytes[3] & 0xFF) == 0x47
            && (bytes[4] & 0xFF) == 0x0D && (bytes[5] & 0xFF) == 0x0A
            && (bytes[6] & 0xFF) == 0x1A && (bytes[7] & 0xFF) == 0x0A) {
            return "image/png";
        }

        // WebP: RIFF .... WEBP
        if (bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
            && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P') {
            return "image/webp";
        }

        return null;
    }

    private int extractOrientation(byte[] bytes) {
        try (InputStream in = new ByteArrayInputStream(bytes)) {
            Metadata metadata = ImageMetadataReader.readMetadata(in);
            ExifIFD0Directory dir = metadata.getFirstDirectoryOfType(ExifIFD0Directory.class);
            if (dir != null && dir.containsTag(ExifIFD0Directory.TAG_ORIENTATION)) {
                return dir.getInt(ExifIFD0Directory.TAG_ORIENTATION);
            }
        } catch (Exception ignored) {
            // Default to normal orientation (1)
        }
        return 1;
    }

    public static BufferedImage applyOrientation(BufferedImage source, int orientation) {
        if (orientation <= 1 || orientation > 8) {
            return source;
        }

        int width = source.getWidth();
        int height = source.getHeight();
        AffineTransform transform = new AffineTransform();

        int newWidth = width;
        int newHeight = height;

        switch (orientation) {
            case 2: // Flip X
                transform.scale(-1.0, 1.0);
                transform.translate(-width, 0);
                break;
            case 3: // 180 deg
                transform.translate(width, height);
                transform.rotate(Math.PI);
                break;
            case 4: // Flip Y
                transform.scale(1.0, -1.0);
                transform.translate(0, -height);
                break;
            case 5: // -90 deg and Flip X
                newWidth = height;
                newHeight = width;
                transform.rotate(-Math.PI / 2);
                transform.scale(-1.0, 1.0);
                break;
            case 6: // 90 deg CW
                newWidth = height;
                newHeight = width;
                transform.translate(height, 0);
                transform.rotate(Math.PI / 2);
                break;
            case 7: // 90 deg and Flip
                newWidth = height;
                newHeight = width;
                transform.scale(-1.0, 1.0);
                transform.translate(-height, 0);
                transform.translate(0, width);
                transform.rotate(3 * Math.PI / 2);
                break;
            case 8: // 270 deg CW
                newWidth = height;
                newHeight = width;
                transform.translate(0, width);
                transform.rotate(3 * Math.PI / 2);
                break;
            default:
                return source;
        }

        int imageType = source.getType() == BufferedImage.TYPE_CUSTOM || source.getType() == 0
            ? BufferedImage.TYPE_INT_ARGB
            : source.getType();
        BufferedImage destination = new BufferedImage(newWidth, newHeight, imageType);
        Graphics2D g2d = destination.createGraphics();
        g2d.drawImage(source, transform, null);
        g2d.dispose();
        return destination;
    }

    private byte[] encodeJpeg(BufferedImage image) {
        BufferedImage rgbImage;
        if (image.getType() == BufferedImage.TYPE_INT_RGB) {
            rgbImage = image;
        } else {
            rgbImage = new BufferedImage(image.getWidth(), image.getHeight(), BufferedImage.TYPE_INT_RGB);
            Graphics2D g = rgbImage.createGraphics();
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, image.getWidth(), image.getHeight());
            g.drawImage(image, 0, 0, null);
            g.dispose();
        }

        try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            boolean success = ImageIO.write(rgbImage, "JPEG", baos);
            if (!success) {
                throw new ValidationException("Không thể mã hóa lại hình ảnh JPEG.", "file");
            }
            return baos.toByteArray();
        } catch (IOException e) {
            throw new ValidationException("Lỗi trong quá trình mã hóa JPEG: " + e.getMessage(), "file");
        }
    }

    private byte[] encodePng(BufferedImage image) {
        try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            boolean success = ImageIO.write(image, "PNG", baos);
            if (!success) {
                throw new ValidationException("Không thể mã hóa lại hình ảnh PNG.", "file");
            }
            return baos.toByteArray();
        } catch (IOException e) {
            throw new ValidationException("Lỗi trong quá trình mã hóa PNG: " + e.getMessage(), "file");
        }
    }

    private boolean isAnimatedWebP(byte[] webpBytes) {
        if (webpBytes == null || webpBytes.length < 12) {
            return false;
        }

        if (webpBytes[0] != 'R' || webpBytes[1] != 'I' || webpBytes[2] != 'F' || webpBytes[3] != 'F'
            || webpBytes[8] != 'W' || webpBytes[9] != 'E' || webpBytes[10] != 'B' || webpBytes[11] != 'P') {
            return false;
        }

        long declaredRiffSize = readUint32LE(webpBytes, 4);
        long riffEndOffset = Math.min((long) webpBytes.length, declaredRiffSize + 8L);

        long offset = 12L;
        while (offset + 8L <= riffEndOffset) {
            String fourCC = new String(webpBytes, (int) offset, 4, StandardCharsets.US_ASCII);
            long chunkSize = readUint32LE(webpBytes, (int) (offset + 4));
            long padding = (chunkSize % 2 != 0) ? 1L : 0L;

            if (chunkSize < 0 || offset + 8L + chunkSize + padding > riffEndOffset) {
                throw new ValidationException("Cấu trúc chunk WebP bị lỗi hoặc vượt quá giới hạn tệp.", "file");
            }

            if ("ANIM".equals(fourCC) || "ANMF".equals(fourCC)) {
                return true;
            }

            if ("VP8X".equals(fourCC) && offset + 9L <= riffEndOffset) {
                byte flags = webpBytes[(int) (offset + 8)];
                if ((flags & 0x02) != 0) { // Animation bit
                    return true;
                }
            }

            offset += 8L + chunkSize + padding;
        }

        return false;
    }

    public static byte[] stripWebPMetadata(byte[] webpBytes) {
        if (webpBytes == null || webpBytes.length < 12) {
            throw new ValidationException("Tệp WebP không đủ độ dài tối thiểu.", "file");
        }

        if (webpBytes[0] != 'R' || webpBytes[1] != 'I' || webpBytes[2] != 'F' || webpBytes[3] != 'F'
            || webpBytes[8] != 'W' || webpBytes[9] != 'E' || webpBytes[10] != 'B' || webpBytes[11] != 'P') {
            throw new ValidationException("Định dạng container WebP không hợp lệ.", "file");
        }

        long declaredRiffSize = readUint32LE(webpBytes, 4);
        long expectedTotalLength = declaredRiffSize + 8L;
        if (declaredRiffSize < 4L || expectedTotalLength != webpBytes.length) {
            throw new ValidationException("Kích thước khai báo trong container WebP không khớp độ dài dữ liệu tệp (khai báo: "
                + declaredRiffSize + ", thực tế: " + (webpBytes.length - 8L) + ").", "file");
        }

        long riffEndOffset = expectedTotalLength;
        ByteArrayOutputStream outChunks = new ByteArrayOutputStream();
        long offset = 12L;
        int imageChunkCount = 0;
        boolean hasVp8x = false;

        while (offset < riffEndOffset) {
            if (offset + 8L > riffEndOffset) {
                throw new ValidationException("Chunk WebP bị cắt cụt header tại offset " + offset, "file");
            }

            String fourCC = new String(webpBytes, (int) offset, 4, StandardCharsets.US_ASCII);
            long chunkSizeLong = readUint32LE(webpBytes, (int) (offset + 4));
            long padding = (chunkSizeLong % 2 != 0) ? 1L : 0L;
            long nextOffset = offset + 8L + chunkSizeLong + padding;

            if (chunkSizeLong < 0 || offset + 8L + chunkSizeLong > riffEndOffset || nextOffset > riffEndOffset) {
                throw new ValidationException("Kích thước chunk '" + fourCC + "' (" + chunkSizeLong + " bytes) vượt quá giới hạn container RIFF.", "file");
            }

            int chunkSize = (int) chunkSizeLong;
            int offsetInt = (int) offset;
            int payloadOffset = offsetInt + 8;

            if ("VP8X".equals(fourCC)) {
                if (hasVp8x) {
                    throw new ValidationException("Tệp WebP chứa nhiều hơn một chunk VP8X.", "file");
                }
                hasVp8x = true;
                if (chunkSize < 10) {
                    throw new ValidationException("Chunk VP8X quá ngắn (" + chunkSize + " bytes, tối thiểu 10 bytes).", "file");
                }

                byte[] vp8xData = new byte[chunkSize];
                System.arraycopy(webpBytes, payloadOffset, vp8xData, 0, chunkSize);
                if (vp8xData.length > 0) {
                    // Clear bit 2 (XMP), bit 3 (EXIF), and bit 1 (Animation)
                    vp8xData[0] = (byte) (vp8xData[0] & ~0x0E);
                }

                outChunks.write(webpBytes, offsetInt, 4); // FourCC
                writeUint32LE(outChunks, chunkSize);
                outChunks.write(vp8xData, 0, chunkSize);
                if (padding > 0) {
                    outChunks.write(0);
                }
                offset = nextOffset;
                continue;
            }

            if ("VP8 ".equals(fourCC)) {
                if (chunkSize < 10) {
                    throw new ValidationException("Chunk VP8 quá ngắn (" + chunkSize + " bytes, tối thiểu 10 bytes).", "file");
                }
                imageChunkCount++;
            }

            if ("VP8L".equals(fourCC)) {
                if (chunkSize < 5) {
                    throw new ValidationException("Chunk VP8L quá ngắn (" + chunkSize + " bytes, tối thiểu 5 bytes).", "file");
                }
                if (webpBytes[payloadOffset] != 0x2F) {
                    throw new ValidationException("Chunk VP8L thiếu signature byte 0x2F.", "file");
                }
                imageChunkCount++;
            }

            if ("EXIF".equals(fourCC) || "XMP ".equals(fourCC)) {
                // Strip EXIF and XMP chunks
                offset = nextOffset;
                continue;
            }

            // Write all other valid chunks
            outChunks.write(webpBytes, offsetInt, (int) (8L + chunkSizeLong + padding));
            offset = nextOffset;
        }

        if (imageChunkCount == 0) {
            throw new ValidationException("Tệp WebP thiếu dữ liệu hình ảnh (VP8/VP8L).", "file");
        }
        if (imageChunkCount > 1) {
            throw new ValidationException("Tệp WebP chứa nhiều chunk hình ảnh mâu thuẫn (imageChunkCount=" + imageChunkCount + ").", "file");
        }

        byte[] payload = outChunks.toByteArray();
        ByteArrayOutputStream finalWebP = new ByteArrayOutputStream();
        finalWebP.write('R'); finalWebP.write('I'); finalWebP.write('F'); finalWebP.write('F');
        writeUint32LE(finalWebP, payload.length + 4L);
        finalWebP.write('W'); finalWebP.write('E'); finalWebP.write('B'); finalWebP.write('P');
        try {
            finalWebP.write(payload);
        } catch (IOException e) {
            throw new ValidationException("Không thể ghi container WebP sau khi loại bỏ siêu dữ liệu.", "file");
        }

        return finalWebP.toByteArray();
    }

    private static long readUint32LE(byte[] bytes, int offset) {
        return (bytes[offset] & 0xFFL)
            | ((bytes[offset + 1] & 0xFFL) << 8)
            | ((bytes[offset + 2] & 0xFFL) << 16)
            | ((bytes[offset + 3] & 0xFFL) << 24);
    }

    public static int[] extractWebPDimensions(byte[] bytes) {
        if (bytes == null || bytes.length < 24) {
            return null;
        }
        long offset = 12L;
        while (offset + 8L <= bytes.length) {
            String fourCC = new String(bytes, (int) offset, 4, StandardCharsets.US_ASCII);
            long chunkSize = readUint32LE(bytes, (int) (offset + 4));
            long chunkDataOffset = offset + 8L;
            long padding = (chunkSize % 2 != 0) ? 1L : 0L;

            if (chunkSize < 0 || chunkDataOffset + chunkSize + padding > bytes.length) {
                return null;
            }

            int chunkDataOffsetInt = (int) chunkDataOffset;

            if ("VP8X".equals(fourCC) && chunkDataOffset + 10L <= bytes.length) {
                int canvasWidth = 1 + ((bytes[chunkDataOffsetInt + 4] & 0xFF)
                    | ((bytes[chunkDataOffsetInt + 5] & 0xFF) << 8)
                    | ((bytes[chunkDataOffsetInt + 6] & 0xFF) << 16));
                int canvasHeight = 1 + ((bytes[chunkDataOffsetInt + 7] & 0xFF)
                    | ((bytes[chunkDataOffsetInt + 8] & 0xFF) << 8)
                    | ((bytes[chunkDataOffsetInt + 9] & 0xFF) << 16));
                return new int[] { canvasWidth, canvasHeight };
            }

            if ("VP8 ".equals(fourCC) && chunkDataOffset + 10L <= bytes.length) {
                if ((bytes[chunkDataOffsetInt + 3] & 0xFF) == 0x9D
                    && (bytes[chunkDataOffsetInt + 4] & 0xFF) == 0x01
                    && (bytes[chunkDataOffsetInt + 5] & 0xFF) == 0x2A) {
                    int w = (bytes[chunkDataOffsetInt + 6] & 0xFF) | ((bytes[chunkDataOffsetInt + 7] & 0x3F) << 8);
                    int h = (bytes[chunkDataOffsetInt + 8] & 0xFF) | ((bytes[chunkDataOffsetInt + 9] & 0x3F) << 8);
                    return new int[] { w, h };
                }
            }

            if ("VP8L".equals(fourCC) && chunkDataOffset + 5L <= bytes.length) {
                if (bytes[chunkDataOffsetInt] == 0x2F) {
                    int b1 = bytes[chunkDataOffsetInt + 1] & 0xFF;
                    int b2 = bytes[chunkDataOffsetInt + 2] & 0xFF;
                    int b3 = bytes[chunkDataOffsetInt + 3] & 0xFF;
                    int b4 = bytes[chunkDataOffsetInt + 4] & 0xFF;
                    int packed = b1 | (b2 << 8) | (b3 << 16) | (b4 << 24);
                    int w = 1 + (packed & 0x3FFF);
                    int h = 1 + ((packed >>> 14) & 0x3FFF);
                    return new int[] { w, h };
                }
            }

            offset += 8L + chunkSize + padding;
        }
        return null;
    }

    private static void writeUint32LE(ByteArrayOutputStream out, long value) {
        out.write((int) (value & 0xFF));
        out.write((int) ((value >> 8) & 0xFF));
        out.write((int) ((value >> 16) & 0xFF));
        out.write((int) ((value >> 24) & 0xFF));
    }

    private void verifyNoSensitiveMetadata(byte[] bytes) {
        try (InputStream in = new ByteArrayInputStream(bytes)) {
            Metadata metadata = ImageMetadataReader.readMetadata(in);

            GpsDirectory gpsDir = metadata.getFirstDirectoryOfType(GpsDirectory.class);
            if (gpsDir != null && !gpsDir.getTags().isEmpty()) {
                throw new ValidationException("Không thể loại bỏ siêu dữ liệu GPS khỏi hình ảnh.", "file");
            }

            ExifIFD0Directory ifd0 = metadata.getFirstDirectoryOfType(ExifIFD0Directory.class);
            if (ifd0 != null) {
                if (ifd0.containsTag(ExifIFD0Directory.TAG_MAKE) || ifd0.containsTag(ExifIFD0Directory.TAG_MODEL)) {
                    throw new ValidationException("Không thể loại bỏ thông tin thiết bị máy ảnh (Make/Model) khỏi hình ảnh.", "file");
                }
                if (ifd0.containsTag(ExifIFD0Directory.TAG_DATETIME)) {
                    throw new ValidationException("Không thể loại bỏ thời gian chụp khỏi hình ảnh.", "file");
                }
            }

            ExifSubIFDDirectory subIFD = metadata.getFirstDirectoryOfType(ExifSubIFDDirectory.class);
            if (subIFD != null && subIFD.containsTag(ExifSubIFDDirectory.TAG_DATETIME_ORIGINAL)) {
                throw new ValidationException("Không thể loại bỏ thời gian chụp gốc khỏi hình ảnh.", "file");
            }

            XmpDirectory xmp = metadata.getFirstDirectoryOfType(XmpDirectory.class);
            if (xmp != null && !xmp.getTags().isEmpty()) {
                throw new ValidationException("Không thể loại bỏ siêu dữ liệu XMP khỏi hình ảnh.", "file");
            }

            IptcDirectory iptc = metadata.getFirstDirectoryOfType(IptcDirectory.class);
            if (iptc != null && !iptc.getTags().isEmpty()) {
                throw new ValidationException("Không thể loại bỏ siêu dữ liệu IPTC khỏi hình ảnh.", "file");
            }
        } catch (ValidationException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ValidationException("Không thể xác minh tính toàn vẹn và an toàn của siêu dữ liệu hình ảnh: " + ex.getMessage(), "file");
        }
    }

    public static String calculateSha256(byte[] data) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(data);
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("Thuật toán SHA-256 không khả dụng trên hệ thống JVM.", e);
        }
    }
}
