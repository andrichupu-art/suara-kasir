import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const ctx = {
  user: null,
  req: {} as TrpcContext["req"],
  res: {} as TrpcContext["res"],
} satisfies TrpcContext;

describe("ai.parseCommand", () => {
  it("rejects an empty transcript before making a provider request", async () => {
    const caller = appRouter.createCaller(ctx);
    await expect(caller.ai.parseCommand({
      transcript: "",
      catalog: [],
      provider: "google",
      apiKey: "test-key",
      model: "gemini-2.0-flash",
    })).rejects.toThrow();
  });

  it("rejects missing API keys so the browser can fall back to local mode", async () => {
    const caller = appRouter.createCaller(ctx);
    await expect(caller.ai.parseCommand({
      transcript: "tambah kopi susu",
      catalog: [{ name: "Kopi Susu", price: 18000 }],
      provider: "google",
      apiKey: "",
      model: "gemini-2.0-flash",
    })).rejects.toThrow();
  });
});
