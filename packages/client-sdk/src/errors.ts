export class OziowApiError extends Error {
  public statusCode?: number;
  public code?: string;
  public rawData?: any;

  constructor(message: string, statusCode?: number, code?: string, rawData?: any) {
    super(message);
    this.name = 'OziowApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.rawData = rawData;
  }
}

export function handleApiError(error: any): never {
  if (error.response) {
    const data = error.response.data;
    const message = data?.message || data?.error || error.message;
    throw new OziowApiError(
      typeof message === 'object' ? JSON.stringify(message) : message,
      error.response.status,
      data?.statusCode || data?.code,
      data
    );
  }
  throw new OziowApiError(error.message || 'Unknown Network Error');
}
