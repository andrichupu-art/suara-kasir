import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const ctx = {
  user: null,
  req: {} as TrpcContext["req"],
  res: {} as TrpcContext["res"],
} satisfies TrpcContext;

describe("ai.parseCommand", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("tests provider connectivity without requiring structured JSON output", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "OK" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const caller = appRouter.createCaller(ctx);
    await expect(caller.ai.testConnection({
      transcript: "Tes koneksi provider AI",
      catalog: [],
      provider: "groq",
      apiKey: "test-key",
      model: "openai/gpt-oss-20b",
    })).resolves.toEqual({ success: true });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).not.toHaveProperty("response_format");
  });
});
