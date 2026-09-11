import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Archive,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Link2,
  History,
  Mic,
  Mic2,
  Package,
  Plus,
  ReceiptText,
  RotateCcw,
  Save,
  Settings2,
  ShoppingBasket,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from "lucide-react";

type Product = { id: string; name: string; price: number; stock: number; category: string; color: string };
type CartItem = Product & { quantity: number };
type Transaction = { id: string; createdAt: string; items: CartItem[]; total: number; payment: string };
type Provider = "google" | "groq" | "openrouter" | "cerebras";

const initialProducts: Product[] = [
  { id: "kopi-susu", name: "Kopi Susu", price: 18000, stock: 100, category: "Minuman", color: "from-amber-100 to-orange-50" },
  { id: "es-teh", name: "Es Teh Manis", price: 8000, stock: 100, category: "Minuman", color: "from-cyan-100 to-sky-50" },
  { id: "nasi-goreng", name: "Nasi Goreng", price: 24000, stock: 100, category: "Makanan", color: "from-rose-100 to-orange-50" },
  { id: "mie-goreng", name: "Mie Goreng", price: 21000, stock: 100, category: "Makanan", color: "from-lime-100 to-emerald-50" },
  { id: "air-mineral", name: "Air Mineral", price: 5000, stock: 100, category: "Minuman", color: "from-indigo-100 to-blue-50" },
  { id: "pisang-goreng", name: "Pisang Goreng", price: 12000, stock: 100, category: "Camilan", color: "from-yellow-100 to-amber-50" },
];

const providerOptions: Array<{ value: Provider; label: string; model: string; note: string }> = [
  { value: "google", label: "Google Gemini", model: "gemini-3.6-flash", note: "Cocok untuk Bahasa Indonesia & JSON" },
  { value: "groq", label: "Groq", model: "openai/gpt-oss-20b", note: "Sangat cepat untuk kasir" },
  { value: "openrouter", label: "OpenRouter", model: "google/gemini-2.5-flash", note: "Banyak pilihan model" },
  { value: "cerebras", label: "Cerebras", model: "llama3.1-8b", note: "Respons cepat" },
];

const currency = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const monthNames: Record<string, number> = { januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5, juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11 };
const localDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const dateFromText = (text: string) => {
  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const numeric = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/);
  if (numeric) return `${numeric[3]}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
  const named = text.match(/\b(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+(20\d{2})\b/i);
  if (named) return `${named[3]}-${String(monthNames[named[2].toLowerCase()] + 1).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
  return localDateKey(new Date());
};
const load = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
};
const loadProducts = (): Product[] => load<Product[]>("suara-kasir-products", initialProducts).map(product => ({ ...product, stock: Number.isFinite(product.stock) ? product.stock : 100 }));

function speak(text: string) {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "id-ID";
    utterance.rate = 0.96;
    utterance.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const indonesianVoice = voices.find(voice => /^id(-|_)?ID$/i.test(voice.lang))
      ?? voices.find(voice => voice.lang.toLowerCase().startsWith("id"));
    if (indonesianVoice) utterance.voice = indonesianVoice;
    window.speechSynthesis.speak(utterance);
  }
}

