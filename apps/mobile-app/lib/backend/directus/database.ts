/**
 * Directus Database Provider Implementation
 * 
 * Implements database operations using Directus REST API.
 * 
 * Key differences from Supabase:
 * - Uses Directus Items API (/items/{collection})
 * - Filtering syntax is different (_filter parameter)
 * - No direct RPC support - use custom endpoints or flows
 */

import type { QueryResult, DatabaseError, InsertOptions, UpdateOptions, DeleteOptions, RPCOptions, TenantContext } from '../types';
import type { IDatabaseProvider, IQueryBuilder } from '../interfaces';

interface DirectusConfig {
  baseUrl: string;
  accessToken?: string;
  staticToken?: string;
}

// Helper to convert Directus error
function toDatabaseError(error: any): DatabaseError | null {
  if (!error) return null;
  
  return {
    message: error.message || error.errors?.[0]?.message || 'Unknown database error',
    code: error.code || error.errors?.[0]?.extensions?.code,
    details: JSON.stringify(error.errors),
  };
}

export class DirectusDatabaseProvider implements IDatabaseProvider {
  private config: DirectusConfig;
  
  constructor(config: DirectusConfig) {
    this.config = config;
  }
  
  from(table: string): IQueryBuilder {
    return new DirectusQueryBuilder(this.config, table);
  }
  
  async rpc<T = any>(functionName: string, params?: Record<string, any>, options?: RPCOptions): Promise<QueryResult<T>> {
    // Directus doesn't have native RPC - use custom endpoints
    // This maps to Directus Flows or custom endpoints
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (this.config.accessToken) {
        headers['Authorization'] = `Bearer ${this.config.accessToken}`;
      } else if (this.config.staticToken) {
        headers['Authorization'] = `Bearer ${this.config.staticToken}`;
      }
      
      const method = options?.get ? 'GET' : 'POST';
      const url = options?.get && params
        ? `${this.config.baseUrl}/flows/trigger/${functionName}?${new URLSearchParams(params as any)}`
        : `${this.config.baseUrl}/flows/trigger/${functionName}`;
      
      const response = await fetch(url, {
        method,
        headers,
        body: method === 'POST' ? JSON.stringify(params || {}) : undefined,
      });
      
      const json = await response.json();
      
      if (!response.ok) {
        return {
          data: null,
          error: toDatabaseError(json),
        };
      }
      
      return {
        data: json.data as T,
        error: null,
      };
    } catch (error: any) {
      return {
        data: null,
        error: { message: error.message || 'RPC call failed' },
      };
    }
  }
  
  async setTenantContext(context: TenantContext): Promise<void> {
    // For Directus, tenant context is typically handled via:
    // 1. Request headers that Directus Flows can read
    // 2. User roles and permissions
    // 3. Custom middleware
    // This is a placeholder - implementation depends on your Directus setup
    console.log('Tenant context set:', context);
  }
}

class DirectusQueryBuilder implements IQueryBuilder {
  private config: DirectusConfig;
  private collection: string;
  private queryParams: URLSearchParams = new URLSearchParams();
  private filterConditions: any[] = [];
  private operationType: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private operationData: any = null;
  private selectColumns: string = '*';
  private shouldReturnSingle: boolean = false;
  private shouldReturnMaybeSingle: boolean = false;
  
  constructor(config: DirectusConfig, collection: string) {
    this.config = config;
    this.collection = collection;
  }
  
  private getAuthHeader(): Record<string, string> {
    if (this.config.accessToken) {
      return { 'Authorization': `Bearer ${this.config.accessToken}` };
    } else if (this.config.staticToken) {
      return { 'Authorization': `Bearer ${this.config.staticToken}` };
    }
    return {};
  }
  
  select(columns?: string): IQueryBuilder {
    this.operationType = 'select';
    if (columns) {
      // Convert Supabase-style column selection to Directus fields
      this.selectColumns = columns;
      this.queryParams.set('fields', columns.replace(/\s/g, ''));
    }
    return this;
  }
  
