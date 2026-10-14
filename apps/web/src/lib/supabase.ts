import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../env';
import type { Database } from '../types/database';

class EdgeQueryBuilder {
  private table: string;
  private selectCols = '*';
  private countOption?: 'exact' | 'planned' | 'estimated';
  private headOption?: boolean;
  private eqFilters: Record<string, unknown> = {};
  private inFilters: Record<string, unknown[]> = {};
  private isFilters: Record<string, unknown> = {};
  private neqFilters: Record<string, unknown> = {};
  private likeFilters: Record<string, string> = {};
  private gtFilters: Record<string, unknown> = {};
  private gteFilters: Record<string, unknown> = {};
  private ltFilters: Record<string, unknown> = {};
  private lteFilters: Record<string, unknown> = {};
  private notFilters: Record<string, { op: string; val: unknown }> = {};
  private orderClauses: Array<{ column: string; ascending?: boolean; nullsFirst?: boolean }> = [];
  private limitCount?: number;
  private offsetCount?: number;
  private isSingle = false;
  private isMaybeSingle = false;
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payloadValues?: unknown;

  constructor(table: string) {
    this.table = table;
  }

  select(cols = '*', opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    this.selectCols = cols;
    if (opts?.count) this.countOption = opts.count;
    if (opts?.head !== undefined) this.headOption = opts.head;
    return this;
  }

  eq(col: string, val: unknown) {
    this.eqFilters[col] = val;
    return this;
  }

  neq(col: string, val: unknown) {
    this.neqFilters[col] = val;
    return this;
  }

  in(col: string, list: unknown[]) {
    this.inFilters[col] = list;
    return this;
  }

  is(col: string, val: unknown) {
    this.isFilters[col] = val;
    return this;
  }

  like(col: string, pattern: string) {
    this.likeFilters[col] = pattern;
    return this;
  }

  ilike(col: string, pattern: string) {
    this.likeFilters[col] = pattern;
    return this;
  }

  gt(col: string, val: unknown) {
    this.gtFilters[col] = val;
    return this;
  }

  gte(col: string, val: unknown) {
    this.gteFilters[col] = val;
    return this;
  }

  lt(col: string, val: unknown) {
    this.ltFilters[col] = val;
    return this;
  }

  lte(col: string, val: unknown) {
    this.lteFilters[col] = val;
    return this;
  }

  not(col: string, operator: string, val: unknown) {
    if (operator === 'is') {
      this.isFilters[col] = val === null || val === 'null' ? 'not null' : null;
    } else if (operator === 'eq') {
      this.neqFilters[col] = val;
    } else {
      this.notFilters[col] = { op: operator, val };
    }
    return this;
  }

  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orderClauses.push({
      column: col,
      ascending: opts?.ascending !== false,
      nullsFirst: opts?.nullsFirst,
    });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number) {
    this.offsetCount = from;
    this.limitCount = to - from + 1;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isSingle = true;
    this.isMaybeSingle = true;
    return this;
  }

  insert(values: unknown) {
    this.action = 'insert';
    this.payloadValues = values;
    return this;
  }

  upsert(values: unknown, _opts?: { onConflict?: string }) {
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
      | ((value: { data: unknown; count?: number | null; error: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{ data: unknown; count?: number | null; error: unknown }> {
    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: this.table,
          select: this.selectCols,
          count: this.countOption,
          head: this.headOption,
          eq: this.eqFilters,
          in: this.inFilters,
          is: this.isFilters,
          neq: this.neqFilters,
          like: this.likeFilters,
          gt: this.gtFilters,
          gte: this.gteFilters,
          lt: this.ltFilters,
          lte: this.lteFilters,
          not: this.notFilters,
          order: this.orderClauses,
          limit: this.limitCount,
          offset: this.offsetCount,
          single: this.isSingle,
          maybeSingle: this.isMaybeSingle,
          action: this.action,
          values: this.payloadValues,
        }),
      });
      const json = (await res.json()) as {
        data?: unknown;
        count?: number | null;
        error?: unknown;
      };
      let data = json.data ?? null;
      if (this.isSingle && Array.isArray(data)) {
        data = data[0] ?? null;
      }
      return {
        data,
        count: json.count !== undefined ? json.count : null,
        error: json.error ?? null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { data: null, count: null, error: { message } };
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
        const json = (await res.json()) as { data?: unknown; error?: unknown };
        return { data: json.data ?? null, error: json.error ?? null };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { data: null, error: { message } };
      }
    },
    storage: {
      from: (_bucket: string) => ({
        getPublicUrl: (path: string) => {
          const cleanPath = path.startsWith('/') ? path.slice(1) : path;
          return {
            data: {
              publicUrl: `/api/audio/${cleanPath}`,
            },
          };
        },
        upload: async (path: string, _file: unknown, _options?: unknown) => {
          return {
            data: { path },
            error: null,
          };
        },
        download: async (_path: string) => {
          return {
            data: new Blob(),
            error: null,
          };
        },
        remove: async (_paths: string[]) => {
          return {
            data: null,
            error: null,
          };
        },
      }),
    },
    channel: (_name?: string) => ({
      on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
      subscribe: () => ({ unsubscribe: () => {} }),
      unsubscribe: () => {},
    }),
    removeChannel: async (_channel?: unknown) => 'ok',
    removeChannels: async () => [],
    removeAllChannels: async () => [],
    getChannels: () => [],
    functions: {
      invoke: async (name: string, options?: { body?: unknown }) => {
        try {
          const res = await fetch(`/api/rpc/${name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options?.body || {}),
          });
          const json = (await res.json()) as { data?: unknown; error?: unknown };
          return { data: json.data ?? json, error: json.error ?? null };
        } catch (err) {
          return {
            data: null,
            error: { message: err instanceof Error ? err.message : String(err) },
          };
        }
      },
    },
    auth: {
      getUser: async () => {
        try {
          const user = JSON.parse(localStorage.getItem('chunks_auth_user') || 'null');
          return { data: { user }, error: null };
        } catch {
          return { data: { user: null }, error: null };
        }
      },
      getSession: async () => {
        try {
          const user = JSON.parse(localStorage.getItem('chunks_auth_user') || 'null');
          const token = localStorage.getItem('chunks_auth_token') || '';
          return { data: { session: user ? { user, access_token: token } : null }, error: null };
        } catch {
          return { data: { session: null }, error: null };
        }
      },
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        try {
          const user = JSON.parse(localStorage.getItem('chunks_auth_user') || 'null');
          cb('INITIAL_SESSION', user ? { user } : null);
        } catch {
          cb('INITIAL_SESSION', null);
        }
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signOut: async () => {
        localStorage.removeItem('chunks_auth_user');
        localStorage.removeItem('chunks_auth_token');
      },
    },
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