function findProduct(products: Product[], phrase: string) {
  const normalized = phrase.toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim();
  const phraseWords = normalized.split(/\s+/).filter(Boolean);
  if (!phraseWords.length) return undefined;

  return products
    .map(product => {
      const productName = product.name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim();
      const productWords = productName.split(/\s+/).filter(Boolean);
      const overlap = productWords.filter(word => phraseWords.includes(word)).length;
      const exact = normalized.includes(productName);
      const coverage = overlap / Math.min(productWords.length, phraseWords.length);
      const matches = exact || coverage === 1 || overlap >= 2 || (overlap > 0 && overlap / productWords.length >= 0.5);
      return { product, score: exact ? 100 : matches ? overlap / productWords.length : 0 };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.product;
}

function numberFromText(text: string) {
  const digit = text.match(/\b(\d+)\b/);
  if (digit) return Number(digit[1]);
  const numbers: Record<string, number> = { satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10 };
  for (const [word, value] of Object.entries(numbers)) if (text.toLowerCase().includes(word)) return value;
  return 1;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"kasir" | "produk" | "riwayat" | "pengaturan">("kasir");
  const [products, setProducts] = useState<Product[]>(loadProducts);
  const [transactions, setTransactions] = useState<Transaction[]>(() => load("suara-kasir-transactions", []));
  const [reportDate, setReportDate] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState<"idle" | "listening" | "thinking">("idle");
  const [lastHeard, setLastHeard] = useState("");
  const [pending, setPending] = useState<{ type: "add" | "checkout" | "cancel"; items?: Array<{ name: string; quantity: number }>; payment?: string; reply: string } | null>(null);
  const [payment, setPayment] = useState("cash");
  const [provider, setProvider] = useState<Provider>(() => load("suara-kasir-provider", "google"));
  const [model, setModel] = useState(() => {
    const savedProvider = load<Provider>("suara-kasir-provider", "google");
    const savedModel = load<string>("suara-kasir-model", "");
    const defaultModel = providerOptions.find(item => item.value === savedProvider)?.model ?? providerOptions[0].model;
    const migrations: Record<string, string> = {
      "gemini-2.0-flash": "gemini-3.6-flash",
      "gemini-2.0-flash-001": "gemini-3.6-flash",
      "gemini-2.5-flash": "gemini-3.6-flash",
      "google/gemini-2.0-flash-001": "google/gemini-3.6-flash",
      "llama-3.1-8b": "llama3.1-8b",
      "llama-3.1-8b-instant": "openai/gpt-oss-20b",
    };
    return migrations[savedModel] ?? (savedModel || defaultModel);
  });
  const [apiKey, setApiKey] = useState(() => load("suara-kasir-key", ""));
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: "", price: "", stock: "", category: "Makanan" });
  const recognitionRef = useRef<any>(null);
  const testConnection = trpc.ai.testConnection.useMutation();
  const parseCommand = trpc.ai.parseCommand.useMutation();
  const storeSnapshot = trpc.store.snapshot.useQuery(undefined, { retry: false });
  const migrateStore = trpc.store.migrate.useMutation();
  const cloudSyncAttempted = useRef(false);
  const [cloudReady, setCloudReady] = useState(false);

  useEffect(() => {
    localStorage.setItem("suara-kasir-products", JSON.stringify(products));
  }, [products]);
  useEffect(() => {
    localStorage.setItem("suara-kasir-transactions", JSON.stringify(transactions));
  }, [transactions]);
  useEffect(() => {
    localStorage.setItem("suara-kasir-provider", JSON.stringify(provider));
    localStorage.setItem("suara-kasir-model", JSON.stringify(model));
    localStorage.setItem("suara-kasir-key", JSON.stringify(apiKey.trim()));
  }, [provider, model, apiKey]);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  useEffect(() => {
    if (cloudSyncAttempted.current || storeSnapshot.isLoading) return;
    cloudSyncAttempted.current = true;
    if (storeSnapshot.error) return;

    const cloudProducts = storeSnapshot.data?.products ?? [];
    const cloudTransactions = storeSnapshot.data?.transactions ?? [];
    if (cloudProducts.length || cloudTransactions.length) {
      setProducts(cloudProducts.map(product => ({
        id: product.id,
        name: product.name,
        price: product.price,
        stock: product.stock,
        category: product.category,
        color: product.color,
      })));
      setTransactions(cloudTransactions.map(transaction => ({
        id: transaction.id,
        createdAt: new Date(transaction.createdAt).toISOString(),
        total: transaction.total,
        payment: transaction.payment,
        items: transaction.items.map(item => ({
          id: item.productId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          stock: 0,
          category: "",
          color: "from-slate-100 to-slate-50",
        })),
      })));
      setCloudReady(true);
      return;
    }

    migrateStore.mutate({
      products,
      transactions: transactions.map(transaction => ({
        id: transaction.id,
        createdAt: transaction.createdAt,
        total: transaction.total,
        payment: transaction.payment,
        items: transaction.items.map(item => ({
          id: `${transaction.id}-${item.id}`,
          productId: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
      })),
    });
    setCloudReady(true);
  }, [migrateStore, products, storeSnapshot.data, storeSnapshot.error, storeSnapshot.isLoading, transactions]);
  useEffect(() => {
    if (!cloudReady || storeSnapshot.error || storeSnapshot.isLoading || !storeSnapshot.data) return;
    migrateStore.mutate({
      products,
      transactions: transactions.map(transaction => ({
        id: transaction.id,
        createdAt: transaction.createdAt,
        total: transaction.total,
        payment: transaction.payment,
        items: transaction.items.map(item => ({
          id: `${transaction.id}-${item.id}`,
          productId: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
      })),
    });
  }, [cloudReady, migrateStore, products, storeSnapshot.data, storeSnapshot.error, storeSnapshot.isLoading, transactions]);

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  const itemCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const selectedProvider = providerOptions.find(item => item.value === provider) ?? providerOptions[0];

  const addProduct = (product: Product, quantity = 1) => {
    const existing = cart.find(item => item.id === product.id);
    const requestedQuantity = (existing?.quantity ?? 0) + quantity;
    if (product.stock <= 0) {
      const message = `Stok ${product.name} kosong, jadi tidak bisa ditransaksikan.`;
      setLastHeard(message);
      toast.error("Stok habis", { description: message });
      speak(message);
      return false;
    }
    if (requestedQuantity > product.stock) {
      const availableQuantity = Math.max(product.stock - (existing?.quantity ?? 0), 0);
      const message = `Stok ${product.name} hanya tersedia ${availableQuantity} item, sedangkan yang diminta ${quantity}.`;
      setLastHeard(message);
      toast.error("Jumlah melebihi stok", { description: message });
      speak(message);
      return false;
    }
    setCart(current => {
      const existing = current.find(item => item.id === product.id);
      if (existing) return current.map(item => item.id === product.id ? { ...item, quantity: item.quantity + quantity } : item);
      return [...current, { ...product, quantity }];
    });
    return true;
  };

  const removeProduct = (id: string) => setCart(current => current.flatMap(item => item.id === id ? (item.quantity > 1 ? [{ ...item, quantity: item.quantity - 1 }] : []) : [item]));

  const finishTransaction = (method = payment) => {
    if (!cart.length) return;
    const stockIssue = cart.map(item => {
      const currentProduct = products.find(product => product.id === item.id);
      if (!currentProduct || currentProduct.stock < item.quantity) {
        return `${item.name}: tersedia ${currentProduct?.stock ?? 0}, diminta ${item.quantity}`;
      }
      return null;
    }).filter((issue): issue is string => Boolean(issue));
    if (stockIssue.length) {
      const message = `Transaksi tidak dapat disimpan. ${stockIssue.join("; ")}.`;
      setLastHeard(message);
      speak(message);
      toast.error("Stok tidak mencukupi", { description: stockIssue.join("; ") });
      setPending(null);
      return;
    }
    const transaction: Transaction = { id: `TRX-${Date.now()}`, createdAt: new Date().toISOString(), items: cart, total, payment: method };
    setTransactions(current => [transaction, ...current]);
    setProducts(current => current.map(product => {
      const sold = cart.find(item => item.id === product.id)?.quantity ?? 0;
      return sold ? { ...product, stock: product.stock - sold } : product;
    }));
    setCart([]);
    setPending(null);
    const message = `Transaksi tersimpan. Total ${currency(total)} dibayar ${method === "cash" ? "tunai" : method === "qr" ? "QRIS" : "debit"}.`;
    setLastHeard(message);
    speak(message);
    toast.success("Transaksi tersimpan", { description: currency(total) });
  };

  const parseLocal = (text: string) => {
    const lower = text.toLowerCase();
    if (/(rekap|ringkasan|laporan|omzet|pendapatan penjualan)/.test(lower)) return { type: "summary" as const, summaryDate: dateFromText(lower), reply: "" };
    if (/(batalkan|batal|hapus semua|cancel)/.test(lower)) return { type: "cancel" as const, reply: "Baik, dibatalkan." };
    if (/(simpan|bayar|checkout|selesai|sudah)/.test(lower) && cart.length) return { type: "checkout" as const, payment: /(qris|qr|scan)/.test(lower) ? "qr" : /(debit|kartu)/.test(lower) ? "debit" : "cash", reply: "Siap, saya siapkan konfirmasinya." };
    const product = findProduct(products, lower);
    if (product) return { type: "add" as const, items: [{ name: product.name, quantity: numberFromText(lower) }], reply: `${numberFromText(lower)} ${product.name} masuk keranjang.` };
    return { type: "unknown" as const, reply: "Saya belum menemukan barangnya. Coba sebut nama produk dan jumlahnya." };
  };

  const showSummary = (date?: string) => {
    const targetDate = date || localDateKey(new Date());
    const matching = transactions.filter(transaction => localDateKey(new Date(transaction.createdAt)) === targetDate);
    const count = matching.length;
    const itemCount = matching.reduce((sum, transaction) => sum + transaction.items.reduce((items, item) => items + item.quantity, 0), 0);
    const amount = matching.reduce((sum, transaction) => sum + transaction.total, 0);
    const label = new Date(`${targetDate}T00:00:00`).toLocaleDateString("id-ID", { dateStyle: "long" });
    const message = count
      ? `Rekap ${label}: ${count} transaksi, ${itemCount} item, total ${currency(amount)}.`
      : `Belum ada transaksi pada ${label}.`;
    setReportDate(targetDate);
    setActiveTab("riwayat");
    setLastHeard(message);
    speak(message);
    toast.success("Rekap transaksi", { description: message });
  };

  const applyCommand = (command: any, fallbackText?: string) => {
    if (command.action === "add_item" || command.type === "add") {
      const items: Array<{ name?: unknown; quantity?: unknown }> = Array.isArray(command.items) ? command.items : [];
      let addedItems = 0;
      let matchedProducts = 0;
      let rejectedItems = 0;

      items.forEach(item => {
        const product = findProduct(products, String(item.name ?? ""));
        const quantity = Number(item.quantity);
        if (!product || !Number.isFinite(quantity) || quantity <= 0) return;
        matchedProducts += 1;
        if (addProduct(product, quantity)) addedItems += quantity;
        else rejectedItems += 1;
      });

      if (!addedItems) {
        if (matchedProducts) return;
        if (fallbackText) {
          const localCommand = parseLocal(fallbackText);
          if (localCommand.type === "add") {
            applyCommand({ action: "add_item", items: localCommand.items, reply: localCommand.reply });
            return;
          }
        }
        const message = "Saya belum menemukan produk yang dimaksud.";
        setLastHeard(message);
        speak(message);
        toast.error(message);
        return;
      }

      if (!rejectedItems) {
        setLastHeard(command.reply || "Barang ditambahkan ke keranjang.");
        speak(command.reply || "Barang ditambahkan ke keranjang.");
        toast.success("Barang ditambahkan ke keranjang");
      }
    } else if (command.action === "summary" || command.type === "summary") {
      showSummary(command.summaryDate);
    } else if (command.action === "checkout" || command.type === "checkout") {
      if (!cart.length) {
        const message = "Keranjang masih kosong. Tambahkan barang terlebih dahulu.";
        setLastHeard(message);
        speak(message);
        toast.error(message);
        return;
      }

      const method = command.paymentMethod && command.paymentMethod !== "unknown"
        ? command.paymentMethod
        : command.payment && command.payment !== "unknown"
          ? command.payment
          : payment;
      const paymentLabel = method === "qr" ? "QRIS" : method === "debit" ? "debit" : "tunai";
      const confirmation = `Pesanan berisi ${itemCount} item dengan total ${currency(total)}, dibayar ${paymentLabel}. Apakah transaksi ini disimpan?`;
      setPending({ type: "checkout", payment: method, reply: confirmation });
      speak(confirmation);
    }
    else if (command.action === "cancel" || command.type === "cancel") setPending({ type: "cancel", reply: command.reply });
    else { setLastHeard(command.reply || "Coba sebutkan nama barangnya."); speak(command.reply || "Coba sebutkan nama barangnya."); }
  };

  const handleCommand = async (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    const savedApiKey = apiKey.trim();
    const localCommand = parseLocal(clean);
    setLastHeard(clean);
    setStatus("thinking");
    try {
      // Handle common cashier commands locally so speech input does not wait
      // for a network round trip when the product and intent are unambiguous.
      if (localCommand.type !== "unknown") {
        applyCommand(localCommand, clean);
      } else if (savedApiKey) {
        const result = await parseCommand.mutateAsync({ transcript: clean, catalog: products.map(({ name, price }) => ({ name, price })), provider, apiKey: savedApiKey, model });
        applyCommand(result, clean);
      } else {
        applyCommand(localCommand);
      }
    } catch (error) {
      applyCommand(localCommand);
      if (localCommand.type === "unknown") {
        toast.error("AI tidak merespons", { description: error instanceof Error ? error.message : "Periksa koneksi dan API key." });
      }
    } finally {
      setStatus("idle");
      setTranscript("");
    }
  };

  const saveSettings = async () => {
    const savedApiKey = apiKey.trim();
    const savedModel = model.trim();
    if (!savedApiKey) {
      setApiKeySaved(false);
      toast.error("Masukkan API key terlebih dahulu");
      return;
    }
    if (!savedModel) {
      setApiKeySaved(false);
      toast.error("Masukkan nama model terlebih dahulu");
      return;
    }

    // Persist the exact values that are tested and used by subsequent commands.
    // This avoids saving whitespace and prevents the UI state from diverging
    // from localStorage when the connection test fails.
    setApiKey(savedApiKey);
    setModel(savedModel);
    localStorage.setItem("suara-kasir-provider", JSON.stringify(provider));
    localStorage.setItem("suara-kasir-model", JSON.stringify(savedModel));
    localStorage.setItem("suara-kasir-key", JSON.stringify(savedApiKey));

    setTestingConnection(true);
    try {
      await testConnection.mutateAsync({
        transcript: "Tes koneksi provider AI",
        catalog: [],
        provider,
        apiKey: savedApiKey,
        model: savedModel,
      });
      setApiKeySaved(true);
      toast.success(`${selectedProvider.label} tersambung`);
    } catch (error) {
      setApiKeySaved(false);
      toast.error("Provider AI tidak tersambung", {
        description: error instanceof Error ? error.message : "Periksa provider, model, dan API key.",
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.info("Browser belum mendukung input suara", { description: "Gunakan kolom teks sebagai alternatif." });
      document.getElementById("command-input")?.focus();
      return;
    }
    if (status === "listening") { recognitionRef.current?.stop(); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = "id-ID";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => setStatus("listening");
    recognition.onresult = (event: any) => {
      const text = Array.from(event.results).map((result: any) => result[0].transcript).join("");
      setTranscript(text);
      if (event.results[event.results.length - 1].isFinal) handleCommand(text);
    };
    recognition.onerror = () => { setStatus("idle"); toast.error("Suara belum tertangkap", { description: "Coba bicara lebih dekat dengan mikrofon." }); };
    recognition.onend = () => setStatus(current => current === "listening" ? "idle" : current);
    recognitionRef.current = recognition;
    recognition.start();
  };

  const confirmPending = () => {
    if (!pending) return;
    if (pending.type === "cancel") { setCart([]); setPending(null); speak("Keranjang dikosongkan."); toast.success("Keranjang dikosongkan"); return; }
    if (pending.type === "checkout") { finishTransaction(pending.payment && pending.payment !== "unknown" ? pending.payment : payment); return; }
    const added = pending.items?.every(item => {
      const product = findProduct(products, item.name);
      return product ? addProduct(product, item.quantity) : false;
    }) ?? false;
    if (!added) return;
    setLastHeard(pending.reply);
    speak(pending.reply);
    toast.success("Barang ditambahkan");
    setPending(null);
  };

  const saveProduct = () => {
    const price = Number(newProduct.price);
    if (!newProduct.name.trim() || !price) return toast.error("Lengkapi nama dan harga produk.");
    const stock = Number(newProduct.stock);
    if (!Number.isInteger(stock) || stock < 0) return toast.error("Stok harus berupa angka 0 atau lebih.");
    setProducts(current => [...current, { id: `${newProduct.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`, name: newProduct.name.trim(), price, stock, category: newProduct.category, color: "from-violet-100 to-fuchsia-50" }]);
    setNewProduct({ name: "", price: "", stock: "", category: "Makanan" });
    toast.success("Produk ditambahkan");
  };

  const nav = [
    { id: "kasir" as const, label: "Kasir", icon: ShoppingBasket },
    { id: "produk" as const, label: "Produk", icon: Package },
    { id: "riwayat" as const, label: "Riwayat", icon: History },
    { id: "pengaturan" as const, label: "Pengaturan", icon: Settings2 },
  ];

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col lg:flex-row">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white px-5 py-7 lg:flex lg:flex-col">
          <div className="mb-12 flex items-center gap-3 px-2"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-900 text-white"><Mic2 size={20} /></div><div><div className="font-extrabold tracking-tight">SuaraKasir</div><div className="text-xs text-slate-400">Kasir tanpa ribet</div></div></div>
          <div className="space-y-2">{nav.map(item => <button key={item.id} onClick={() => { setReportDate(null); setActiveTab(item.id); }} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${activeTab === item.id ? "bg-slate-900 text-white shadow-lg shadow-slate-200" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}><item.icon size={18} />{item.label}</button>)}</div>
          <div className="mt-auto rounded-3xl bg-[#e7f3ee] p-4"><div className="mb-2 flex items-center gap-2 text-sm font-bold text-emerald-900"><Sparkles size={16} />Mode pintar</div><p className="text-xs leading-5 text-emerald-800/70">Sebutkan barang seperti bicara biasa. AI akan memahami jumlah dan perintahmu.</p></div>
        </aside>

        <main className="min-w-0 flex-1 pb-24 lg:pb-8">
          <div className="px-5 py-6 lg:px-10">
            {activeTab === "kasir" && <>
              <section className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-start justify-between"><div><div className="flex items-center gap-2 text-sm font-bold"><Mic size={17} className="text-emerald-600" />Input suara</div><p className="mt-1 text-xs text-slate-400">Tekan tombol, lalu bicara seperti biasa</p></div><div className={`rounded-full px-3 py-1 text-[11px] font-bold ${status === "listening" ? "bg-rose-100 text-rose-600" : status === "thinking" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{status === "listening" ? "Mendengarkan" : status === "thinking" ? "Memahami…" : "Siap"}</div></div>
                  <button onClick={startListening} className={`group relative mx-auto grid h-36 w-36 place-items-center rounded-full border-[12px] transition sm:h-44 sm:w-44 ${status === "listening" ? "border-rose-100 bg-rose-500 shadow-2xl shadow-rose-200" : "border-emerald-100 bg-emerald-500 shadow-2xl shadow-emerald-100 hover:scale-[1.03]"}`}><div className="absolute inset-3 rounded-full border border-white/30" />{status === "listening" ? <div className="flex items-center gap-1"><span className="h-6 w-1 rounded-full bg-white animate-pulse" /><span className="h-10 w-1 rounded-full bg-white animate-pulse" /><span className="h-7 w-1 rounded-full bg-white animate-pulse" /></div> : <Mic size={42} className="text-white" />}</button>
                  <p className="mt-4 text-center text-sm font-bold text-slate-600">{status === "listening" ? "Silakan bicara…" : "Ketuk untuk bicara"}</p>
                  <form onSubmit={event => { event.preventDefault(); handleCommand(transcript); }} className="mt-5 flex gap-2"><input id="command-input" value={transcript} onChange={event => setTranscript(event.target.value)} placeholder="Atau ketik perintah di sini…" className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50" /><button className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-900 text-white transition hover:bg-emerald-600" aria-label="Kirim perintah"><ArrowRight size={19} /></button></form>
                  {lastHeard && <div className="mt-4 flex items-start gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500"><Volume2 size={15} className="mt-0.5 shrink-0 text-emerald-600" /><span>Terakhir: "{lastHeard}"</span></div>}
                </div>

                <div className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-center justify-between"><div><div className="flex items-center gap-2 text-sm font-bold"><ReceiptText size={17} className="text-violet-600" />Pesanan berjalan</div><p className="mt-1 text-xs text-slate-400">{itemCount ? `${itemCount} item di keranjang` : "Belum ada pesanan"}</p></div>{cart.length > 0 && <button onClick={() => setCart([])} className="text-xs font-bold text-slate-400 hover:text-rose-500">Kosongkan</button>}</div>
                  <div className="min-h-[185px]">{cart.length === 0 ? <div className="grid min-h-[185px] place-items-center rounded-3xl border border-dashed border-slate-200 text-center"><div><ShoppingBasket className="mx-auto mb-3 text-slate-300" size={30} /><p className="text-sm font-bold text-slate-400">Keranjang masih kosong</p><p className="mt-1 text-xs text-slate-400">Coba bilang "tambah kopi susu"</p></div></div> : <div className="space-y-3">{cart.map(item => <div key={item.id} className="flex items-center gap-3"><div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${item.color}`}><span className="text-sm font-black text-slate-600">{item.name.charAt(0)}</span></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{item.name}</div><div className="text-xs text-slate-400">{currency(item.price)} × {item.quantity}</div></div><div className="flex items-center gap-2"><button onClick={() => removeProduct(item.id)} className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-slate-500 hover:bg-rose-100 hover:text-rose-600">−</button><span className="w-4 text-center text-sm font-bold">{item.quantity}</span><button onClick={() => addProduct(item)} className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-slate-500 hover:bg-emerald-100 hover:text-emerald-600">+</button></div><div className="w-20 text-right text-sm font-bold">{currency(item.price * item.quantity)}</div></div>)}</div>}</div>
                  <div className="mt-5 border-t border-slate-100 pt-5"><div className="flex items-end justify-between"><span className="text-sm font-semibold text-slate-500">Total</span><span className="text-2xl font-black tracking-tight">{currency(total)}</span></div><button disabled={!cart.length} onClick={() => setPending({ type: "checkout", payment, reply: "Siap disimpan sebagai transaksi?" })} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-200"><Save size={17} />Simpan transaksi</button></div>
                </div>
              </section>

              <section className="mt-6"><div className="mb-4 flex items-end justify-between"><div><h3 className="text-lg font-black tracking-tight">Tambah cepat</h3><p className="text-xs text-slate-400">Tap produk atau sebutkan lewat suara</p></div><button onClick={() => setActiveTab("produk")} className="flex items-center gap-1 text-xs font-bold text-emerald-700">Semua produk <ChevronRight size={15} /></button></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">{products.slice(0, 6).map(product => <button key={product.id} onClick={() => { if (addProduct(product)) toast.success(`${product.name} ditambahkan`); }} className={`group rounded-3xl bg-white p-3 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-md ${product.stock <= 0 ? "opacity-60" : ""}`}><div className={`mb-3 grid aspect-[1.25] place-items-center rounded-2xl bg-gradient-to-br ${product.color}`}><span className="text-2xl font-black text-slate-600/60">{product.name.charAt(0)}</span></div><div className="truncate text-xs font-bold">{product.name}</div><div className="mt-1 text-xs font-semibold text-emerald-700">{product.stock <= 0 ? "Stok habis" : `${currency(product.price)} · Stok ${product.stock}`}</div></button>)}</div></section>
            </>}

            {activeTab === "produk" && <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]"><div className="rounded-[2rem] bg-white p-6 shadow-sm"><div className="mb-5 flex items-center gap-2 text-sm font-bold"><Plus size={17} className="text-emerald-600" />Tambah produk</div><div className="space-y-4"><label className="block text-xs font-bold text-slate-500">Nama produk<input value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} placeholder="Contoh: Roti Bakar" className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-400" /></label><label className="block text-xs font-bold text-slate-500">Harga<input type="number" value={newProduct.price} onChange={e => setNewProduct({ ...newProduct, price: e.target.value })}             placeholder="15000" className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-400" /></label><label className="block text-xs font-bold text-slate-500">Stok<input type="number" min="0" step="1" value={newProduct.stock} onChange={e => setNewProduct({ ...newProduct, stock: e.target.value })} placeholder="Contoh: 20" className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-400" /></label><label className="block text-xs font-bold text-slate-500">Kategori<select value={newProduct.category} onChange={e => setNewProduct({ ...newProduct, category: e.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-400"><option>Makanan</option><option>Minuman</option><option>Camilan</option><option>Lainnya</option></select></label><button onClick={saveProduct} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 text-sm font-bold text-white hover:bg-emerald-600"><Plus size={17} />Simpan produk</button></div></div><div className="rounded-[2rem] bg-white p-6 shadow-sm"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-black">Katalog produk</h2><p className="mt-1 text-xs text-slate-400">{products.length} produk tersedia untuk suara</p></div><Package className="text-slate-300" /></div><div className="grid gap-3 sm:grid-cols-2">{products.map(product => <div key={product.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3"><div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${product.color}`}><span className="font-black text-slate-500">{product.name.charAt(0)}</span></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{product.name}</div>            <div className="text-xs text-slate-400">{product.category} · {currency(product.price)} · Stok {product.stock}</div></div>{!initialProducts.some(item => item.id === product.id) && <button onClick={() => setProducts(current => current.filter(item => item.id !== product.id))} className="text-slate-300 hover:text-rose-500"><Trash2 size={16} /></button>}</div>)}</div></div></section>}

            {activeTab === "riwayat" && reportDate && (() => {
              const reportTransactions = transactions.filter(transaction => localDateKey(new Date(transaction.createdAt)) === reportDate);
              const rows = reportTransactions.flatMap(transaction => transaction.items.map(item => ({ transaction, item })));
              const reportItems = rows.reduce((sum, row) => sum + row.item.quantity, 0);
              const reportAmount = reportTransactions.reduce((sum, transaction) => sum + transaction.total, 0);
              const reportLabel = new Date(`${reportDate}T00:00:00`).toLocaleDateString("id-ID", { dateStyle: "long" });
              return <section className="rounded-[2rem] bg-white p-4 shadow-sm sm:p-6"><div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-emerald-600"><ReceiptText size={15} />Tabel transaksi</div><h2 className="text-2xl font-black">Rekap {reportLabel}</h2><p className="mt-1 text-xs text-slate-400">Satu item ditampilkan per baris transaksi.</p></div><button onClick={() => { setReportDate(null); setActiveTab("kasir"); }} className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-900 hover:text-white"><ArrowRight className="rotate-180" size={15} />Kembali ke Transaksi</button></div><div className="overflow-x-auto rounded-2xl border border-slate-200"><table className="w-full min-w-[620px] border-collapse text-left text-xs"><thead className="bg-slate-900 text-[11px] uppercase tracking-wider text-white"><tr><th className="px-3 py-3 font-bold">No</th><th className="px-3 py-3 font-bold">Tanggal</th><th className="px-3 py-3 font-bold">Item</th><th className="px-3 py-3 text-right font-bold">Qty</th><th className="px-3 py-3 text-right font-bold">Harga</th><th className="px-3 py-3 text-right font-bold">Jumlah</th></tr></thead><tbody>{rows.map(({ transaction, item }, index) => <tr key={`${transaction.id}-${item.id}`} className="border-t border-slate-100"><td className="px-3 py-3 text-slate-400">{index + 1}</td><td className="whitespace-nowrap px-3 py-3 text-slate-500">{new Date(transaction.createdAt).toLocaleDateString("id-ID")}</td><td className="px-3 py-3 font-bold">{item.name}</td><td className="px-3 py-3 text-right">{item.quantity}</td><td className="whitespace-nowrap px-3 py-3 text-right text-slate-500">{currency(item.price)}</td><td className="whitespace-nowrap px-3 py-3 text-right font-bold">{currency(item.price * item.quantity)}</td></tr>)}</tbody></table>{!rows.length && <div className="p-10 text-center text-sm text-slate-400">Belum ada transaksi pada tanggal ini.</div>}</div><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs text-slate-400">Total transaksi</div><div className="mt-1 text-lg font-black">{reportTransactions.length}</div></div><div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs text-slate-400">Total item</div><div className="mt-1 text-lg font-black">{reportItems}</div></div><div className="rounded-2xl bg-emerald-50 p-4"><div className="text-xs text-emerald-700">Total omzet</div><div className="mt-1 text-lg font-black text-emerald-900">{currency(reportAmount)}</div></div></div></section>;
            })()}
            {activeTab === "riwayat" && !reportDate && <section className="rounded-[2rem] bg-white p-6 shadow-sm"><div className="mb-6 flex items-center justify-between"><div><h2 className="text-lg font-black">Riwayat transaksi</h2><p className="mt-1 text-xs text-slate-400">Semua transaksi tersimpan di perangkat ini</p></div><History className="text-slate-300" /></div>{transactions.length === 0 ? <div className="grid min-h-[300px] place-items-center rounded-3xl border border-dashed border-slate-200 text-center"><div><Archive className="mx-auto mb-3 text-slate-300" size={32} /><p className="text-sm font-bold text-slate-400">Belum ada transaksi</p><p className="mt-1 text-xs text-slate-400">Transaksi yang disimpan akan muncul di sini</p></div></div> : <div className="space-y-3">{transactions.map(transaction => <div key={transaction.id} className="rounded-2xl border border-slate-100 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-black">{transaction.id}</div><div className="mt-1 text-xs text-slate-400">{new Date(transaction.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</div></div><div className="text-right"><div className="text-base font-black">{currency(transaction.total)}</div><div className="text-xs font-bold uppercase text-emerald-600">{transaction.payment === "cash" ? "Tunai" : transaction.payment === "qr" ? "QRIS" : "Debit"}</div></div></div><div className="mt-3 flex flex-wrap gap-2">{transaction.items.map(item => <span key={item.id} className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">{item.quantity}× {item.name}</span>)}</div></div>)}</div>}</section>}

            {activeTab === "pengaturan" && <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]"><div className="rounded-[2rem] bg-white p-6 shadow-sm"><div className="mb-6 flex items-start justify-between"><div><h2 className="text-lg font-black">Otak SuaraKasir</h2><p className="mt-1 max-w-lg text-xs leading-5 text-slate-400">Gunakan AI untuk memahami gaya bahasa bebas. API key hanya disimpan di browser perangkat ini.</p></div><Sparkles className="text-emerald-500" /></div><div className="space-y-5"><label className="block text-xs font-bold text-slate-500">Provider AI<select value={provider} onChange={e => { const next = e.target.value as Provider; setProvider(next); setModel(providerOptions.find(item => item.value === next)?.model ?? ""); setApiKeySaved(false); }} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-400">{providerOptions.map(item => <option key={item.value} value={item.value}>{item.label} — {item.note}</option>)}</select></label><label className="block text-xs font-bold text-slate-500">Nama model<input value={model} onChange={e => { setModel(e.target.value); setApiKeySaved(false); }} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-400" /></label><label className="block text-xs font-bold text-slate-500">API key<input type={showApiKey ? "text" : "password"} value={apiKey} onChange={e => { setApiKey(e.target.value); setApiKeySaved(false); }} placeholder="Tempel API key provider di sini" className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-400" /><div className="mt-2 flex items-center justify-between"><button type="button" onClick={() => setShowApiKey(!showApiKey)} className="text-xs font-bold text-slate-400 hover:text-slate-700">{showApiKey ? "Sembunyikan key" : "Tampilkan key"}</button>{apiKeySaved && <span className="flex items-center gap-1 text-xs font-bold text-emerald-600"><Link2 size={14} />Tersambung</span>}</div></label><div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-xs leading-5 text-emerald-900"><CircleHelp size={16} className="mt-0.5 shrink-0" /><span>Tanpa API key, aplikasi tetap bisa dipakai dengan mode lokal untuk produk yang ada di katalog. Dengan AI, kamu bisa bicara lebih bebas dan memakai variasi kalimat.</span></div><button onClick={saveSettings} disabled={testingConnection} className="flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"><Check size={17} />{testingConnection ? "Menguji koneksi..." : "Simpan pengaturan"}</button></div></div><div className="space-y-6"><div className="rounded-[2rem] bg-slate-900 p-6 text-white"><div className="mb-5 flex items-center gap-2 text-sm font-bold"><Mic size={17} className="text-emerald-300" />Contoh perintah</div><div className="space-y-3">{["Tambah dua kopi susu", "Masukin nasi goreng satu", "Simpan, bayar pakai QRIS", "Batalkan pesanan"].map(text => <button key={text} onClick={() => { setActiveTab("kasir"); setTranscript(text); }} className="flex w-full items-center justify-between rounded-2xl bg-white/10 px-4 py-3 text-left text-xs font-semibold text-slate-200 hover:bg-white/15"><span>"{text}"</span><ArrowRight size={15} className="text-emerald-300" /></button>)}</div></div><div className="rounded-[2rem] bg-[#e7f3ee] p-6"><div className="flex items-center gap-2 text-sm font-black text-emerald-950"><RotateCcw size={17} />Data lokal</div><p className="mt-2 text-xs leading-5 text-emerald-900/70">Produk dan riwayat saat ini disimpan di perangkat agar MVP bisa langsung dipakai offline. Sinkronisasi multi-perangkat dapat ditambahkan berikutnya.</p></div></div></section>}
          </div>
        </main>

        <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/95 px-3 py-2 backdrop-blur lg:hidden"><div className="mx-auto flex max-w-lg items-center justify-around">{nav.map(item => <button key={item.id} onClick={() => { setReportDate(null); setActiveTab(item.id); }} className={`flex min-w-[70px] flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[10px] font-bold ${activeTab === item.id ? "text-slate-900" : "text-slate-400"}`}><item.icon size={19} /><span>{item.label}</span></button>)}</div></nav>
      </div>

      {pending && <div className="fixed inset-0 z-30 grid place-items-end bg-slate-950/30 p-4 backdrop-blur-sm sm:place-items-center"><div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between"><div><div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-emerald-600"><Sparkles size={14} />Konfirmasi suara</div><h3 className="text-2xl font-black tracking-tight">{pending.type === "add" ? "Tambahkan ke keranjang?" : pending.type === "checkout" ? "Simpan transaksi?" : "Kosongkan keranjang?"}</h3></div><button onClick={() => setPending(null)} className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-900 hover:text-white"><X size={17} /></button></div>{pending.type === "add" && <div className="mb-5 space-y-2 rounded-2xl bg-slate-50 p-4">{pending.items?.map(item => <div key={item.name} className="flex justify-between text-sm font-bold"><span>{item.quantity}× {item.name}</span><span className="text-slate-400">{(() => { const p = findProduct(products, item.name); return p ? currency(p.price * item.quantity) : "—"; })()}</span></div>)}</div>}{pending.type === "checkout" && <div className="mb-5 rounded-2xl bg-slate-50 p-4"><div className="flex justify-between text-sm font-bold"><span>{itemCount} item</span><span>{currency(total)}</span></div><div className="mt-2 text-xs text-slate-400">Pembayaran: {pending.payment === "qr" ? "QRIS" : pending.payment === "debit" ? "Debit" : "Tunai"}</div></div>}<p className="mb-6 text-sm leading-6 text-slate-500">{pending.reply}</p><div className="grid grid-cols-2 gap-3"><button onClick={() => setPending(null)} className="rounded-2xl border border-slate-200 py-3.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Belum</button><button onClick={confirmPending} className="rounded-2xl bg-slate-900 py-3.5 text-sm font-bold text-white hover:bg-emerald-600">Ya, lanjutkan</button></div></div></div>}
    </div>
  );
}
