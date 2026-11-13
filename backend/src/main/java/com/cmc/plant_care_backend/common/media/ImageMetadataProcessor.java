package com.cmc.plant_care_backend.common.media;

import com.cmc.plant_care_backend.common.exception.AppException;
import com.cmc.plant_care_backend.common.exception.ValidationException;
import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.Directory;
import com.drew.metadata.Metadata;
import com.drew.metadata.exif.ExifIFD0Directory;
import com.drew.metadata.exif.ExifSubIFDDirectory;
import com.drew.metadata.exif.GpsDirectory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
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

        int orientation = extractOrientation(rawBytes);

        BufferedImage decodedImage = null;
        int width;
        int height;

        if ("image/webp".equals(detectedMime)) {
            try (InputStream in = new ByteArrayInputStream(rawBytes)) {
                decodedImage = ImageIO.read(in);
            } catch (Exception ignored) {
            }

            if (decodedImage != null) {
                width = decodedImage.getWidth();
                height = decodedImage.getHeight();
            } else {
                int[] dims = extractWebPDimensions(rawBytes);
                if (dims == null) {
                    throw new ValidationException("Tệp hình ảnh bị lỗi hoặc không thể giải mã.", "file");
                }
                width = dims[0];
                height = dims[1];
            }
        } else {
            try (InputStream in = new ByteArrayInputStream(rawBytes)) {
                decodedImage = ImageIO.read(in);
            } catch (Exception e) {
                throw new ValidationException("Tệp hình ảnh bị lỗi hoặc không thể giải mã.", "file");
            }

            if (decodedImage == null) {
                throw new ValidationException("Không thể giải mã dữ liệu hình ảnh.", "file");
            }

            width = decodedImage.getWidth();
            height = decodedImage.getHeight();
        }

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

        byte[] processedBytes;
        int finalWidth = width;
        int finalHeight = height;

        if ("image/webp".equals(detectedMime)) {
            processedBytes = stripWebPMetadata(rawBytes);
        } else {
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
            // If metadata unreadable or tag missing, default to 1 (normal)
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
        if (webpBytes == null || webpBytes.length < 20) {
            return false;
        }

        int offset = 12;
        while (offset + 8 <= webpBytes.length) {
            String fourCC = new String(webpBytes, offset, 4);
            long chunkSize = readUint32LE(webpBytes, offset + 4);

            if ("ANIM".equals(fourCC) || "ANMF".equals(fourCC)) {
                return true;
            }

            if ("VP8X".equals(fourCC) && offset + 8 < webpBytes.length) {
                byte flags = webpBytes[offset + 8];
                if ((flags & 0x02) != 0) { // Animation bit
                    return true;
                }
            }

            offset += 8 + chunkSize + (chunkSize % 2 != 0 ? 1 : 0);
        }

        return false;
    }

    public static byte[] stripWebPMetadata(byte[] webpBytes) {
        if (webpBytes == null || webpBytes.length < 12) {
            return webpBytes;
        }

        ByteArrayOutputStream outChunks = new ByteArrayOutputStream();
        int offset = 12;

        while (offset + 8 <= webpBytes.length) {
            String fourCC = new String(webpBytes, offset, 4);
            int chunkSize = (int) readUint32LE(webpBytes, offset + 4);
            int padding = (chunkSize % 2 != 0) ? 1 : 0;

            if (offset + 8 + chunkSize > webpBytes.length) {
                break; // Corrupt chunk
            }

            if ("EXIF".equals(fourCC) || "XMP ".equals(fourCC)) {
                // Skip EXIF and XMP chunks
                offset += 8 + chunkSize + padding;
                continue;
            }

            if ("VP8X".equals(fourCC)) {
                byte[] vp8xData = new byte[chunkSize];
                System.arraycopy(webpBytes, offset + 8, vp8xData, 0, chunkSize);
                if (vp8xData.length > 0) {
                    // Clear bit 2 (XMP) and bit 3 (EXIF)
                    vp8xData[0] = (byte) (vp8xData[0] & ~0x0C);
                }

                outChunks.write(webpBytes, offset, 4); // FourCC
                writeUint32LE(outChunks, chunkSize);
                outChunks.write(vp8xData, 0, chunkSize);
                if (padding > 0) {
                    outChunks.write(0);
                }
                offset += 8 + chunkSize + padding;
                continue;
            }

            // Write all other chunks as is
            outChunks.write(webpBytes, offset, 8 + chunkSize + padding);
            offset += 8 + chunkSize + padding;
        }

        byte[] payload = outChunks.toByteArray();
        ByteArrayOutputStream finalWebP = new ByteArrayOutputStream();
        finalWebP.write('R'); finalWebP.write('I'); finalWebP.write('F'); finalWebP.write('F');
        writeUint32LE(finalWebP, payload.length + 4);
        finalWebP.write('W'); finalWebP.write('E'); finalWebP.write('B'); finalWebP.write('P');
        try {
            finalWebP.write(payload);
        } catch (IOException ignored) {}

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
        int offset = 12;
        while (offset + 8 <= bytes.length) {
            String fourCC = new String(bytes, offset, 4, StandardCharsets.US_ASCII);
            long chunkSize = readUint32LE(bytes, offset + 4);
            int chunkDataOffset = offset + 8;
            int padding = (chunkSize % 2 != 0) ? 1 : 0;

            if ("VP8X".equals(fourCC) && chunkDataOffset + 10 <= bytes.length) {
                int canvasWidth = 1 + ((bytes[chunkDataOffset + 4] & 0xFF)
                    | ((bytes[chunkDataOffset + 5] & 0xFF) << 8)
                    | ((bytes[chunkDataOffset + 6] & 0xFF) << 16));
                int canvasHeight = 1 + ((bytes[chunkDataOffset + 7] & 0xFF)
                    | ((bytes[chunkDataOffset + 8] & 0xFF) << 8)
                    | ((bytes[chunkDataOffset + 9] & 0xFF) << 16));
                return new int[] { canvasWidth, canvasHeight };
            }

            if ("VP8 ".equals(fourCC) && chunkDataOffset + 10 <= bytes.length) {
                if ((bytes[chunkDataOffset + 3] & 0xFF) == 0x9D
                    && (bytes[chunkDataOffset + 4] & 0xFF) == 0x01
                    && (bytes[chunkDataOffset + 5] & 0xFF) == 0x2A) {
                    int w = (bytes[chunkDataOffset + 6] & 0xFF) | ((bytes[chunkDataOffset + 7] & 0x3F) << 8);
                    int h = (bytes[chunkDataOffset + 8] & 0xFF) | ((bytes[chunkDataOffset + 9] & 0x3F) << 8);
                    return new int[] { w, h };
                }
            }

            if ("VP8L".equals(fourCC) && chunkDataOffset + 5 <= bytes.length) {
                if (bytes[chunkDataOffset] == 0x2F) {
                    int b1 = bytes[chunkDataOffset + 1] & 0xFF;
                    int b2 = bytes[chunkDataOffset + 2] & 0xFF;
                    int b3 = bytes[chunkDataOffset + 3] & 0xFF;
                    int b4 = bytes[chunkDataOffset + 4] & 0xFF;
                    int packed = b1 | (b2 << 8) | (b3 << 16) | (b4 << 24);
                    int w = 1 + (packed & 0x3FFF);
                    int h = 1 + ((packed >>> 14) & 0x3FFF);
                    return new int[] { w, h };
                }
            }

            offset += 8 + (int) chunkSize + padding;
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
            }

            ExifSubIFDDirectory subIFD = metadata.getFirstDirectoryOfType(ExifSubIFDDirectory.class);
            if (subIFD != null && subIFD.containsTag(ExifSubIFDDirectory.TAG_DATETIME_ORIGINAL)) {
                throw new ValidationException("Không thể loại bỏ thời gian chụp gốc khỏi hình ảnh.", "file");
            }
        } catch (ValidationException ex) {
            throw ex;
        } catch (Exception ignored) {
            // Not all clean files have EXIF structure; if parsing returns no EXIF directories, it is clean
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
