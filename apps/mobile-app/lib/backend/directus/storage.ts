/**
 * Directus Storage Provider Implementation
 * 
 * Directus uses its Files API for storage operations.
 * This implementation maps our storage interface to Directus Files API.
 * 
 * Key differences from Supabase:
 * - Uses /files endpoint instead of storage buckets
 * - Folders in Directus are virtual (stored as metadata)
 * - Can be configured to use S3, GCS, or local storage
 */

import type { StorageBucket, StorageFile, UploadOptions, UploadResult, DownloadResult } from '../types';
import type { IStorageProvider, IStorageBucketApi } from '../interfaces';

interface DirectusStorageConfig {
  baseUrl: string;
  accessToken?: string;
  staticToken?: string;
}

export class DirectusStorageProvider implements IStorageProvider {
  private config: DirectusStorageConfig;
  
  constructor(config: DirectusStorageConfig) {
    this.config = config;
  }
  
  private getAuthHeader(): Record<string, string> {
    if (this.config.accessToken) {
      return { 'Authorization': `Bearer ${this.config.accessToken}` };
    } else if (this.config.staticToken) {
      return { 'Authorization': `Bearer ${this.config.staticToken}` };
    }
    return {};
  }
  
  async createBucket(name: string, options?: { public?: boolean }): Promise<{ data: StorageBucket | null; error: any }> {
    // Directus uses folders instead of buckets
    // Create a folder to simulate a bucket
    try {
      const response = await fetch(`${this.config.baseUrl}/folders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeader(),
        },
        body: JSON.stringify({ name }),
      });
      
      const json = await response.json();
      
      if (!response.ok) {
        return { data: null, error: json.errors?.[0] || json };
      }
      
      return {
        data: {
          id: json.data.id,
          name: json.data.name,
          public: options?.public ?? false,
          created_at: new Date().toISOString(),
        },
        error: null,
      };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  }
  
  async getBucket(name: string): Promise<{ data: StorageBucket | null; error: any }> {
    try {
      const response = await fetch(
        `${this.config.baseUrl}/folders?filter[name][_eq]=${encodeURIComponent(name)}`,
        { headers: this.getAuthHeader() }
      );
      
      const json = await response.json();
      
      if (!response.ok || !json.data?.length) {
        return { data: null, error: json.errors?.[0] || { message: 'Folder not found' } };
      }
      
      const folder = json.data[0];
      return {
        data: {
          id: folder.id,
          name: folder.name,
          public: false,
          created_at: new Date().toISOString(),
        },
        error: null,
      };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  }
  
  async listBuckets(): Promise<{ data: StorageBucket[] | null; error: any }> {
    try {
      const response = await fetch(
        `${this.config.baseUrl}/folders`,
        { headers: this.getAuthHeader() }
      );
      
      const json = await response.json();
      
      if (!response.ok) {
        return { data: null, error: json.errors?.[0] || json };
      }
      
      return {
        data: (json.data || []).map((folder: any) => ({
          id: folder.id,
          name: folder.name,
          public: false,
          created_at: new Date().toISOString(),
        })),
        error: null,
      };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  }
  
  async deleteBucket(name: string): Promise<{ error: any }> {
    try {
      // First find the folder
      const { data: bucket, error: findError } = await this.getBucket(name);
      if (findError || !bucket) {
        return { error: findError || { message: 'Folder not found' } };
      }
      
      const response = await fetch(
        `${this.config.baseUrl}/folders/${bucket.id}`,
        {
          method: 'DELETE',
          headers: this.getAuthHeader(),
        }
      );
      
      if (!response.ok) {
        const json = await response.json();
        return { error: json.errors?.[0] || json };
      }
      
      return { error: null };
    } catch (error: any) {
      return { error: { message: error.message } };
    }
  }
  
  async emptyBucket(name: string): Promise<{ error: any }> {
    try {
      const { data: bucket, error: findError } = await this.getBucket(name);
      if (findError || !bucket) {
        return { error: findError || { message: 'Folder not found' } };
      }
      
      // Get all files in folder
      const response = await fetch(
        `${this.config.baseUrl}/files?filter[folder][_eq]=${bucket.id}`,
        { headers: this.getAuthHeader() }
      );
      
      const json = await response.json();
      
      if (!response.ok) {
        return { error: json.errors?.[0] || json };
      }
      
      // Delete each file
      for (const file of json.data || []) {
        await fetch(
          `${this.config.baseUrl}/files/${file.id}`,
          {
            method: 'DELETE',
            headers: this.getAuthHeader(),
          }
        );
      }
      
      return { error: null };
    } catch (error: any) {
      return { error: { message: error.message } };
    }
  }
  
  from(bucket: string): IStorageBucketApi {
    return new DirectusStorageBucketApi(this.config, bucket);
  }
}

class DirectusStorageBucketApi implements IStorageBucketApi {
  private config: DirectusStorageConfig;
  private bucketName: string;
  private folderId: string | null = null;
  
  constructor(config: DirectusStorageConfig, bucketName: string) {
    this.config = config;
    this.bucketName = bucketName;
  }
  
  private getAuthHeader(): Record<string, string> {
    if (this.config.accessToken) {
      return { 'Authorization': `Bearer ${this.config.accessToken}` };
    } else if (this.config.staticToken) {
      return { 'Authorization': `Bearer ${this.config.staticToken}` };
    }
    return {};
  }
  
  private async getFolderId(): Promise<string | null> {
    if (this.folderId) return this.folderId;
    
    try {
      const response = await fetch(
        `${this.config.baseUrl}/folders?filter[name][_eq]=${encodeURIComponent(this.bucketName)}`,
        { headers: this.getAuthHeader() }
      );
      
      const json = await response.json();
      if (json.data?.length) {
        this.folderId = json.data[0].id;
      }
      
      return this.folderId;
    } catch {
      return null;
    }
  }
  
  async upload(path: string, file: File | Blob | ArrayBuffer | string, options?: UploadOptions): Promise<UploadResult> {
    try {
      const folderId = await this.getFolderId();
      
      const formData = new FormData();
      
      // Convert various input types to Blob
      let blob: Blob;
      if (file instanceof Blob) {
        blob = file;
      } else if (file instanceof ArrayBuffer) {
        blob = new Blob([file]);
      } else if (typeof file === 'string') {
        blob = new Blob([file], { type: 'text/plain' });
      } else {
        blob = file as Blob;
      }
      
      // Extract filename from path
      const filename = path.split('/').pop() || path;
      
      formData.append('file', blob, filename);
      formData.append('title', filename);
      
      if (folderId) {
        formData.append('folder', folderId);
      }
      
      if (options?.contentType) {
        // Content type is set in the Blob
      }
      
      const response = await fetch(`${this.config.baseUrl}/files`, {
        method: 'POST',
        headers: this.getAuthHeader(),
        body: formData,
      });
      
      const json = await response.json();
      
      if (!response.ok) {
        return {
          path,
          error: { message: json.errors?.[0]?.message || 'Upload failed' },
        };
      }
      
      return {
        path: json.data.id,
        fullPath: `${this.config.baseUrl}/assets/${json.data.id}`,
        error: null,
      };
    } catch (error: any) {
      return {
        path,
        error: { message: error.message },
      };
    }
  }
  
  async download(path: string): Promise<DownloadResult> {
    try {
      const response = await fetch(
        `${this.config.baseUrl}/assets/${path}`,
        { headers: this.getAuthHeader() }
      );
      
      if (!response.ok) {
        return {
          data: null,
          error: { message: 'Download failed', statusCode: response.status },
        };
      }
      
      const blob = await response.blob();
      return { data: blob, error: null };
    } catch (error: any) {
      return {
        data: null,
        error: { message: error.message },
      };
    }
  }
  
  async list(folder?: string, options?: { limit?: number; offset?: number; sortBy?: { column: string; order: string } }): Promise<{ data: StorageFile[] | null; error: any }> {
    try {
      const folderId = await this.getFolderId();
      
      let url = `${this.config.baseUrl}/files?`;
      const params = new URLSearchParams();
      
      if (folderId) {
        params.set('filter[folder][_eq]', folderId);
      }
      
      if (options?.limit) {
        params.set('limit', options.limit.toString());
      }
      
      if (options?.offset) {
        params.set('offset', options.offset.toString());
      }
      
      if (options?.sortBy) {
        const direction = options.sortBy.order === 'desc' ? '-' : '';
        params.set('sort', `${direction}${options.sortBy.column}`);
      }
      
      const response = await fetch(url + params.toString(), {
        headers: this.getAuthHeader(),
      });
      
      const json = await response.json();
      
      if (!response.ok) {
        return { data: null, error: json.errors?.[0] || json };
      }
      
      return {
        data: (json.data || []).map((file: any) => ({
          id: file.id,
          name: file.filename_download || file.title,
          bucket_id: this.bucketName,
          created_at: file.uploaded_on,
          updated_at: file.modified_on,
          metadata: file.metadata,
        })),
        error: null,
      };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  }
  
  async move(fromPath: string, toPath: string): Promise<{ error: any }> {
    // Directus doesn't have a direct move - would need to update file metadata
    try {
      const response = await fetch(`${this.config.baseUrl}/files/${fromPath}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeader(),
        },
        body: JSON.stringify({
          filename_download: toPath.split('/').pop(),
        }),
      });
      
