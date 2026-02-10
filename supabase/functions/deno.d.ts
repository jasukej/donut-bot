/** Ambient types for Deno and npm imports; used as fallback when Deno extension is inactive */

declare namespace Deno {
  namespace env {
    function get(key: string): string | undefined;
  }
  function serve(
    handler: (req: Request) => Response | Promise<Response>,
    options?: { port?: number }
  ): void;
}

declare module "npm:@supabase/supabase-js@2" {
  type QueryBuilder = {
    eq(col: string, val: unknown): QueryBuilder;
    not(col: string, op: string, val: unknown): QueryBuilder;
    single(): Promise<{ data: unknown; error: unknown }>;
    then<T>(onfulfilled?: (value: { data: unknown; error: unknown }) => T | PromiseLike<T>): Promise<T>;
  };
  export interface SupabaseClient {
    from(table: string): {
      insert(data: object): { select(col: string): { single(): Promise<{ data: unknown; error: unknown }> } };
      upsert(data: object, opts?: object): Promise<{ data: unknown; error: unknown }>;
      update(data: object): { eq(col: string, val: unknown): Promise<{ error: unknown }> };
      select(cols: string): {
        eq(col: string, val: unknown): QueryBuilder;
        order(col: string, opts?: object): { limit(n: number): { single(): Promise<{ data: unknown; error: unknown }> } };
      };
    };
    rpc(fn: string, params?: object): Promise<{ data: unknown; error: unknown }>;
  }
  export function createClient(
    supabaseUrl: string,
    supabaseKey: string
  ): SupabaseClient;
}
