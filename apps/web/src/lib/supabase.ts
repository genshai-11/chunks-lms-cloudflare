import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../env';
import type { Database } from '../types/database';

class EdgeQueryBuilder {
  private table: string;
  private selectCols = '*';
  private eqFilters: Record<string, unknown> = {};
  private inFilters: Record<string, unknown[]> = {};
  private orderClauses: Array<{ column: string; ascending?: boolean }> = [];
  private limitCount?: number;
  private isSingle = false;
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payloadValues?: unknown;

  constructor(table: string) {
    this.table = table;
  }

  select(cols = '*') {
    this.selectCols = cols;
    return this;
  }

  eq(col: string, val: unknown) {
    this.eqFilters[col] = val;
    return this;
  }

  in(col: string, list: unknown[]) {
    this.inFilters[col] = list;
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderClauses.push({ column: col, ascending: opts?.ascending !== false });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isSingle = true;
    return this;
  }

  insert(values: unknown) {
    this.action = 'insert';
    this.payloadValues = values;
    return this;
  }

  upsert(values: unknown) {
    this.action = 'insert';
    this.payloadValues = values;
    return this;
  }

  update(values: unknown) {
    this.action = 'update';
    this.payloadValues = values;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{ data: unknown; error: unknown }> {
    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: this.table,
          select: this.selectCols,
          eq: this.eqFilters,
          in: this.inFilters,
          order: this.orderClauses,
          limit: this.limitCount,
          single: this.isSingle,
          action: this.action,
          values: this.payloadValues,
        }),
      });
      return (await res.json()) as { data: unknown; error: unknown };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { data: null, error: { message } };
    }
  }
}

// Edge Client compatible with Supabase Client interface
function createEdgeD1Client() {
  return {
    from: (table: string) => new EdgeQueryBuilder(table),
    rpc: async (name: string, params: Record<string, unknown> = {}) => {
      try {
        const res = await fetch(`/api/rpc/${name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        return (await res.json()) as { data: unknown; error: unknown };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { data: null, error: { message } };
      }
    },
    channel: () => ({
      on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
      subscribe: () => ({ unsubscribe: () => {} }),
    }),
  } as unknown as SupabaseClient<Database>;
}

let client: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> | null {
  if (client) return client;

  if (env.supabaseUrl && env.supabaseAnonKey) {
    client = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    return client;
  }

  // Cloudflare Edge D1 Client by default
  client = createEdgeD1Client();
  return client;
}
