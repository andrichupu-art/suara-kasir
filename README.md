# 🎙️ SuaraKasir

**Kasir berbasis suara untuk warung & UMKM Indonesia.**  
Tinggal bicara — AI langsung pahami pesanan.

---

## Fitur

- 🎤 **Input suara** — ucapkan pesanan seperti bicara biasa ("tambah dua kopi susu")
- 🤖 **AI parser** — dukung Google Gemini, Groq, OpenRouter, Cerebras
- 📦 **Manajemen produk** — tambah/hapus katalog produk
- 🧾 **Riwayat transaksi** — tersimpan di Supabase PostgreSQL
- 💳 **Multi metode bayar** — tunai, QRIS, debit
- 🔇 **Mode offline** — bisa jalan tanpa API key AI
- 🔄 **Migrasi otomatis** — data localStorage dipindahkan ke database saat pertama kali tersambung

---

## Stack Teknologi

- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui
- **Backend**: Express.js + tRPC (Vercel Serverless)
- **Database**: PostgreSQL via Supabase + Drizzle ORM
- **Package manager**: pnpm
- **Deploy**: Vercel (gratis)

---

## Deploy ke Vercel + Supabase (Gratis)

### 1. Buat database di Supabase

1. Buka [supabase.com](https://supabase.com) → **New project**
2. Isi nama project, password database, pilih region **Southeast Asia (Singapore)**
3. Tunggu project siap (~2 menit)
4. Buka **Settings** → **Database** → **Connection string** → pilih **URI**
5. Salin connection string (format: `postgresql://postgres:[password]@...`)

### 2. Jalankan migrasi database

```bash
# Di folder project
cp .env.example .env
# Edit .env, isi DATABASE_URL dari Supabase

pnpm install
pnpm db:push
```

Saat aplikasi pertama kali tersambung ke database kosong, produk dan riwayat transaksi
yang sudah tersimpan di perangkat akan dikirim otomatis ke Supabase. Setelah itu,
database menjadi sumber data utama dan localStorage tetap dipakai sebagai cache perangkat.

### 3. Deploy ke Vercel

1. Buka [vercel.com](https://vercel.com) → login pakai GitHub
2. **Add New Project** → pilih repo `suara-kasir-clean`
3. Di bagian **Environment Variables**, tambahkan:
   - `DATABASE_URL` → connection string dari Supabase
   - `JWT_SECRET` → string acak panjang (min 32 karakter)
   - `NODE_ENV` → `production`
4. Klik **Deploy**

Vercel akan otomatis deploy setiap push ke branch `main`.

---

## Cara Jalankan Lokal

```bash
pnpm install
cp .env.example .env
# Edit .env

pnpm db:push   # setup database
pnpm dev       # jalankan dev server
```

Buka `http://localhost:3000`.

---

## Konfigurasi AI (Opsional)

Buka tab **Pengaturan** di app, pilih provider dan masukkan API key:

| Provider | Dapat API key di |
|----------|-----------------|
| Google Gemini | [aistudio.google.com](https://aistudio.google.com) |
| Groq | [console.groq.com](https://console.groq.com) |
| OpenRouter | [openrouter.ai](https://openrouter.ai) |
| Cerebras | [cloud.cerebras.ai](https://cloud.cerebras.ai) |

---

## Lisensi

MIT