      if (!response.ok) {
        const json = await response.json();
        return { error: json.errors?.[0] || json };
      }
      
      return { error: null };
    } catch (error: any) {
      return { error: { message: error.message } };
    }
  }
  
  async copy(fromPath: string, toPath: string): Promise<{ error: any }> {
    // Directus doesn't have native copy - download and re-upload
    try {
      const downloadResult = await this.download(fromPath);
      if (downloadResult.error || !downloadResult.data) {
        return { error: downloadResult.error };
      }
      
      const uploadResult = await this.upload(toPath, downloadResult.data);
      return { error: uploadResult.error };
    } catch (error: any) {
      return { error: { message: error.message } };
    }
  }
  
  async remove(paths: string[]): Promise<{ data: { name: string }[] | null; error: any }> {
    try {
      const deleted: { name: string }[] = [];
      
      for (const path of paths) {
        const response = await fetch(`${this.config.baseUrl}/files/${path}`, {
          method: 'DELETE',
          headers: this.getAuthHeader(),
        });
        
        if (response.ok) {
          deleted.push({ name: path });
        }
      }
      
      return { data: deleted, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  }
  
  getPublicUrl(path: string): { data: { publicUrl: string } } {
    return {
      data: {
        publicUrl: `${this.config.baseUrl}/assets/${path}`,
      },
    };
  }
  
  async createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: any }> {
    // Directus doesn't have built-in signed URLs for time-limited access
    // This would need to be implemented via custom endpoint
    // For now, return the public URL
    return {
      data: {
        signedUrl: `${this.config.baseUrl}/assets/${path}`,
      },
      error: null,
    };
  }
  
  async createSignedUrls(paths: string[], expiresIn: number): Promise<{ data: { signedUrl: string; path: string }[] | null; error: any }> {
    return {
      data: paths.map(path => ({
        signedUrl: `${this.config.baseUrl}/assets/${path}`,
        path,
      })),
      error: null,
    };
  }
  
  async createSignedUploadUrl(path: string): Promise<{ data: { signedUrl: string; token: string; path: string } | null; error: any }> {
    // Directus doesn't have pre-signed upload URLs
    // Uploads go through the standard /files endpoint
    return {
      data: null,
      error: { message: 'Signed upload URLs not supported in Directus - use direct upload' },
    };
  }
  
  async uploadToSignedUrl(path: string, token: string, file: File | Blob | ArrayBuffer, options?: UploadOptions): Promise<UploadResult> {
    // Fall back to regular upload
    return this.upload(path, file, options);
  }
}
