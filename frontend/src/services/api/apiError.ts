import axios, { AxiosError } from 'axios';
import type { ApiResponse } from './apiTypes';

export class AppApiError extends Error {
  readonly statusCode?: number;
  readonly code: string;
  readonly field?: string;
  readonly isNetworkError: boolean;
  readonly isAuthError: boolean;
  readonly isValidationError: boolean;
  readonly isConflictError: boolean;
  readonly timestamp?: string;

  constructor(params: {
    message: string;
    statusCode?: number;
    code?: string;
    field?: string;
    isNetworkError?: boolean;
    timestamp?: string;
  }) {
    super(params.message);
    this.name = 'AppApiError';
    this.statusCode = params.statusCode;
    this.code = params.code || 'UNKNOWN_ERROR';
    this.field = params.field;
    this.isNetworkError = Boolean(params.isNetworkError);
    this.isAuthError = params.statusCode === 401;
    this.isValidationError = params.statusCode === 400;
    this.isConflictError = params.statusCode === 409;
    this.timestamp = params.timestamp;
  }
}

function getDefaultStatusMessage(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'Dữ liệu đầu vào không hợp lệ';
    case 401:
      return 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.';
    case 403:
      return 'Bạn không có quyền thực hiện thao tác này.';
    case 404:
      return 'Không tìm thấy dữ liệu yêu cầu.';
    case 409:
      return 'Dữ liệu đã tồn tại hoặc xảy ra xung đột.';
    case 500:
    case 502:
    case 503:
    case 504:
      return 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.';
    default:
      return `Lỗi máy chủ (${statusCode}). Vui lòng thử lại.`;
  }
}

export function normalizeApiError(error: unknown): AppApiError {
  if (error instanceof AppApiError) {
    return error;
  }

  if (axios.isAxiosError(error)) {
    const axiosErr = error as AxiosError<ApiResponse>;

    // Response received from server
    if (axiosErr.response) {
      const status = axiosErr.response.status;
      const data = axiosErr.response.data;

      const code = data?.error?.code || `HTTP_${status}`;
      const field = data?.error?.field;
      const timestamp = data?.timestamp;

      // Extract message priority: data.error.message -> data.message -> default status text
      const message =
        data?.error?.message?.trim() ||
        data?.message?.trim() ||
        getDefaultStatusMessage(status);

      return new AppApiError({
        message,
        statusCode: status,
        code,
        field,
        timestamp,
      });
    }

    // Network timeout or no response
    if (axiosErr.code === 'ECONNABORTED' || axiosErr.message.includes('timeout')) {
      return new AppApiError({
        message: 'Kết nối đến máy chủ quá thời gian chờ. Vui lòng thử lại.',
        code: 'TIMEOUT_ERROR',
        isNetworkError: true,
      });
    }

    return new AppApiError({
      message: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại mạng hoặc địa chỉ máy chủ API.',
      code: 'NETWORK_ERROR',
      isNetworkError: true,
    });
  }

  if (error instanceof Error) {
    return new AppApiError({
      message: error.message || 'Đã có lỗi xảy ra. Vui lòng thử lại.',
      code: 'UNKNOWN_ERROR',
    });
  }

  return new AppApiError({
    message: 'Đã có lỗi không xác định xảy ra.',
    code: 'UNKNOWN_ERROR',
  });
}
