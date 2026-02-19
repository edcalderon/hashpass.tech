/**
 * Supabase Storage Provider Implementation
 * 
 * Wraps the existing Supabase storage functionality behind the IStorageProvider interface.
 * Note: HashPass currently uses Cloudinary for images, but this abstraction enables
 * future use of S3-compatible storage.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { StorageBucket, StorageFile, UploadOptions, UploadResult, DownloadResult } from '../types';
import type { IStorageProvider, IStorageBucketApi } from '../interfaces';

export class SupabaseStorageProvider implements IStorageProvider {
  private client: SupabaseClient;
  
  constructor(client: SupabaseClient) {
    this.client = client;
  }
  
  async createBucket(name: string, options?: { public?: boolean }): Promise<{ data: StorageBucket | null; error: any }> {
    const { data, error } = await this.client.storage.createBucket(name, {
      public: options?.public ?? false,
    });
    
    if (error) {
      return { data: null, error };
    }
    
    return {
      data: {
        id: data.name,
        name: data.name,
        public: options?.public ?? false,
        created_at: new Date().toISOString(),
      },
      error: null,
    };
  }
  
  async getBucket(name: string): Promise<{ data: StorageBucket | null; error: any }> {
    const { data, error } = await this.client.storage.getBucket(name);
    
    if (error || !data) {
      return { data: null, error };
    }
    
    return {
      data: {
        id: data.id,
        name: data.name,
        public: data.public,
        created_at: data.created_at,
        updated_at: data.updated_at,
      },
      error: null,
    };
  }
  
  async listBuckets(): Promise<{ data: StorageBucket[] | null; error: any }> {
    const { data, error } = await this.client.storage.listBuckets();
    
    if (error || !data) {
      return { data: null, error };
    }
    
    return {
      data: data.map(bucket => ({
        id: bucket.id,
        name: bucket.name,
        public: bucket.public,
        created_at: bucket.created_at,
        updated_at: bucket.updated_at,
      })),
      error: null,
    };
  }
  
  async deleteBucket(name: string): Promise<{ error: any }> {
    const { error } = await this.client.storage.deleteBucket(name);
    return { error };
  }
  
  async emptyBucket(name: string): Promise<{ error: any }> {
    const { error } = await this.client.storage.emptyBucket(name);
    return { error };
  }
  
  from(bucket: string): IStorageBucketApi {
    return new SupabaseStorageBucketApi(this.client, bucket);
  }
}

class SupabaseStorageBucketApi implements IStorageBucketApi {
  private client: SupabaseClient;
  private bucket: string;
  
  constructor(client: SupabaseClient, bucket: string) {
    this.client = client;
    this.bucket = bucket;
  }
  
  async upload(path: string, file: File | Blob | ArrayBuffer | string, options?: UploadOptions): Promise<UploadResult> {
    const { data, error } = await this.client.storage.from(this.bucket).upload(path, file, {
      cacheControl: options?.cacheControl,
      contentType: options?.contentType,
      upsert: options?.upsert,
    });
    
    return {
      path: data?.path || path,
      fullPath: data?.fullPath,
      error: error ? { message: error.message, statusCode: (error as any).statusCode } : null,
    };
  }
  
  async download(path: string): Promise<DownloadResult> {
    const { data, error } = await this.client.storage.from(this.bucket).download(path);
    
    return {
      data: data || null,
      error: error ? { message: error.message, statusCode: (error as any).statusCode } : null,
    };
  }
  
  async list(folder?: string, options?: { limit?: number; offset?: number; sortBy?: { column: string; order: string } }): Promise<{ data: StorageFile[] | null; error: any }> {
    const { data, error } = await this.client.storage.from(this.bucket).list(folder, {
      limit: options?.limit,
      offset: options?.offset,
      sortBy: options?.sortBy,
    });
    
    if (error || !data) {
      return { data: null, error };
    }
    
    return {
      data: data.map(file => ({
        id: file.id || file.name,
        name: file.name,
        bucket_id: this.bucket,
        created_at: file.created_at || new Date().toISOString(),
        updated_at: file.updated_at,
        last_accessed_at: file.last_accessed_at,
        metadata: file.metadata,
      })),
      error: null,
    };
  }
  
  async move(fromPath: string, toPath: string): Promise<{ error: any }> {
    const { error } = await this.client.storage.from(this.bucket).move(fromPath, toPath);
    return { error };
  }
  
  async copy(fromPath: string, toPath: string): Promise<{ error: any }> {
    const { error } = await this.client.storage.from(this.bucket).copy(fromPath, toPath);
    return { error };
  }
  
  async remove(paths: string[]): Promise<{ data: { name: string }[] | null; error: any }> {
    const { data, error } = await this.client.storage.from(this.bucket).remove(paths);
    return { data, error };
  }
  
  getPublicUrl(path: string): { data: { publicUrl: string } } {
    const { data } = this.client.storage.from(this.bucket).getPublicUrl(path);
    return { data };
  }
  
  async createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: any }> {
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUrl(path, expiresIn);
    return { data, error };
  }
  
  async createSignedUrls(paths: string[], expiresIn: number): Promise<{ data: { signedUrl: string; path: string }[] | null; error: any }> {
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUrls(paths, expiresIn);
    // Map the result to ensure path is always a string
    const mappedData = data?.map(item => ({
      signedUrl: item.signedUrl,
      path: item.path || '',
    })) || null;
    return { data: mappedData, error };
  }
  
  async createSignedUploadUrl(path: string): Promise<{ data: { signedUrl: string; token: string; path: string } | null; error: any }> {
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUploadUrl(path);
    return { data, error };
  }
  
  async uploadToSignedUrl(path: string, token: string, file: File | Blob | ArrayBuffer, options?: UploadOptions): Promise<UploadResult> {
    const { data, error } = await this.client.storage.from(this.bucket).uploadToSignedUrl(path, token, file, {
      cacheControl: options?.cacheControl,
      contentType: options?.contentType,
      upsert: options?.upsert,
    });
    
    return {
      path: data?.path || path,
      fullPath: data?.fullPath,
      error: error ? { message: error.message, statusCode: (error as any).statusCode } : null,
    };
  }
}
