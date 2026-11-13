package com.cmc.plant_care_backend.common.media;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

public class ExifTestFixtureGenerator {

    /**
     * Generates a valid JPEG image containing genuine EXIF metadata:
     * - ExifIFD0: Make ("GoPlantCam"), Model ("TestBot-2026"), Orientation
     * - ExifSubIFD: DateTimeOriginal ("2026:01:01 10:00:00")
     * - GPSDirectory: GPSLatitude (10° 45' 0"), GPSLongitude (106° 40' 0")
     */
    public static byte[] createJpegWithSensitiveExif(int width, int height, int orientation) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        int halfW = width / 2;
        int halfH = height / 2;
        // 4 distinct quadrants: Top-Left=RED, Top-Right=GREEN, Bottom-Left=BLUE, Bottom-Right=YELLOW
        g.setColor(Color.RED);
        g.fillRect(0, 0, halfW, halfH);
        g.setColor(Color.GREEN);
        g.fillRect(halfW, 0, width - halfW, halfH);
        g.setColor(Color.BLUE);
        g.fillRect(0, halfH, halfW, height - halfH);
        g.setColor(Color.YELLOW);
        g.fillRect(halfW, halfH, width - halfW, height - halfH);
        g.dispose();

        ByteArrayOutputStream rawJpeg = new ByteArrayOutputStream();
        ImageIO.write(image, "JPEG", rawJpeg);
        byte[] cleanJpegBytes = rawJpeg.toByteArray();

        byte[] app1Payload = buildApp1Payload(orientation);

        // Splice APP1 segment right after SOI marker (0xFF, 0xD8)
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        output.write(cleanJpegBytes[0]); // 0xFF
        output.write(cleanJpegBytes[1]); // 0xD8

        output.write(0xFF);
        output.write(0xE1);
        int app1Len = app1Payload.length + 2;
        output.write((app1Len >> 8) & 0xFF);
        output.write(app1Len & 0xFF);
        output.write(app1Payload);

