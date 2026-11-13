package com.cmc.plant_care_backend.common.media;

import com.cmc.plant_care_backend.common.exception.AppException;
import com.cmc.plant_care_backend.common.exception.ValidationException;
import com.cmc.plant_care_backend.config.SupabaseStorageProperties;
import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.Metadata;
import com.drew.metadata.exif.ExifIFD0Directory;
import com.drew.metadata.exif.ExifSubIFDDirectory;
import com.drew.metadata.exif.GpsDirectory;
import com.drew.metadata.iptc.IptcDirectory;
import com.drew.metadata.xmp.XmpDirectory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.Color;
import java.awt.Graphics2D;
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

    public static final long MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024L; // 5,242,880 bytes (5 MB hard limit)
    public static final long MAX_PIXEL_COUNT = 25_000_000L; // 25 Megapixels
    public static final int MAX_DIMENSION = 10_000; // 10,000 pixels

    private static final Set<String> ALLOWED_MIME_TYPES = Set.of(
        "image/jpeg",
        "image/png",
        "image/webp"
    );

    private final long maxFileSizeBytes;

    public ImageMetadataProcessor() {
        this.maxFileSizeBytes = MAX_FILE_SIZE_BYTES;
    }

    @Autowired
    public ImageMetadataProcessor(SupabaseStorageProperties properties) {
        this.maxFileSizeBytes = properties != null ? properties.getMaxFileSizeBytes() : MAX_FILE_SIZE_BYTES;
    }

    public long getMaxFileSizeBytes() {
        return maxFileSizeBytes;
    }

    public record ParsedWebP(
        int width,
        int height,
        int orientation,
        byte[] strippedBytes
    ) {}

    public ProcessedImage process(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ValidationException("Tệp tải lên không được để trống.", "file");
        }

        if (file.getSize() > this.maxFileSizeBytes) {
            throw new AppException(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE",
                "Kích thước tệp vượt quá giới hạn tối đa cho phép (" + (this.maxFileSizeBytes / (1024 * 1024)) + "MB).", "file");
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

        if (rawBytes.length > this.maxFileSizeBytes) {
            throw new AppException(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE",
                "Kích thước tệp vượt quá giới hạn tối đa cho phép (" + (this.maxFileSizeBytes / (1024 * 1024)) + "MB).", "file");
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

        // WebP processing path: Animation rejection & Strict RIFF validation BEFORE raster decoding
        if ("image/webp".equals(detectedMime)) {
            if (isAnimatedWebP(rawBytes)) {
                throw new ValidationException("Ảnh động WebP không được hỗ trợ trong phạm vi hiện tại.", "file");
            }

            ParsedWebP parsedWebP = parseAndValidateWebP(rawBytes);

            // Raster decoding using ImageIO ONLY after all RIFF boundary and dimension checks pass
            BufferedImage decodedWebP;
            try (InputStream in = new ByteArrayInputStream(parsedWebP.strippedBytes())) {
                decodedWebP = ImageIO.read(in);
            } catch (Exception e) {
                throw new ValidationException("Tệp hình ảnh WebP bị lỗi hoặc không thể giải mã.", "file");
            }
            if (decodedWebP == null) {
                throw new ValidationException("Không thể giải mã dữ liệu hình ảnh WebP.", "file");
            }

            if (decodedWebP.getWidth() != parsedWebP.width() || decodedWebP.getHeight() != parsedWebP.height()) {
                throw new ValidationException("Kích thước tệp WebP sau khi giải mã không khớp với thông số container.", "file");
            }

            byte[] processedBytes = parsedWebP.strippedBytes();
            if (processedBytes.length > this.maxFileSizeBytes) {
                throw new AppException(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE",
                    "Kích thước tệp sau xử lý vượt quá giới hạn tối đa cho phép.", "file");
            }

            verifyNoSensitiveMetadata(processedBytes);
            String sha256 = calculateSha256(processedBytes);

            return new ProcessedImage(
                processedBytes,
                detectedMime,
                parsedWebP.width(),
                parsedWebP.height(),
                processedBytes.length,
                sha256
            );
        }

        // JPEG & PNG processing path
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

        int orientation = extractOrientation(rawBytes);
        BufferedImage decodedImage;
        try (InputStream in = new ByteArrayInputStream(rawBytes)) {
            decodedImage = ImageIO.read(in);
        } catch (Exception e) {
            throw new ValidationException("Tệp hình ảnh bị lỗi hoặc không thể giải mã.", "file");
        }

        if (decodedImage == null) {
            throw new ValidationException("Không thể giải mã dữ liệu hình ảnh.", "file");
        }

        BufferedImage uprightImage = applyOrientation(decodedImage, orientation);
        int finalWidth = uprightImage.getWidth();
        int finalHeight = uprightImage.getHeight();

        byte[] processedBytes;
        if ("image/jpeg".equals(detectedMime)) {
            processedBytes = encodeJpeg(uprightImage);
        } else {
            processedBytes = encodePng(uprightImage);
        }

        if (processedBytes == null || processedBytes.length == 0) {
            throw new ValidationException("Dữ liệu hình ảnh sau xử lý rỗng.", "file");
        }
        if (processedBytes.length > this.maxFileSizeBytes) {
            throw new AppException(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE",
                "Kích thước tệp sau xử lý vượt quá giới hạn tối đa cho phép.", "file");
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

    public static ParsedWebP parseAndValidateWebP(byte[] webpBytes) {
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
        int canvasWidth = -1;
        int canvasHeight = -1;
        int bitstreamWidth = -1;
        int bitstreamHeight = -1;
        int orientation = 1;

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

            if ("ANIM".equals(fourCC) || "ANMF".equals(fourCC)) {
                throw new ValidationException("Ảnh động WebP không được hỗ trợ trong phạm vi hiện tại.", "file");
            }

            if ("VP8X".equals(fourCC)) {
                if (hasVp8x) {
                    throw new ValidationException("Tệp WebP chứa nhiều hơn một chunk VP8X.", "file");
                }
                hasVp8x = true;
                if (chunkSize < 10) {
                    throw new ValidationException("Chunk VP8X quá ngắn (" + chunkSize + " bytes, tối thiểu 10 bytes).", "file");
                }

                byte flags = webpBytes[payloadOffset];
                if ((flags & 0x02) != 0) { // Animation bit
                    throw new ValidationException("Ảnh động WebP không được hỗ trợ trong phạm vi hiện tại.", "file");
                }

                canvasWidth = 1 + ((webpBytes[payloadOffset + 4] & 0xFF)
                    | ((webpBytes[payloadOffset + 5] & 0xFF) << 8)
                    | ((webpBytes[payloadOffset + 6] & 0xFF) << 16));
                canvasHeight = 1 + ((webpBytes[payloadOffset + 7] & 0xFF)
                    | ((webpBytes[payloadOffset + 8] & 0xFF) << 8)
                    | ((webpBytes[payloadOffset + 9] & 0xFF) << 16));

                if (canvasWidth <= 0 || canvasHeight <= 0) {
                    throw new ValidationException("Kích thước canvas WebP VP8X không hợp lệ.", "file");
                }
                if (canvasWidth > MAX_DIMENSION || canvasHeight > MAX_DIMENSION) {
                    throw new ValidationException("Kích thước chiều rộng hoặc chiều cao canvas WebP VP8X vượt quá giới hạn tối đa " + MAX_DIMENSION + "px.", "file");
                }
                if ((long) canvasWidth * canvasHeight > MAX_PIXEL_COUNT) {
                    throw new ValidationException("Số lượng pixel canvas WebP VP8X vượt quá giới hạn tối đa 25MP.", "file");
                }
                if (bitstreamWidth > 0 && (canvasWidth != bitstreamWidth || canvasHeight != bitstreamHeight)) {
                    throw new ValidationException("Kích thước canvas VP8X (" + canvasWidth + "x" + canvasHeight
                        + ") không khớp kích thước frame bitstream (" + bitstreamWidth + "x" + bitstreamHeight + ").", "file");
                }

                byte[] vp8xData = new byte[chunkSize];
                System.arraycopy(webpBytes, payloadOffset, vp8xData, 0, chunkSize);
                // Clear bit 2 (XMP), bit 3 (EXIF), bit 1 (Animation)
                vp8xData[0] = (byte) (vp8xData[0] & ~0x0E);

                outChunks.write(webpBytes, offsetInt, 4);
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
                if ((webpBytes[payloadOffset + 3] & 0xFF) != 0x9D
                    || (webpBytes[payloadOffset + 4] & 0xFF) != 0x01
                    || (webpBytes[payloadOffset + 5] & 0xFF) != 0x2A) {
                    throw new ValidationException("Chunk VP8 thiếu signature bytes 0x9D012A.", "file");
                }

                int vp8W = (webpBytes[payloadOffset + 6] & 0xFF) | ((webpBytes[payloadOffset + 7] & 0x3F) << 8);
                int vp8H = (webpBytes[payloadOffset + 8] & 0xFF) | ((webpBytes[payloadOffset + 9] & 0x3F) << 8);

                if (vp8W <= 0 || vp8H <= 0) {
                    throw new ValidationException("Kích thước frame WebP VP8 không hợp lệ.", "file");
                }
                if (vp8W > MAX_DIMENSION || vp8H > MAX_DIMENSION) {
                    throw new ValidationException("Kích thước chiều rộng hoặc chiều cao frame WebP VP8 vượt quá giới hạn tối đa " + MAX_DIMENSION + "px.", "file");
                }
                if ((long) vp8W * vp8H > MAX_PIXEL_COUNT) {
                    throw new ValidationException("Số lượng pixel frame WebP VP8 vượt quá giới hạn tối đa 25MP.", "file");
                }
                if (hasVp8x && (canvasWidth != vp8W || canvasHeight != vp8H)) {
                    throw new ValidationException("Kích thước canvas VP8X (" + canvasWidth + "x" + canvasHeight
                        + ") không khớp kích thước frame VP8 (" + vp8W + "x" + vp8H + ").", "file");
                }

                bitstreamWidth = vp8W;
                bitstreamHeight = vp8H;
                imageChunkCount++;
            }

            if ("VP8L".equals(fourCC)) {
                if (chunkSize < 5) {
                    throw new ValidationException("Chunk VP8L quá ngắn (" + chunkSize + " bytes, tối thiểu 5 bytes).", "file");
                }
                if (webpBytes[payloadOffset] != 0x2F) {
                    throw new ValidationException("Chunk VP8L thiếu signature byte 0x2F.", "file");
                }

                int b1 = webpBytes[payloadOffset + 1] & 0xFF;
                int b2 = webpBytes[payloadOffset + 2] & 0xFF;
                int b3 = webpBytes[payloadOffset + 3] & 0xFF;
                int b4 = webpBytes[payloadOffset + 4] & 0xFF;
                int vp8lW = 1 + (((b2 & 0x3F) << 8) | b1);
                int vp8lH = 1 + (((b4 & 0x0F) << 10) | (b3 << 2) | ((b2 & 0xC0) >> 6));

                if (vp8lW <= 0 || vp8lH <= 0) {
                    throw new ValidationException("Kích thước frame WebP VP8L không hợp lệ.", "file");
                }
                if (vp8lW > MAX_DIMENSION || vp8lH > MAX_DIMENSION) {
                    throw new ValidationException("Kích thước chiều rộng hoặc chiều cao frame WebP VP8L vượt quá giới hạn tối đa " + MAX_DIMENSION + "px.", "file");
                }
                if ((long) vp8lW * vp8lH > MAX_PIXEL_COUNT) {
                    throw new ValidationException("Số lượng pixel frame WebP VP8L vượt quá giới hạn tối đa 25MP.", "file");
                }
                if (hasVp8x && (canvasWidth != vp8lW || canvasHeight != vp8lH)) {
                    throw new ValidationException("Kích thước canvas VP8X (" + canvasWidth + "x" + canvasHeight
                        + ") không khớp kích thước frame VP8L (" + vp8lW + "x" + vp8lH + ").", "file");
                }

                bitstreamWidth = vp8lW;
                bitstreamHeight = vp8lH;
                imageChunkCount++;
            }

            if ("EXIF".equals(fourCC)) {
                int exifOrientation = parseExifOrientation(webpBytes, payloadOffset, chunkSize);
                if (exifOrientation < 1 || exifOrientation > 8) {
                    throw new ValidationException("Giá trị EXIF orientation (" + exifOrientation + ") không hợp lệ. Chỉ chấp nhận giá trị từ 1 đến 8.", "file");
                }
                if (exifOrientation > 1) {
                    throw new ValidationException("Hình ảnh WebP chứa thông tin xoay hướng (EXIF orientation=" + exifOrientation + ") không thể xử lý an toàn.", "file");
                }
                orientation = exifOrientation;
                offset = nextOffset;
                continue;
            }

            if ("XMP ".equals(fourCC)) {
                offset = nextOffset;
                continue;
            }

            outChunks.write(webpBytes, offsetInt, (int) (8L + chunkSizeLong + padding));
            offset = nextOffset;
        }

        if (imageChunkCount == 0) {
            throw new ValidationException("Tệp WebP thiếu dữ liệu hình ảnh (VP8/VP8L).", "file");
        }
        if (imageChunkCount > 1) {
            throw new ValidationException("Tệp WebP chứa nhiều chunk hình ảnh mâu thuẫn (imageChunkCount=" + imageChunkCount + ").", "file");
        }

        int extractedWidth = hasVp8x ? canvasWidth : bitstreamWidth;
        int extractedHeight = hasVp8x ? canvasHeight : bitstreamHeight;

        if (extractedWidth <= 0 || extractedHeight <= 0) {
            throw new ValidationException("Kích thước hình ảnh không hợp lệ.", "file");
        }

        if (extractedWidth > MAX_DIMENSION || extractedHeight > MAX_DIMENSION) {
            throw new ValidationException("Kích thước chiều rộng hoặc chiều cao vượt quá giới hạn tối đa " + MAX_DIMENSION + "px.", "file");
        }

        long totalPixels = (long) extractedWidth * extractedHeight;
        if (totalPixels > MAX_PIXEL_COUNT) {
            throw new ValidationException("Số lượng pixel hình ảnh (" + totalPixels + ") vượt quá giới hạn tối đa 25MP.", "file");
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

        byte[] finalBytes = finalWebP.toByteArray();
        verifyNoSensitiveWebPMetadata(finalBytes);

        return new ParsedWebP(extractedWidth, extractedHeight, orientation, finalBytes);
    }

    public static void verifyNoSensitiveWebPMetadata(byte[] webpBytes) {
        if (webpBytes == null || webpBytes.length < 12) {
            throw new ValidationException("Tệp WebP không đủ độ dài tối thiểu.", "file");
        }
        long declaredRiffSize = readUint32LE(webpBytes, 4);
        long riffEndOffset = Math.min((long) webpBytes.length, declaredRiffSize + 8L);
        long offset = 12L;
        while (offset + 8L <= riffEndOffset) {
            String fourCC = new String(webpBytes, (int) offset, 4, StandardCharsets.US_ASCII);
            long chunkSize = readUint32LE(webpBytes, (int) (offset + 4));
            long padding = (chunkSize % 2 != 0) ? 1L : 0L;

            if ("EXIF".equals(fourCC)) {
                throw new ValidationException("Tệp WebP vẫn còn chứa chunk siêu dữ liệu EXIF sau khi xử lý.", "file");
            }
            if ("XMP ".equals(fourCC)) {
                throw new ValidationException("Tệp WebP vẫn còn chứa chunk siêu dữ liệu XMP sau khi xử lý.", "file");
            }
            if ("VP8X".equals(fourCC) && offset + 9L <= riffEndOffset) {
                byte flags = webpBytes[(int) (offset + 8)];
                if ((flags & 0x08) != 0) { // EXIF flag bit
                    throw new ValidationException("Cờ EXIF trong chunk VP8X của WebP chưa được gỡ bỏ.", "file");
                }
                if ((flags & 0x04) != 0) { // XMP flag bit
                    throw new ValidationException("Cờ XMP trong chunk VP8X của WebP chưa được gỡ bỏ.", "file");
                }
            }
            offset += 8L + chunkSize + padding;
        }
    }

    public static int parseExifOrientation(byte[] bytes, int offset, int length) {
        if (length < 8) {
            throw new ValidationException("Khối EXIF quá ngắn (" + length + " bytes).", "file");
        }
        int tiffStart = offset;
        int tiffLength = length;
        if (length >= 14 && bytes[offset] == 'E' && bytes[offset + 1] == 'x' && bytes[offset + 2] == 'i' && bytes[offset + 3] == 'f'
            && bytes[offset + 4] == 0 && bytes[offset + 5] == 0) {
            tiffStart = offset + 6;
            tiffLength = length - 6;
        }
        return parseTiffOrientation(bytes, tiffStart, tiffLength);
    }

    public static int parseTiffOrientation(byte[] bytes, int tiffStart, int tiffLength) {
        if (tiffLength < 8 || tiffStart + tiffLength > bytes.length) {
            throw new ValidationException("Cấu trúc TIFF/EXIF bị cắt cụt header.", "file");
        }
        boolean littleEndian;
        if (bytes[tiffStart] == 'I' && bytes[tiffStart + 1] == 'I') {
            littleEndian = true;
        } else if (bytes[tiffStart] == 'M' && bytes[tiffStart + 1] == 'M') {
            littleEndian = false;
        } else {
            throw new ValidationException("Dấu hiệu endianness của TIFF không hợp lệ (không phải II hoặc MM).", "file");
        }

        int magic = read16(bytes, tiffStart + 2, littleEndian);
        if (magic != 42) {
            throw new ValidationException("TIFF magic number không hợp lệ (kỳ vọng 42, nhận được " + magic + ").", "file");
        }

        int ifdOffset = read32(bytes, tiffStart + 4, littleEndian);
        if (ifdOffset < 8 || ifdOffset + 2 > tiffLength) {
            throw new ValidationException("TIFF IFD0 offset (" + ifdOffset + ") nằm ngoài giới hạn hợp lệ của khối TIFF (" + tiffLength + " bytes).", "file");
        }

        int ifdPos = tiffStart + ifdOffset;
        if (ifdPos + 2 > tiffStart + tiffLength) {
            throw new ValidationException("TIFF IFD0 header vượt quá độ dài khối TIFF.", "file");
        }
        int numEntries = read16(bytes, ifdPos, littleEndian);
        if (numEntries <= 0 || ifdPos + 2 + numEntries * 12 > tiffStart + tiffLength) {
            throw new ValidationException("Số lượng entry trong TIFF IFD0 (" + numEntries + ") không hợp lệ hoặc dữ liệu bị cắt cụt.", "file");
        }

        for (int i = 0; i < numEntries; i++) {
            int entryPos = ifdPos + 2 + i * 12;
            int tag = read16(bytes, entryPos, littleEndian);
            if (tag == 0x0112) { // Orientation tag
                int type = read16(bytes, entryPos + 2, littleEndian);
                int count = read32(bytes, entryPos + 4, littleEndian);
                if (type != 3 && type != 4) { // 3 = SHORT, 4 = LONG
                    throw new ValidationException("Tag EXIF Orientation (0x0112) có kiểu dữ liệu type=" + type + " không hợp lệ (kỳ vọng SHORT).", "file");
                }
                if (count != 1) {
                    throw new ValidationException("Tag EXIF Orientation (0x0112) có count=" + count + " không hợp lệ (kỳ vọng 1).", "file");
                }
                int orientationVal = (type == 3)
                    ? read16(bytes, entryPos + 8, littleEndian)
                    : read32(bytes, entryPos + 8, littleEndian);
                if (orientationVal < 1 || orientationVal > 8) {
                    throw new ValidationException("Giá trị EXIF orientation (" + orientationVal + ") không hợp lệ. Chỉ chấp nhận giá trị từ 1 đến 8.", "file");
                }
                return orientationVal;
            }
        }
        return 1; // EXIF valid, Orientation tag absent -> default normal 1
    }

    private static int read16(byte[] bytes, int offset, boolean littleEndian) {
        int b0 = bytes[offset] & 0xFF;
        int b1 = bytes[offset + 1] & 0xFF;
        return littleEndian ? (b1 << 8) | b0 : (b0 << 8) | b1;
    }

    private static int read32(byte[] bytes, int offset, boolean littleEndian) {
        int b0 = bytes[offset] & 0xFF;
        int b1 = bytes[offset + 1] & 0xFF;
        int b2 = bytes[offset + 2] & 0xFF;
        int b3 = bytes[offset + 3] & 0xFF;
        return littleEndian
            ? (b3 << 24) | (b2 << 16) | (b1 << 8) | b0
            : (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;
    }

    public static boolean isAnimatedWebP(byte[] webpBytes) {
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
                break;
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

    public static int[] extractDimensionsWithoutRaster(byte[] rawBytes, String detectedMime) {
        if ("image/webp".equals(detectedMime)) {
            ParsedWebP parsed = parseAndValidateWebP(rawBytes);
            return new int[] { parsed.width(), parsed.height() };
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
                int orientation = dir.getInt(ExifIFD0Directory.TAG_ORIENTATION);
                if (orientation < 1 || orientation > 8) {
                    throw new ValidationException("Giá trị EXIF orientation (" + orientation + ") không hợp lệ. Chỉ chấp nhận giá trị từ 1 đến 8.", "file");
                }
                return orientation;
            }
            return 1;
        } catch (ValidationException ve) {
            throw ve;
        } catch (com.drew.metadata.MetadataException me) {
            throw new ValidationException("Dữ liệu thẻ EXIF Orientation bị lỗi hoặc không thể đọc: " + me.getMessage(), "file");
        } catch (com.drew.imaging.ImageProcessingException ipe) {
            throw new ValidationException("Dữ liệu siêu dữ liệu hình ảnh bị lỗi hoặc không thể phân tích: " + ipe.getMessage(), "file");
        } catch (IOException ioe) {
            throw new ValidationException("Lỗi đọc dữ liệu siêu dữ liệu: " + ioe.getMessage(), "file");
        }
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

    public static byte[] stripWebPMetadata(byte[] webpBytes) {
        return parseAndValidateWebP(webpBytes).strippedBytes();
    }

    private static long readUint32LE(byte[] bytes, int offset) {
        return (bytes[offset] & 0xFFL)
            | ((bytes[offset + 1] & 0xFFL) << 8)
            | ((bytes[offset + 2] & 0xFFL) << 16)
            | ((bytes[offset + 3] & 0xFFL) << 24);
    }

    public static int[] extractWebPDimensions(byte[] bytes) {
        try {
            ParsedWebP parsed = parseAndValidateWebP(bytes);
            return new int[] { parsed.width(), parsed.height() };
        } catch (Exception e) {
            return null;
        }
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
            if (gpsDir != null && !gpsDir.isEmpty()) {
                throw new ValidationException("Tệp hình ảnh vẫn còn chứa thông tin định vị GPS sau khi xử lý.", "file");
            }

            ExifSubIFDDirectory subIfd = metadata.getFirstDirectoryOfType(ExifSubIFDDirectory.class);
            if (subIfd != null && !subIfd.isEmpty()) {
                throw new ValidationException("Tệp hình ảnh vẫn còn chứa siêu dữ liệu máy ảnh EXIF sau khi xử lý.", "file");
            }

            ExifIFD0Directory ifd0 = metadata.getFirstDirectoryOfType(ExifIFD0Directory.class);
            if (ifd0 != null && !ifd0.isEmpty()) {
                if (ifd0.containsTag(ExifIFD0Directory.TAG_MAKE)
                    || ifd0.containsTag(ExifIFD0Directory.TAG_MODEL)
                    || ifd0.containsTag(ExifIFD0Directory.TAG_DATETIME)
                    || ifd0.containsTag(ExifIFD0Directory.TAG_ORIENTATION)
                    || ifd0.containsTag(ExifIFD0Directory.TAG_SOFTWARE)) {
                    throw new ValidationException("Tệp hình ảnh vẫn còn chứa thông tin thiết bị EXIF IFD0 sau khi xử lý.", "file");
                }
            }

            XmpDirectory xmpDir = metadata.getFirstDirectoryOfType(XmpDirectory.class);
            if (xmpDir != null && !xmpDir.isEmpty()) {
                throw new ValidationException("Tệp hình ảnh vẫn còn chứa siêu dữ liệu XMP sau khi xử lý.", "file");
            }

            IptcDirectory iptcDir = metadata.getFirstDirectoryOfType(IptcDirectory.class);
            if (iptcDir != null && !iptcDir.isEmpty()) {
                throw new ValidationException("Tệp hình ảnh vẫn còn chứa siêu dữ liệu IPTC sau khi xử lý.", "file");
            }
        } catch (ValidationException ve) {
            throw ve;
        } catch (Exception e) {
            throw new ValidationException("Không thể xác minh tính an toàn của siêu dữ liệu sau xử lý: " + e.getMessage(), "file");
        }
    }

    public static String calculateSha256(byte[] data) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(data);
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 algorithm not available", e);
        }
    }
}
