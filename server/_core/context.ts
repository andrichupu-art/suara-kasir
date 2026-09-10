import type { Request, Response } from "express";
import type { User } from "../../drizzle/schema";

export type TrpcContext = {
  req: Request;
  res: Response;
  user: User | null;
};

export async function createContext(
  opts: { req: Request; res: Response }
): Promise<TrpcContext> {
  return {
    req: opts.req,
    res: opts.res,
    user: null, // Auth dilepas — app ini tidak memerlukan login
  };
}
