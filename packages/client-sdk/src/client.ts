import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { handleApiError } from './errors';

export interface OziowClientOptions {
  baseURL: string;
  apiKey?: string;
  token?: string;
  locale?: string;
}

export class OziowHttpClient {
  public readonly options: OziowClientOptions;
  protected client: AxiosInstance;
  private token?: string;
  private locale?: string;

  constructor(options: OziowClientOptions) {
    this.options = options;
    this.token = options.token;
    this.locale = options.locale || 'fr';
    
    this.client = axios.create({
      baseURL: options.baseURL,
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': this.locale,
        ...(options.apiKey ? { 'x-api-key': options.apiKey } : {}),
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
    });
  }

  public setToken(token: string) {
    this.token = token;
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  public clearToken() {
    this.token = undefined;
    delete this.client.defaults.headers.common['Authorization'];
  }

  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.client.get<T>(url, config);
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  }

  public async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.client.post<T>(url, data, config);
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  }

  public async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.client.put<T>(url, data, config);
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  }

  public async patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.client.patch<T>(url, data, config);
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  }

  public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.client.delete<T>(url, config);
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  }
}