  insert(data: Record<string, any> | Record<string, any>[], options?: InsertOptions): IQueryBuilder {
    this.operationType = 'insert';
    this.operationData = data;
    return this;
  }
  
  update(data: Record<string, any>, options?: UpdateOptions): IQueryBuilder {
    this.operationType = 'update';
    this.operationData = data;
    return this;
  }
  
  delete(options?: DeleteOptions): IQueryBuilder {
    this.operationType = 'delete';
    return this;
  }
  
  upsert(data: Record<string, any> | Record<string, any>[], options?: { onConflict?: string }): IQueryBuilder {
    // Directus handles upsert via PATCH with primary key
    this.operationType = 'update';
    this.operationData = data;
    return this;
  }
  
  // Filter methods - convert to Directus filter syntax
  eq(column: string, value: any): IQueryBuilder {
    this.filterConditions.push({ [column]: { _eq: value } });
    return this;
  }
  
  neq(column: string, value: any): IQueryBuilder {
    this.filterConditions.push({ [column]: { _neq: value } });
    return this;
  }
  
  gt(column: string, value: any): IQueryBuilder {
    this.filterConditions.push({ [column]: { _gt: value } });
    return this;
  }
  
  gte(column: string, value: any): IQueryBuilder {
    this.filterConditions.push({ [column]: { _gte: value } });
    return this;
  }
  
  lt(column: string, value: any): IQueryBuilder {
    this.filterConditions.push({ [column]: { _lt: value } });
    return this;
  }
  
  lte(column: string, value: any): IQueryBuilder {
    this.filterConditions.push({ [column]: { _lte: value } });
    return this;
  }
  
  like(column: string, pattern: string): IQueryBuilder {
    this.filterConditions.push({ [column]: { _contains: pattern.replace(/%/g, '') } });
    return this;
  }
  
  ilike(column: string, pattern: string): IQueryBuilder {
    // Directus _contains is case-insensitive by default
    this.filterConditions.push({ [column]: { _icontains: pattern.replace(/%/g, '') } });
    return this;
  }
  
  is(column: string, value: null | boolean): IQueryBuilder {
    if (value === null) {
      this.filterConditions.push({ [column]: { _null: true } });
    } else {
      this.filterConditions.push({ [column]: { _eq: value } });
    }
    return this;
  }
  
  in(column: string, values: any[]): IQueryBuilder {
    this.filterConditions.push({ [column]: { _in: values } });
    return this;
  }
  
  contains(column: string, value: any): IQueryBuilder {
    this.filterConditions.push({ [column]: { _contains: value } });
    return this;
  }
  
  containedBy(column: string, value: any): IQueryBuilder {
    // Directus doesn't have exact equivalent
    this.filterConditions.push({ [column]: { _in: Array.isArray(value) ? value : [value] } });
    return this;
  }
  
  not(column: string, operator: string, value: any): IQueryBuilder {
    // Map to Directus negation
    const opMap: Record<string, string> = {
      'eq': '_neq',
      'in': '_nin',
    };
    const directusOp = opMap[operator] || '_neq';
    this.filterConditions.push({ [column]: { [directusOp]: value } });
    return this;
  }
  
  or(filters: string): IQueryBuilder {
    // Parse Supabase-style OR syntax and convert to Directus _or
    // This is a simplified implementation
    const conditions = filters.split(',').map(f => {
      const [column, rest] = f.split('.');
      const [op, value] = rest.split('.');
      return { [column]: { [`_${op}`]: value } };
    });
    this.filterConditions.push({ _or: conditions });
    return this;
  }
  
  filter(column: string, operator: string, value: any): IQueryBuilder {
    const opMap: Record<string, string> = {
      'eq': '_eq',
      'neq': '_neq',
      'gt': '_gt',
      'gte': '_gte',
      'lt': '_lt',
      'lte': '_lte',
      'like': '_contains',
      'ilike': '_icontains',
      'in': '_in',
      'is': '_null',
    };
    const directusOp = opMap[operator] || `_${operator}`;
    this.filterConditions.push({ [column]: { [directusOp]: value } });
    return this;
  }
  
