package com.cmc.plant_care_backend.dto.auth;

import com.cmc.plant_care_backend.model.enums.PreferredDevice;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class RegisterRequest {

    @NotBlank(message = "Họ và tên không được để trống")
    @Size(min = 2, max = 200, message = "Họ và tên phải từ 2 đến 200 ký tự")
    private String fullName;

    @NotBlank(message = "Tài khoản (email hoặc số điện thoại) không được để trống")
    private String account;

    private String recoveryEmail;

    @NotBlank(message = "Mật khẩu không được để trống")
    @Size(min = 8, message = "Mật khẩu phải có ít nhất 8 ký tự")
    private String password;

    private PreferredDevice preferredDevice = PreferredDevice.MOBILE;

    public RegisterRequest() {}

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String getAccount() {
        return account;
    }

    public void setAccount(String account) {
        this.account = account;
    }

    public String getRecoveryEmail() {
        return recoveryEmail;
    }

    public void setRecoveryEmail(String recoveryEmail) {
        this.recoveryEmail = recoveryEmail;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public PreferredDevice getPreferredDevice() {
        return preferredDevice;
    }

    public void setPreferredDevice(PreferredDevice preferredDevice) {
        this.preferredDevice = preferredDevice;
    }
}
