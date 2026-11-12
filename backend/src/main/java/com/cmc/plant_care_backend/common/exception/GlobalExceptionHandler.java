package com.cmc.plant_care_backend.common.exception;

import com.cmc.plant_care_backend.common.response.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import tools.jackson.databind.DatabindException;

import java.util.List;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(AppException.class)
    public ResponseEntity<ApiResponse<Void>> handleAppException(AppException ex) {
        log.warn("Application error [{}]: {}", ex.getErrorCode(), ex.getMessage());
        ApiResponse<Void> res = ApiResponse.failure(ex.getErrorCode(), ex.getMessage(), ex.getField());
        return new ResponseEntity<>(res, ex.getStatus());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidationException(MethodArgumentNotValidException ex) {
        FieldError fieldError = ex.getBindingResult().getFieldError();
        String field = fieldError != null ? fieldError.getField() : "unknown";
        String message = fieldError != null ? fieldError.getDefaultMessage() : "Dữ liệu đầu vào không hợp lệ";
        log.warn("Validation error on field '{}': {}", field, message);
        ApiResponse<Void> res = ApiResponse.failure("VALIDATION_ERROR", message, field);
        return new ResponseEntity<>(res, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiResponse<Void>> handleTypeMismatchException(MethodArgumentTypeMismatchException ex) {
        String field = ex.getName();
        String message = "Tham số '" + field + "' không đúng định dạng.";
        log.warn("Type mismatch error on parameter '{}': {}", field, ex.getMessage());
        ApiResponse<Void> res = ApiResponse.failure("VALIDATION_ERROR", message, field);
        return new ResponseEntity<>(res, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> handleHttpMessageNotReadable(HttpMessageNotReadableException ex) {
        String field = null;
        Throwable cause = ex.getCause();
        if (cause instanceof DatabindException databindException) {
            List<?> path = databindException.getPath();
            if (path != null && !path.isEmpty()) {
                Object last = path.get(path.size() - 1);
                if (last instanceof DatabindException.Reference ref && ref.getPropertyName() != null) {
                    field = ref.getPropertyName();
                }
            }
        }
        log.warn("Unreadable or malformed request payload [{}] on field '{}'", ex.getClass().getSimpleName(), field);
        String message = field != null
            ? "Giá trị trường '" + field + "' không hợp lệ."
            : "Dữ liệu đầu vào không hợp lệ hoặc sai định dạng JSON.";
        ApiResponse<Void> res = ApiResponse.failure("VALIDATION_ERROR", message, field);
        return new ResponseEntity<>(res, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<ApiResponse<Void>> handleBadCredentials(BadCredentialsException ex) {
        log.warn("Authentication failed: {}", ex.getMessage());
        ApiResponse<Void> res = ApiResponse.failure("UNAUTHORIZED", "Tài khoản hoặc mật khẩu không chính xác.");
        return new ResponseEntity<>(res, HttpStatus.UNAUTHORIZED);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessDenied(AccessDeniedException ex) {
        log.warn("Access denied: {}", ex.getMessage());
        ApiResponse<Void> res = ApiResponse.failure("FORBIDDEN", "Bạn không có quyền thực hiện thao tác này.");
        return new ResponseEntity<>(res, HttpStatus.FORBIDDEN);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleGenericException(Exception ex) {
        log.error("Internal server error: ", ex);
        ApiResponse<Void> res = ApiResponse.failure("INTERNAL_ERROR", "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.");
        return new ResponseEntity<>(res, HttpStatus.INTERNAL_SERVER_ERROR);
    }
}