        output.write(cleanJpegBytes, 2, cleanJpegBytes.length - 2);
        return output.toByteArray();
    }

    public static byte[] buildApp1Payload(int orientation) {
        ByteBuffer buf = ByteBuffer.allocate(1024).order(ByteOrder.LITTLE_ENDIAN);

        // Exif header: "Exif\0\0"
        buf.put("Exif\0\0".getBytes(StandardCharsets.US_ASCII));

        int tiffStart = buf.position();

        // TIFF header: "II" (little-endian), 42, offset to IFD0 (8)
        buf.put((byte) 'I');
        buf.put((byte) 'I');
        buf.putShort((short) 42);
        buf.putInt(8);

        // --- IFD0 ---
        // 5 tags: Make(0x010F), Model(0x0110), Orientation(0x0112), ExifIFD(0x8769), GpsIFD(0x8825)
        buf.putShort((short) 5);

        // Offsets will be filled relative to tiffStart
        // Size of IFD0: 2 (count) + 5 * 12 (entries) + 4 (next offset) = 66 bytes.
        // So offset 8 + 66 = 74 is where data/subIFDs begin.

        int makeOffset = 74;
        byte[] makeBytes = "GoPlantCam\0".getBytes(StandardCharsets.US_ASCII); // 11 bytes

        int modelOffset = makeOffset + makeBytes.length; // 74 + 11 = 85
        byte[] modelBytes = "TestBot-2026\0".getBytes(StandardCharsets.US_ASCII); // 13 bytes

        int exifSubIfdOffset = modelOffset + modelBytes.length; // 85 + 13 = 98
        // ExifSubIFD size: 2 (count) + 1 * 12 (entries) + 4 (next) = 18 bytes
        // Data for DateTimeOriginal: 20 bytes ("2026:01:01 10:00:00\0")
        int dateTimeOffset = exifSubIfdOffset + 18; // 98 + 18 = 116
        byte[] dateTimeBytes = "2026:01:01 10:00:00\0".getBytes(StandardCharsets.US_ASCII); // 20 bytes

        int gpsIfdOffset = dateTimeOffset + dateTimeBytes.length; // 116 + 20 = 136
        // GPS IFD: 2 (count) + 4 * 12 (entries: LatRef, Lat, LonRef, Lon) + 4 (next) = 54 bytes
        // GPS rationals offset: 136 + 54 = 190
        int gpsRationalsOffset = gpsIfdOffset + 54;

        // Tag 1: Make (0x010F), type 2 (ASCII), count 11
        buf.putShort((short) 0x010F);
        buf.putShort((short) 2);
        buf.putInt(makeBytes.length);
        buf.putInt(makeOffset);

        // Tag 2: Model (0x0110), type 2 (ASCII), count 13
        buf.putShort((short) 0x0110);
        buf.putShort((short) 2);
        buf.putInt(modelBytes.length);
        buf.putInt(modelOffset);

        // Tag 3: Orientation (0x0112), type 3 (SHORT), count 1, value inline
        buf.putShort((short) 0x0112);
        buf.putShort((short) 3);
        buf.putInt(1);
        buf.putShort((short) orientation);
        buf.putShort((short) 0); // padding

        // Tag 4: ExifSubIFD (0x8769), type 4 (LONG), count 1, offset
        buf.putShort((short) 0x8769);
        buf.putShort((short) 4);
        buf.putInt(1);
        buf.putInt(exifSubIfdOffset);

        // Tag 5: GpsIFD (0x8825), type 4 (LONG), count 1, offset
        buf.putShort((short) 0x8825);
        buf.putShort((short) 4);
        buf.putInt(1);
        buf.putInt(gpsIfdOffset);

        // Next IFD offset: 0
        buf.putInt(0);

        // Write Make string
        buf.put(makeBytes);
        // Write Model string
        buf.put(modelBytes);

        // --- ExifSubIFD ---
        buf.putShort((short) 1); // 1 tag: DateTimeOriginal (0x9003)
        buf.putShort((short) 0x9003);
        buf.putShort((short) 2);
        buf.putInt(dateTimeBytes.length);
        buf.putInt(dateTimeOffset);
        buf.putInt(0); // next IFD offset

        buf.put(dateTimeBytes);

        // --- GPS IFD ---
        buf.putShort((short) 4); // 4 tags

        // GPS tag 1: GPSLatitudeRef (0x0001), ASCII, "N\0" (inline in 4 bytes)
        buf.putShort((short) 0x0001);
        buf.putShort((short) 2);
        buf.putInt(2);
        buf.put((byte) 'N');
        buf.put((byte) 0);
        buf.putShort((short) 0); // pad

        // GPS tag 2: GPSLatitude (0x0002), RATIONAL (type 5), count 3 (24 bytes)
        buf.putShort((short) 0x0002);
        buf.putShort((short) 5);
        buf.putInt(3);
        buf.putInt(gpsRationalsOffset);

        // GPS tag 3: GPSLongitudeRef (0x0003), ASCII, "E\0" (inline in 4 bytes)
        buf.putShort((short) 0x0003);
        buf.putShort((short) 2);
        buf.putInt(2);
        buf.put((byte) 'E');
        buf.put((byte) 0);
        buf.putShort((short) 0); // pad

        // GPS tag 4: GPSLongitude (0x0004), RATIONAL (type 5), count 3 (24 bytes)
        buf.putShort((short) 0x0004);
        buf.putShort((short) 5);
        buf.putInt(3);
        buf.putInt(gpsRationalsOffset + 24);

        buf.putInt(0); // next IFD offset

        // Write GPSLatitude rationals: 10/1 deg, 45/1 min, 0/1 sec
        buf.putInt(10); buf.putInt(1);
        buf.putInt(45); buf.putInt(1);
        buf.putInt(0); buf.putInt(1);

        // Write GPSLongitude rationals: 106/1 deg, 40/1 min, 0/1 sec
        buf.putInt(106); buf.putInt(1);
        buf.putInt(40); buf.putInt(1);
        buf.putInt(0); buf.putInt(1);

        byte[] payload = new byte[buf.position()];
        buf.flip();
        buf.get(payload);
        return payload;
    }
}
