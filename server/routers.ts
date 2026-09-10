import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

const catalogItemSchema = z.object({
  name: z.string(),
  price: z.number(),
});

const parseInputSchema = z.object({
  transcript: z.string().min(1),
  catalog: z.array(catalogItemSchema).max(200),
  provider: z.enum(["google", "groq", "openrouter", "cerebras"]),
  apiKey: z.string().min(1),
  model: z.string().min(1),
});

const commandSchema = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["add_item", "checkout", "cancel", "unknown"] },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          quantity: { type: "number" },
        },
        required: ["name", "quantity"],
        additionalProperties: false,
      },
    },
    paymentMethod: { type: "string", enum: ["cash", "qr", "debit", "unknown"] },
    reply: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["action", "items", "paymentMethod", "reply", "confidence"],
  additionalProperties: false,
};

function promptFor(transcript: string, catalog: Array<{ name: string; price: number }>) {
  return `Kamu adalah mesin kasir Indonesia. Pahami bahasa percakapan, singkatan, salah ucap ringan, angka dalam kata (satu, dua, tiga), dan perintah seperti "tambah dua kopi", "masukin es teh satu", "sudah, bayar pakai QR", "hapus yang terakhir", atau "batalkan". Cocokkan nama barang hanya dari katalog. Jangan mengarang barang atau harga.\n\nKatalog: ${JSON.stringify(catalog)}\n\nUcapan kasir: ${transcript}\n\nKembalikan JSON sesuai schema. Untuk add_item, items berisi nama katalog dan quantity positif. Untuk checkout, items boleh kosong dan paymentMethod isi metode jika disebut. Untuk cancel, items boleh kosong. reply harus singkat dalam Bahasa Indonesia, seolah berbicara ke kasir.`;
}

async function callProvider(input: z.infer<typeof parseInputSchema>) {
  const prompt = promptFor(input.transcript, input.catalog);

  if (input.provider === "google") {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent?key=${encodeURIComponent(input.apiKey)}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
      }),
    });
    if (!response.ok) throw new Error(`Google Gemini menolak permintaan (${response.status}).`);
    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  }

  const endpoints = {
    groq: "https://api.groq.com/openai/v1/chat/completions",
    openrouter: "https://openrouter.ai/api/v1/chat/completions",
    cerebras: "https://api.cerebras.ai/v1/chat/completions",
  } as const;
  const response = await fetch(endpoints[input.provider], {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
      ...(input.provider === "openrouter" ? { "HTTP-Referer": "https://suara-kasir.app", "X-Title": "SuaraKasir" } : {}),
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Keluarkan JSON valid saja sesuai instruksi." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`${input.provider} menolak permintaan (${response.status})${details ? `: ${details.slice(0, 300)}` : "."}`);
  }
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "{}";
}

function normalizeCommand(raw: unknown) {
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const result = z.object({
    action: z.enum(["add_item", "checkout", "cancel", "unknown"]),
    items: z.array(z.object({ name: z.string(), quantity: z.number().positive() })),
    paymentMethod: z.enum(["cash", "qr", "debit", "unknown"]),
    reply: z.string(),
    confidence: z.number().min(0).max(1),
  }).safeParse(parsed);
  if (!result.success) throw new Error("AI mengembalikan format yang tidak dikenali.");
  return result.data;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  ai: router({
    parseCommand: publicProcedure.input(parseInputSchema).mutation(async ({ input }) => {
      try {
        const raw = await callProvider(input);
        return normalizeCommand(raw);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Parser AI gagal.";
        throw new Error(message);
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;
