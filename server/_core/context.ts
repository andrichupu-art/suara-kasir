import type { User } from "../../drizzle/schema";

export type RequestLike = {
  protocol?: string;
  headers: Record<string, string | string[] | undefined>;
};

export type ResponseLike = {
  clearCookie: (name: string, options?: Record<string, unknown>) => void;
};

export type TrpcContext = {
  req: RequestLike;
  res: ResponseLike;
  user: User | null;
};

export async function createContext(opts: any): Promise<TrpcContext> {
  return {
    req: opts.req as RequestLike,
    res: opts.res as ResponseLike,
    user: null, // Auth dilepas — app ini tidak memerlukan login
  };
}
