package com.cmc.plant_care_backend.common.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.OffsetDateTime;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiResponse<T> {

    private boolean success;
    private T data;
    private String message;
    private ErrorDetail error;
    private OffsetDateTime timestamp;

    public ApiResponse() {
        this.timestamp = OffsetDateTime.now();
    }

    public static <T> ApiResponse<T> ok(T data) {
        ApiResponse<T> res = new ApiResponse<>();
        res.setSuccess(true);
        res.setData(data);
        res.setMessage("OK");
        return res;
    }

    public static <T> ApiResponse<T> ok(T data, String message) {
        ApiResponse<T> res = new ApiResponse<>();
        res.setSuccess(true);
        res.setData(data);
        res.setMessage(message);
        return res;
    }

    public static <T> ApiResponse<T> created(T data) {
        ApiResponse<T> res = new ApiResponse<>();
        res.setSuccess(true);
        res.setData(data);
        res.setMessage("Created");
        return res;
    }

    public static <T> ApiResponse<T> message(String message) {
        ApiResponse<T> res = new ApiResponse<>();
        res.setSuccess(true);
        res.setMessage(message);
        return res;
    }

    public static <T> ApiResponse<T> failure(String errorCode, String message) {
        ApiResponse<T> res = new ApiResponse<>();
        res.setSuccess(false);
        res.setError(new ErrorDetail(errorCode, message));
        return res;
    }

    public static <T> ApiResponse<T> failure(String errorCode, String message, String field) {
        ApiResponse<T> res = new ApiResponse<>();
        res.setSuccess(false);
        res.setError(new ErrorDetail(errorCode, message, field));
        return res;
    }

    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public T getData() {
        return data;
    }

    public void setData(T data) {
        this.data = data;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public ErrorDetail getError() {
        return error;
    }

    public void setError(ErrorDetail error) {
        this.error = error;
    }

    public OffsetDateTime getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(OffsetDateTime timestamp) {
        this.timestamp = timestamp;
    }
}
