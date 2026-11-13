package com.cmc.plant_care_backend.common.validation;

import com.cmc.plant_care_backend.common.exception.ValidationException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class MediaUrlValidator {

    private static final Set<String> BLOCKED_SCHEMES = Set.of(
        "file", "content", "data", "javascript", "blob", "vbscript", "about", "ftp", "ldap", "jar"
    );

    private static final Set<String> BLOCKED_HOST_SUFFIXES = Set.of(
        ".local", ".internal", ".lan", ".corp", ".home", ".test", ".example", ".invalid", ".onion", ".localhost"
    );

    private static final Pattern IPV4_PATTERN = Pattern.compile(
        "^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$"
    );

    private static final Pattern NUMERIC_SEGMENT_PATTERN = Pattern.compile(
        "^(?:0x[0-9a-f]+|\\d+)$"
    );

    private final Set<String> allowedSchemes;

    public MediaUrlValidator(
        @Value("${media.url-validator.allowed-schemes:https}") String allowedSchemesConfig
    ) {
        Set<String> schemes = new HashSet<>();
        if (allowedSchemesConfig != null && !allowedSchemesConfig.trim().isEmpty()) {
            for (String s : allowedSchemesConfig.split(",")) {
                if (!s.trim().isEmpty()) {
                    schemes.add(s.trim().toLowerCase());
                }
            }
        }
        if (schemes.isEmpty()) {
            schemes.add("https");
        }
        this.allowedSchemes = Collections.unmodifiableSet(schemes);
    }

    public void validate(String rawUrl, String fieldName) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            return;
        }

        String trimmed = rawUrl.trim();
        String field = fieldName != null ? fieldName : "imageUrl";

        URI uri;
        try {
            uri = URI.create(trimmed);
        } catch (Exception e) {
            throw new ValidationException("URL hình ảnh không đúng định dạng.", field);
        }

        String scheme = uri.getScheme();
        if (scheme == null) {
            throw new ValidationException("URL hình ảnh phải có scheme (https://).", field);
        }

        String normalizedScheme = scheme.toLowerCase();
        if (BLOCKED_SCHEMES.contains(normalizedScheme)) {
            throw new ValidationException("Scheme URL '" + normalizedScheme + "' không được phép sử dụng.", field);
        }

        if (!allowedSchemes.contains(normalizedScheme)) {
            throw new ValidationException("Chỉ chấp nhận URL sử dụng scheme an toàn (" + String.join(", ", allowedSchemes) + ").", field);
        }

        // Check for userInfo in URI (e.g. https://user:pass@host)
        if (uri.getUserInfo() != null || uri.getRawUserInfo() != null) {
            throw new ValidationException("URL hình ảnh không được chứa thông tin đăng nhập (username/password).", field);
        }

        String authority = uri.getRawAuthority();
        if (authority != null && authority.contains("@")) {
            throw new ValidationException("URL hình ảnh không được chứa ký tự '@' trong authority.", field);
        }

        String host = uri.getHost();
        if (host == null || host.trim().isEmpty()) {
            throw new ValidationException("URL hình ảnh thiếu tên miền hoặc địa chỉ máy chủ.", field);
        }

        // Strip trailing dots and brackets if IPv6
        String normalizedHost = host.toLowerCase().trim();
        while (normalizedHost.endsWith(".")) {
            normalizedHost = normalizedHost.substring(0, normalizedHost.length() - 1);
        }

        if (normalizedHost.startsWith("[") && normalizedHost.endsWith("]")) {
            normalizedHost = normalizedHost.substring(1, normalizedHost.length() - 1);
        }

        if (normalizedHost.isEmpty()) {
            throw new ValidationException("Tên máy chủ trong URL hình ảnh không hợp lệ.", field);
        }

        // Check localhost and blocked internal suffixes
        if (normalizedHost.equals("localhost") || isBlockedInternalHost(normalizedHost)) {
            throw new ValidationException("Không được sử dụng URL trỏ tới máy chủ nội bộ hoặc localhost.", field);
        }

        // Reject invalid dots (consecutive dots, leading dot)
        if (normalizedHost.startsWith(".") || normalizedHost.contains("..")) {
            throw new ValidationException("Tên máy chủ trong URL hình ảnh không hợp lệ.", field);
        }

        // Check if host consists entirely of numeric/hex/octal segments (SSRF defense against obfuscated/short IPs)
        String[] hostParts = normalizedHost.split("\\.", -1);
        boolean allNumericSegments = true;
        for (String part : hostParts) {
            if (part.isEmpty() || !NUMERIC_SEGMENT_PATTERN.matcher(part).matches()) {
                allNumericSegments = false;
                break;
            }
        }

        if (allNumericSegments) {
            // Check if it is a canonical 4-octet IPv4 (each octet 0-255, no hex, no leading zeroes except "0")
            if (hostParts.length == 4) {
                boolean canonicalDecimal = true;
                int[] octets = new int[4];
                for (int i = 0; i < 4; i++) {
                    String part = hostParts[i];
                    if (part.startsWith("0x") || (part.length() > 1 && part.startsWith("0"))) {
                        canonicalDecimal = false;
                        break;
                    }
                    try {
                        long val = Long.parseLong(part);
                        if (val < 0 || val > 255) {
                            canonicalDecimal = false;
                            break;
                        }
                        octets[i] = (int) val;
                    } catch (NumberFormatException e) {
                        canonicalDecimal = false;
                        break;
                    }
                }

                if (!canonicalDecimal) {
                    throw new ValidationException("Địa chỉ IP dạng số nguyên hoặc mã hóa không được phép sử dụng.", field);
                }

                if (isPrivateOrReservedIpv4(octets[0], octets[1], octets[2], octets[3])) {
                    throw new ValidationException("Không được sử dụng URL trỏ tới dải địa chỉ IP riêng tư hoặc bảo lưu (" + normalizedHost + ").", field);
                }
            } else {
                // Short, integer, or invalid numeric IP format (e.g. 127.1, 127.0.1, 0x7f.1, 2130706433)
                throw new ValidationException("Địa chỉ IP dạng số nguyên hoặc mã hóa không được phép sử dụng.", field);
            }
        }

        // Check IPv6 literal
        if (normalizedHost.contains(":")) {
            if (isPrivateOrReservedIpv6(normalizedHost)) {
                throw new ValidationException("Không được sử dụng URL trỏ tới địa chỉ IPv6 nội bộ hoặc loopback.", field);
            }
        }
    }

    public void validateAll(Collection<String> urls, String fieldName) {
        if (urls == null || urls.isEmpty()) {
            return;
        }
        for (String url : urls) {
            validate(url, fieldName);
        }
    }

    private boolean isBlockedInternalHost(String host) {
        for (String suffix : BLOCKED_HOST_SUFFIXES) {
            if (host.endsWith(suffix)) {
                return true;
            }
        }
        return false;
    }

    private boolean isPrivateOrReservedIpv4(int b0, int b1, int b2, int b3) {
        // 127.0.0.0/8 (Loopback)
        if (b0 == 127) return true;

        // 10.0.0.0/8 (Private)
        if (b0 == 10) return true;

        // 172.16.0.0/12 (Private: 172.16.0.0 - 172.31.255.255)
        if (b0 == 172 && (b1 >= 16 && b1 <= 31)) return true;

        // 192.168.0.0/16 (Private)
        if (b0 == 192 && b1 == 168) return true;

        // 169.254.0.0/16 (Link-local)
        if (b0 == 169 && b1 == 254) return true;

        // 0.0.0.0/8 (Unspecified)
        if (b0 == 0) return true;

        // 255.255.255.255 (Broadcast)
        if (b0 == 255 && b1 == 255 && b2 == 255 && b3 == 255) return true;

        // 224.0.0.0/4 (Multicast: 224 - 239)
        if (b0 >= 224 && b0 <= 239) return true;

        // 240.0.0.0/4 (Reserved / Future use: 240 - 255)
        if (b0 >= 240) return true;

        return false;
    }

    private boolean isPrivateOrReservedIpv6(String ipv6) {
        String lower = ipv6.toLowerCase();

        // ::1 (Loopback)
        if (lower.equals("::1") || lower.equals("0:0:0:0:0:0:0:1")) return true;

        // :: (Unspecified)
        if (lower.equals("::") || lower.equals("0:0:0:0:0:0:0:0")) return true;

        // fe80::/10 (Link-local)
        if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
            return true;
        }

        // fc00::/7 (Unique local: fc00:: - fdff::)
        if (lower.startsWith("fc") || lower.startsWith("fd")) {
            return true;
        }

        // ff00::/8 (Multicast)
        if (lower.startsWith("ff")) {
            return true;
        }

        // IPv4-mapped IPv6: ::ffff:x.x.x.x
        if (lower.startsWith("::ffff:") || lower.startsWith("0:0:0:0:0:ffff:")) {
            int lastColon = lower.lastIndexOf(':');
            String embeddedIpv4 = lower.substring(lastColon + 1);
            Matcher m = IPV4_PATTERN.matcher(embeddedIpv4);
            if (m.matches()) {
                int b0 = Integer.parseInt(m.group(1));
                int b1 = Integer.parseInt(m.group(2));
                int b2 = Integer.parseInt(m.group(3));
                int b3 = Integer.parseInt(m.group(4));
                return isPrivateOrReservedIpv4(b0, b1, b2, b3);
            }
            return true;
        }

        return false;
    }
}
