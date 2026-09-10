import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../server/routers.js";
import { createContext } from "../server/_core/context.js";

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext,
});

// Vercel can expose the rewritten function with either the original
// `/api/trpc` path or the path relative to the function. Support both so the
// browser always reaches tRPC after deployment.
app.use("/api/trpc", trpcMiddleware);
app.use("/trpc", trpcMiddleware);

// Keep server failures JSON-shaped. Without this, the platform's plain-text
// error page makes the client fail with `Unexpected token 'A'` while parsing.
app.use((error: unknown, _req: unknown, res: any, _next: unknown) => {
  const message = error instanceof Error ? error.message : "Kesalahan server.";
  if (!res.headersSent) res.status(500).json({ error: { message } });
});

export default app;
