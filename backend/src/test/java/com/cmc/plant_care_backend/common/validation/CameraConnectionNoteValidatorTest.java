package com.cmc.plant_care_backend.common.validation;

import com.cmc.plant_care_backend.common.exception.ValidationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class CameraConnectionNoteValidatorTest {

    private CameraConnectionNoteValidator validator;

    @BeforeEach
    void setUp() {
        validator = new CameraConnectionNoteValidator();
    }

    @Test
    void validate_ShouldAllowNullBlankAndSafeDescriptions() {
        assertDoesNotThrow(() -> validator.validate(null));
        assertDoesNotThrow(() -> validator.validate(""));
        assertDoesNotThrow(() -> validator.validate("   "));
        assertDoesNotThrow(() -> validator.validate("support@example.com"));
        assertDoesNotThrow(() -> validator.validate("Email: support@example.com"));
        assertDoesNotThrow(() -> validator.validate("Đã kiểm tra nguồn điện và cáp mạng"));
        assertDoesNotThrow(() -> validator.validate("Cần kiểm tra lại adapter góc ban công"));
        assertDoesNotThrow(() -> validator.validate("Gắn gần ổ cắm hướng Đông"));
        assertDoesNotThrow(() -> validator.validate("Đầu nối nguồn gần công tắc mật khẩu cửa"));
        assertDoesNotThrow(() -> validator.validate("Không chứa password hay token ở đây"));
        assertDoesNotThrow(() -> validator.validate("Token camera chưa cần thiết"));
        assertDoesNotThrow(() -> validator.validate("rtsp://192.168.1.10:554/stream1"));
    }

    @Test
    void validate_ShouldRejectUriUserInfoAndNeverEchoSecret() {
        String secret1 = "rtsp://admin:SuperSecret99@192.168.1.10:554/stream1";
        ValidationException ex1 = assertThrows(ValidationException.class, () -> validator.validate(secret1));
        assertEquals("connectionNote", ex1.getField());
        assertFalse(ex1.getMessage().contains("SuperSecret99"));
        assertFalse(ex1.getMessage().contains("admin"));

        assertThrows(ValidationException.class,
            () -> validator.validate("rtsps://camuser:secretPass123@cam.local/live"));
        assertThrows(ValidationException.class,
            () -> validator.validate("http://user:pass@10.0.0.2/snapshot"));
        assertThrows(ValidationException.class,
            () -> validator.validate("https://user:pass@cam.example.com/feed"));
        assertThrows(ValidationException.class,
            () -> validator.validate("rtsp://admin:@10.0.0.5/live"));
        assertThrows(ValidationException.class,
            () -> validator.validate("RTSP://Operator:Pass!1@192.168.1.99/ch1"));
    }

    @Test
    void validate_ShouldRejectCredentialKeyValuesAndNeverEchoSecret() {
        String[] rejected = {
            "password=abcSecretValue",
            "password: xyzSecretValue",
            "PASSWORD=123456",
            "passwd=myPasswd99",
            "pwd=myPwd88",
            "pwd: anotherPwd",
            "token=tok_live_987654",
            "Token: tok_abc",
            "secret=sec_val_001",
            "apiKey=key_live_12345",
            "api_key: key_456",
            "username=cam_root",
            "Username: admin01",
            "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
        };

        for (String payload : rejected) {
            ValidationException ex = assertThrows(
                ValidationException.class,
                () -> validator.validate(payload),
                "Expected rejection for credential payload"
            );
            assertEquals("connectionNote", ex.getField());
            assertEquals("VALIDATION_ERROR", ex.getErrorCode());
            assertFalse(ex.getMessage().contains("abcSecretValue"));
            assertFalse(ex.getMessage().contains("tok_live_987654"));
            assertFalse(ex.getMessage().contains("key_live_12345"));
        }
    }

    @Test
    void validate_ShouldRejectBareAndCompactEmailCredentialsWithoutEchoingSecret() {
        String[] rejected = {
            "admin:secret@192.168.1.10",
            "camadmin:barepass88@192.168.1.9:554",
            "email:secret@cam.local",
            "mail:secret@cam.local",
            "Camera login: admin:secret@cam.local",
            "Label:(admin:secret@cam.local)"
        };

        for (String payload : rejected) {
            ValidationException ex = assertThrows(
                ValidationException.class,
                () -> validator.validate(payload),
                "Expected rejection for bare credential payload: " + payload
            );
            assertEquals("connectionNote", ex.getField());
            assertEquals("VALIDATION_ERROR", ex.getErrorCode());
            assertFalse(ex.getMessage().contains("secret"));
            assertFalse(ex.getMessage().contains("barepass88"));
            assertFalse(ex.getMessage().contains("cam.local"));
            assertFalse(ex.getMessage().contains("192.168.1.10"));
        }
    }
}
