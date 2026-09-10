// Use a relative import here because this file is also bundled as a Vercel
// serverless function, where the frontend TypeScript path alias is not always
// resolved by the function builder.
import { COOKIE_NAME } from "../shared/const.js";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { systemRouter } from "./_core/systemRouter.js";
import { publicProcedure, router } from "./_core/trpc.js";

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

async function callProvider(
  input: z.infer<typeof parseInputSchema>,
  options: { structuredOutput?: boolean } = {}
) {
  const structuredOutput = options.structuredOutput ?? true;
  const prompt = promptFor(input.transcript, input.catalog);

  if (input.provider === "google") {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": input.apiKey,
        "x-goog-api-client": "suara-kasir/1.0",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          ...(structuredOutput ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });
    const responseText = await response.text();
    if (!response.ok) throw new Error(`Google Gemini menolak permintaan (${response.status})${responseText ? `: ${responseText.slice(0, 300)}` : "."}`);
    let data: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    try {
      data = JSON.parse(responseText);
    } catch (error) {
      throw new Error(`Google Gemini mengembalikan respons bukan JSON: ${responseText.slice(0, 200)}`);
    }
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
      ...(structuredOutput ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: "Keluarkan JSON valid saja sesuai instruksi." },
        { role: "user", content: prompt },
      ],
    }),
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`${input.provider} menolak permintaan (${response.status})${responseText ? `: ${responseText.slice(0, 300)}` : "."}`);
  }
  let data: { choices?: Array<{ message?: { content?: string } }> };
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`${input.provider} mengembalikan respons bukan JSON: ${responseText.slice(0, 200)}`);
  }
  return data.choices?.[0]?.message?.content ?? "{}";
}

function parseJsonResponse(raw: unknown) {
  if (typeof raw !== "string") return raw;

  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(text);
  } catch {
    // Some models prepend a short explanation even when JSON mode is requested.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("AI tidak mengembalikan JSON yang valid.");
  }
}

function normalizeCommand(raw: unknown) {
  const parsed = parseJsonResponse(raw);
  const result = z.object({
    action: z.enum(["add_item", "add", "checkout", "cancel", "unknown"]).default("unknown"),
    type: z.enum(["add", "checkout", "cancel", "unknown"]).optional(),
    items: z.array(z.object({ name: z.string(), quantity: z.number().positive() })).default([]),
    paymentMethod: z.enum(["cash", "qr", "debit", "unknown"]).default("unknown"),
    reply: z.string().default(""),
    confidence: z.number().min(0).max(1).default(1),
  }).safeParse(parsed);
  if (!result.success) throw new Error("AI mengembalikan format yang tidak dikenali.");
  const action = result.data.action === "add" ? "add_item" : result.data.action;
  return { ...result.data, action: result.data.type === "add" ? "add_item" : action };
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
    testConnection: publicProcedure.input(parseInputSchema).mutation(async ({ input }) => {
      try {
        // A connection test only verifies that the provider accepts the key,
        // model, and request. It must not fail because the model's response
        // differs from the cashier command schema.
        await callProvider(input, { structuredOutput: false });
        return { success: true } as const;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Provider AI gagal dihubungi.";
        throw new Error(message);
      }
    }),
    parseCommand: publicProcedure.input(parseInputSchema).mutation(async ({ input }) => {
      try {
        try {
          return normalizeCommand(await callProvider(input));
        } catch {
          // Some valid provider/model combinations reject structured-output options.
          // Retry as plain text because the parser already validates the JSON payload.
          return normalizeCommand(await callProvider(input, { structuredOutput: false }));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Parser AI gagal.";
        throw new Error(message);
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;