  match(query: Record<string, any>): IQueryBuilder {
    for (const [key, value] of Object.entries(query)) {
      this.filterConditions.push({ [key]: { _eq: value } });
    }
    return this;
  }
  
  // Modifier methods
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): IQueryBuilder {
    const direction = options?.ascending === false ? '-' : '';
    this.queryParams.set('sort', `${direction}${column}`);
    return this;
  }
  
  limit(count: number): IQueryBuilder {
    this.queryParams.set('limit', count.toString());
    return this;
  }
  
  range(from: number, to: number): IQueryBuilder {
    this.queryParams.set('offset', from.toString());
    this.queryParams.set('limit', (to - from + 1).toString());
    return this;
  }
  
  single(): IQueryBuilder {
    this.shouldReturnSingle = true;
    this.queryParams.set('limit', '1');
    return this;
  }
  
  maybeSingle(): IQueryBuilder {
    this.shouldReturnMaybeSingle = true;
    this.queryParams.set('limit', '1');
    return this;
  }
  
  // Build filter string
  private buildFilter(): string {
    if (this.filterConditions.length === 0) {
      return '';
    }
    
    const filter = this.filterConditions.length === 1
      ? this.filterConditions[0]
      : { _and: this.filterConditions };
    
    return JSON.stringify(filter);
  }
  
  // Execution
  async then<T = any>(resolve: (result: QueryResult<T>) => void): Promise<QueryResult<T>> {
    try {
      const filter = this.buildFilter();
      if (filter) {
        this.queryParams.set('filter', filter);
      }
      
      let url = `${this.config.baseUrl}/items/${this.collection}`;
      let method = 'GET';
      let body: string | undefined;
      
      switch (this.operationType) {
        case 'select':
          method = 'GET';
          const params = this.queryParams.toString();
          if (params) {
            url += `?${params}`;
          }
          break;
          
        case 'insert':
          method = 'POST';
          body = JSON.stringify(this.operationData);
          break;
          
        case 'update':
          method = 'PATCH';
          // If we have filters, we need to update matching items
          if (this.filterConditions.length > 0) {
            const filterParams = this.queryParams.toString();
            if (filterParams) {
              url += `?${filterParams}`;
            }
          }
          body = JSON.stringify(this.operationData);
          break;
          
        case 'delete':
          method = 'DELETE';
          if (this.filterConditions.length > 0) {
            const filterParams = this.queryParams.toString();
            if (filterParams) {
              url += `?${filterParams}`;
            }
          }
          break;
      }
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeader(),
        },
        body,
      });
      
      const json = await response.json();
      
      if (!response.ok) {
        const result: QueryResult<T> = {
          data: null,
          error: toDatabaseError(json),
        };
        if (resolve) resolve(result);
        return result;
      }
      
      let data = json.data;
      
      // Handle single/maybeSingle
      if (this.shouldReturnSingle) {
        if (Array.isArray(data) && data.length === 0) {
          const result: QueryResult<T> = {
            data: null,
            error: { message: 'No rows returned' },
          };
          if (resolve) resolve(result);
          return result;
        }
        data = Array.isArray(data) ? data[0] : data;
      } else if (this.shouldReturnMaybeSingle) {
        data = Array.isArray(data) ? data[0] || null : data;
      }
      
      const result: QueryResult<T> = {
        data: data as T,
        error: null,
        count: Array.isArray(json.data) ? json.data.length : undefined,
      };
      
      if (resolve) resolve(result);
      return result;
    } catch (error: any) {
      const result: QueryResult<T> = {
        data: null,
        error: { message: error.message || 'Query failed' },
      };
      if (resolve) resolve(result);
      return result;
    }
  }
}
