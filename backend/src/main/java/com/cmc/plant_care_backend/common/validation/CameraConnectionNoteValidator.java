package com.cmc.plant_care_backend.common.validation;

import com.cmc.plant_care_backend.common.exception.ValidationException;
import org.springframework.stereotype.Component;

import java.util.regex.Pattern;

@Component
public class CameraConnectionNoteValidator {

    private static final String CREDENTIAL_ERROR_MESSAGE =
        "Ghi chú kết nối không được chứa mật khẩu, token hoặc thông tin đăng nhập.";

    // Matches URIs containing userinfo before path/query/fragment (e.g., rtsp://user:pass@host, rtsps://user:@host, http(s)://user:pass@host)
    private static final Pattern URI_USERINFO_PATTERN = Pattern.compile(
        "(?i)[a-z][a-z0-9+.-]*://[^\\s/@?#]*@"
    );

    // Matches bare user:pass@host patterns (including compact labels like email:secret@host and punctuation boundaries like :(admin:secret@host))
    // while still allowing normal emails like "support@example.com" or "Email: support@example.com"
    private static final Pattern BARE_USERINFO_PATTERN = Pattern.compile(
        "(?i)(?:^|[\\s(\\[{\"'<,;:=])[^\\s:@/(\\[{\"'<,;]+:[^\\s@/]*@[^\\s/:()\\[\\]{}\"'<>,;]+"
    );

    // Matches explicit credential key-value assignments (case-insensitive)
    private static final Pattern CREDENTIAL_KV_PATTERN = Pattern.compile(
        "(?i)(?:^|[^\\p{L}\\p{N}])(?:password|passwd|pwd|token|secret|api[_-]?key|username)\\s*[:=]"
    );

    // Matches explicit Bearer token literals
    private static final Pattern BEARER_TOKEN_PATTERN = Pattern.compile(
        "(?i)\\bbearer\\s+[a-z0-9._-]{8,}"
    );

    public void validate(String rawConnectionNote) {
        if (rawConnectionNote == null) {
            return;
        }
        String trimmed = rawConnectionNote.trim();
        if (trimmed.isEmpty()) {
            return;
        }

        if (URI_USERINFO_PATTERN.matcher(trimmed).find()
            || BARE_USERINFO_PATTERN.matcher(trimmed).find()
            || CREDENTIAL_KV_PATTERN.matcher(trimmed).find()
            || BEARER_TOKEN_PATTERN.matcher(trimmed).find()) {
            throw new ValidationException(CREDENTIAL_ERROR_MESSAGE, "connectionNote");
        }
    }
}
