/**
 * Supabase Database Provider Implementation
 * 
 * Wraps the existing Supabase database functionality behind the IDatabaseProvider interface.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { QueryResult, DatabaseError, InsertOptions, UpdateOptions, DeleteOptions, RPCOptions, TenantContext } from '../types';
import type { IDatabaseProvider, IQueryBuilder } from '../interfaces';

// Helper to convert Supabase error to our DatabaseError type
function toDatabaseError(error: any): DatabaseError | null {
  if (!error) return null;
  
  return {
    message: error.message || 'Unknown database error',
    code: error.code,
    details: error.details,
    hint: error.hint,
  };
}

export class SupabaseDatabaseProvider implements IDatabaseProvider {
  private client: SupabaseClient;
  
  constructor(client: SupabaseClient) {
    this.client = client;
  }
  
  from(table: string): IQueryBuilder {
    return new SupabaseQueryBuilder(this.client, table);
  }
  
  async rpc<T = any>(functionName: string, params?: Record<string, any>, options?: RPCOptions): Promise<QueryResult<T>> {
    const { data, error, count } = await this.client.rpc(functionName, params || {}, {
      head: options?.head,
      get: options?.get,
    });
    
    return {
      data: data as T,
      error: toDatabaseError(error),
      count: count || undefined,
    };
  }
  
  async setTenantContext(context: TenantContext): Promise<void> {
    // Set the tenant context for RLS policies
    // This is done via a PostgreSQL config parameter
    await this.client.rpc('set_config', {
      setting: 'app.tenant_id',
      value: context.tenantId,
      is_local: true,
    });
    
    if (context.userId) {
      await this.client.rpc('set_config', {
        setting: 'app.user_id',
        value: context.userId,
        is_local: true,
      });
    }
  }
}

class SupabaseQueryBuilder implements IQueryBuilder {
  private client: SupabaseClient;
  private table: string;
  private query: any;
  
  constructor(client: SupabaseClient, table: string) {
    this.client = client;
    this.table = table;
    this.query = client.from(table);
  }
  
  select(columns?: string): IQueryBuilder {
    this.query = this.query.select(columns || '*');
    return this;
  }
  
  insert(data: Record<string, any> | Record<string, any>[], options?: InsertOptions): IQueryBuilder {
    const insertOptions: any = {};
    if (options?.onConflict) {
      insertOptions.onConflict = options.onConflict;
    }
    if (options?.ignoreDuplicates) {
      insertOptions.ignoreDuplicates = options.ignoreDuplicates;
    }
    
    this.query = this.client.from(this.table).insert(data, insertOptions);
    
    if (options?.returning !== false) {
      this.query = this.query.select();
    }
    
    return this;
  }
  
  update(data: Record<string, any>, options?: UpdateOptions): IQueryBuilder {
    this.query = this.client.from(this.table).update(data);
    
    if (options?.returning !== false) {
      this.query = this.query.select();
    }
    
    return this;
  }
  
  delete(options?: DeleteOptions): IQueryBuilder {
    this.query = this.client.from(this.table).delete();
    
    if (options?.returning) {
      this.query = this.query.select();
    }
    
    return this;
  }
  
  upsert(data: Record<string, any> | Record<string, any>[], options?: { onConflict?: string }): IQueryBuilder {
    this.query = this.client.from(this.table).upsert(data, {
      onConflict: options?.onConflict,
    });
    return this;
  }
  
  // Filter methods
  eq(column: string, value: any): IQueryBuilder {
    this.query = this.query.eq(column, value);
    return this;
  }
  
  neq(column: string, value: any): IQueryBuilder {
    this.query = this.query.neq(column, value);
    return this;
  }
  
  gt(column: string, value: any): IQueryBuilder {
    this.query = this.query.gt(column, value);
    return this;
  }
  
  gte(column: string, value: any): IQueryBuilder {
    this.query = this.query.gte(column, value);
    return this;
  }
  
  lt(column: string, value: any): IQueryBuilder {
    this.query = this.query.lt(column, value);
    return this;
  }
  
  lte(column: string, value: any): IQueryBuilder {
    this.query = this.query.lte(column, value);
    return this;
  }
  
  like(column: string, pattern: string): IQueryBuilder {
    this.query = this.query.like(column, pattern);
    return this;
  }
  
  ilike(column: string, pattern: string): IQueryBuilder {
    this.query = this.query.ilike(column, pattern);
    return this;
  }
  
  is(column: string, value: null | boolean): IQueryBuilder {
    this.query = this.query.is(column, value);
    return this;
  }
  
  in(column: string, values: any[]): IQueryBuilder {
    this.query = this.query.in(column, values);
    return this;
  }
  
  contains(column: string, value: any): IQueryBuilder {
    this.query = this.query.contains(column, value);
    return this;
  }
  
  containedBy(column: string, value: any): IQueryBuilder {
    this.query = this.query.containedBy(column, value);
    return this;
  }
  
  not(column: string, operator: string, value: any): IQueryBuilder {
    this.query = this.query.not(column, operator, value);
    return this;
  }
  
  or(filters: string): IQueryBuilder {
    this.query = this.query.or(filters);
    return this;
  }
  
  filter(column: string, operator: string, value: any): IQueryBuilder {
    this.query = this.query.filter(column, operator, value);
    return this;
  }
  
  match(query: Record<string, any>): IQueryBuilder {
    this.query = this.query.match(query);
    return this;
  }
  
  // Modifier methods
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): IQueryBuilder {
    this.query = this.query.order(column, {
      ascending: options?.ascending ?? true,
      nullsFirst: options?.nullsFirst,
    });
    return this;
  }
  
  limit(count: number): IQueryBuilder {
    this.query = this.query.limit(count);
    return this;
  }
  
  range(from: number, to: number): IQueryBuilder {
    this.query = this.query.range(from, to);
    return this;
  }
  
  single(): IQueryBuilder {
    this.query = this.query.single();
    return this;
  }
  
  maybeSingle(): IQueryBuilder {
    this.query = this.query.maybeSingle();
    return this;
  }
  
  // Execution
  async then<T = any>(resolve: (result: QueryResult<T>) => void): Promise<QueryResult<T>> {
    const { data, error, count } = await this.query;
    
    const result: QueryResult<T> = {
      data: data as T,
      error: toDatabaseError(error),
      count: count || undefined,
    };
    
    if (resolve) {
      resolve(result);
    }
    
    return result;
  }
}
