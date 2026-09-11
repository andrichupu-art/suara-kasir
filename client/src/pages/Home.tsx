import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Archive,
  ArrowRight,
  Check,
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

type Product = { id: string; name: string; price: number; costPrice: number; stock: number; category: string; color: string };
type CartItem = Product & { quantity: number };
type Transaction = { id: string; createdAt: string; items: CartItem[]; total: number; payment: string };
type Provider = "google" | "groq" | "openrouter" | "cerebras";

const initialProducts: Product[] = [
  { id: "kopi-susu", name: "Kopi Susu", price: 18000, costPrice: 10000, stock: 100, category: "Minuman", color: "from-amber-100 to-orange-50" },
  { id: "es-teh", name: "Es Teh Manis", price: 8000, costPrice: 4000, stock: 100, category: "Minuman", color: "from-cyan-100 to-sky-50" },
  { id: "nasi-goreng", name: "Nasi Goreng", price: 24000, costPrice: 14000, stock: 100, category: "Makanan", color: "from-rose-100 to-orange-50" },
  { id: "mie-goreng", name: "Mie Goreng", price: 21000, costPrice: 12000, stock: 100, category: "Makanan", color: "from-lime-100 to-emerald-50" },
  { id: "air-mineral", name: "Air Mineral", price: 5000, costPrice: 2500, stock: 100, category: "Minuman", color: "from-indigo-100 to-blue-50" },
  { id: "pisang-goreng", name: "Pisang Goreng", price: 12000, costPrice: 7000, stock: 100, category: "Camilan", color: "from-yellow-100 to-amber-50" },
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
  const dayOnly = text.match(/\btanggal\s+(\d{1,2})\b/i);
  if (dayOnly) {
    const now = new Date();
    const day = Number(dayOnly[1]);
    if (day >= 1 && day <= 31) return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
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
const loadProducts = (): Product[] => load<Product[]>("suara-kasir-products", initialProducts).map(product => ({ ...product, costPrice: Number.isFinite(product.costPrice) ? product.costPrice : 0, stock: Number.isFinite(product.stock) ? product.stock : 100 }));

function speak(text: string) {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    window.dispatchEvent(new CustomEvent("suara-kasir:speaking", { detail: true }));
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "id-ID";
    utterance.rate = 0.96;
    utterance.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const indonesianVoice = voices.find(voice => /^id(-|_)?ID$/i.test(voice.lang))
      ?? voices.find(voice => voice.lang.toLowerCase().startsWith("id"));
    if (indonesianVoice) utterance.voice = indonesianVoice;
    utterance.onend = () => window.dispatchEvent(new CustomEvent("suara-kasir:speaking", { detail: false }));
    utterance.onerror = () => window.dispatchEvent(new CustomEvent("suara-kasir:speaking", { detail: false }));
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
const normalizedProductName = (name: string) => name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export default function Home() {
  const [activeTab, setActiveTab] = useState<"kasir" | "produk" | "riwayat" | "pengaturan">("kasir");
  const [products, setProducts] = useState<Product[]>(loadProducts);
  const [transactions, setTransactions] = useState<Transaction[]>(() => load("suara-kasir-transactions", []));
  const [reportDate, setReportDate] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState<"idle" | "listening" | "thinking">("idle");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastHeard, setLastHeard] = useState("");
  const [cartNotice, setCartNotice] = useState("");
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
  const [newProduct, setNewProduct] = useState({ name: "", price: "", costPrice: "", stock: "", category: "Makanan" });
  const recognitionRef = useRef<any>(null);
  const cartNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const testConnection = trpc.ai.testConnection.useMutation();
  const parseCommand = trpc.ai.parseCommand.useMutation();
  const storeSnapshot = trpc.store.snapshot.useQuery(undefined, { retry: false });
  const migrateStore = trpc.store.migrate.useMutation();
  const cloudSyncAttempted = useRef(false);
  const [cloudReady, setCloudReady] = useState(false);

  useEffect(() => {
    const handleSpeaking = (event: Event) => setIsSpeaking((event as CustomEvent<boolean>).detail);
    window.addEventListener("suara-kasir:speaking", handleSpeaking);
    return () => window.removeEventListener("suara-kasir:speaking", handleSpeaking);
  }, []);

  useEffect(() => () => {
    if (cartNoticeTimerRef.current) clearTimeout(cartNoticeTimerRef.current);
  }, []);

  const showCartNotice = (message: string) => {
    if (cartNoticeTimerRef.current) clearTimeout(cartNoticeTimerRef.current);
    setCartNotice(message);
    cartNoticeTimerRef.current = setTimeout(() => setCartNotice(""), 2600);
  };

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
        costPrice: product.costPrice ?? 0,
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
          costPrice: 0,
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
      if (existing) return [{ ...existing, quantity: existing.quantity + quantity }, ...current.filter(item => item.id !== product.id)];
      return [{ ...product, quantity }, ...current];
    });
    return true;
  };

  const removeProduct = (id: string) => setCart(current => current.flatMap(item => item.id === id ? (item.quantity > 1 ? [{ ...item, quantity: item.quantity - 1 }] : []) : [item]));
  const removeCartItem = (id: string) => setCart(current => current.filter(item => item.id !== id));

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
    if (/(stok|persediaan).*(menipis|sedikit|kurang|hampir habis)|stok menipis/.test(lower)) return { type: "stock_low" as const, reply: "" };
    if (/(stok|persediaan).*(aman|banyak|cukup|tersedia)|stok masih banyak/.test(lower)) return { type: "stock_safe" as const, reply: "" };
    if (/(rekap|ringkasan|laporan|omzet|omset|pendapatan(?:\s+penjualan)?)/.test(lower)) return { type: "summary" as const, summaryDate: dateFromText(lower), reply: "" };
    if (/(batalkan|batal|hapus semua|cancel)/.test(lower)) return { type: "cancel" as const, reply: "Baik, dibatalkan." };
    if (/(hapus|buang|hilangkan)/.test(lower)) {
      const target = lower.match(/(?:hapus|buang|hilangkan)(?:\s+(?:item|barang))?\s+(.+)/)?.[1]?.trim();
      const product = target && findProduct(products, target);
      if (product && cart.some(item => item.id === product.id)) return { type: "remove" as const, items: [{ name: product.name, quantity: 1 }], reply: `${product.name} dihapus dari transaksi.` };
      if (/(terakhir|yang baru saja)/.test(lower) && cart[0]) return { type: "remove" as const, items: [{ name: cart[0].name, quantity: 1 }], reply: `${cart[0].name} dihapus dari transaksi.` };
      return { type: "unknown" as const, reply: "Sebutkan nama barang yang ingin dihapus." };
    }
    if (/(simpan|bayar|checkout|selesai|sudah)/.test(lower) && cart.length) return { type: "checkout" as const, payment: /(qris|qr|scan)/.test(lower) ? "qr" : /(debit|kartu)/.test(lower) ? "debit" : "cash", reply: "Siap, saya siapkan konfirmasinya." };
    const matches = products
      .map(product => ({ product, position: lower.indexOf(normalizedProductName(product.name)) }))
      .filter(match => match.position >= 0)
      .sort((a, b) => a.position - b.position);
    if (matches.length > 1) {
      return {
        type: "add" as const,
        items: matches.map((match, index) => ({
          name: match.product.name,
          quantity: numberFromText(lower.slice(index ? matches[index - 1].position : 0, match.position)),
        })),
        reply: `${matches.length} barang masuk keranjang.`,
      };
    }
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

  const showStockReport = (type: "low" | "safe") => {
    const matching = products.filter(product => type === "low" ? product.stock < 5 : product.stock >= 5);
    const message = type === "low"
      ? matching.length
        ? `Stok menipis: ${matching.map(product => `${product.name} tersisa ${product.stock}`).join(", ")}.`
        : "Semua item atau barang sampai saat ini aman."
      : "Semua item atau barang sampai saat ini aman.";
    setLastHeard(message);
    speak(message);
    toast.info(type === "low" ? "Stok menipis" : "Stok aman", { description: message });
  };

  const applyCommand = (command: any, fallbackText?: string) => {
    if (command.action === "stock_low" || command.type === "stock_low") {
      showStockReport("low");
    } else if (command.action === "stock_safe" || command.type === "stock_safe") {
      showStockReport("safe");
    } else if (command.action === "remove_item" || command.type === "remove") {
      const items: Array<{ name?: unknown }> = Array.isArray(command.items) ? command.items : [];
      const removed = items.some(item => {
        const product = findProduct(products, String(item.name ?? ""));
        if (!product || !cart.some(cartItem => cartItem.id === product.id)) return false;
        removeCartItem(product.id);
        return true;
      });
      if (removed) {
        const reply = command.reply || "Barang dihapus dari transaksi.";
        setLastHeard(reply);
        speak(reply);
        showCartNotice("Barang dihapus dari transaksi");
      } else {
        const message = "Barang tersebut tidak ada di transaksi.";
        setLastHeard(message);
        speak(message);
        toast.error(message);
      }
    } else if (command.action === "add_item" || command.type === "add") {
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
        showCartNotice("Barang ditambahkan ke keranjang");
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
    showCartNotice("Barang ditambahkan");
    setPending(null);
  };

  const saveProduct = () => {
    const price = Number(newProduct.price);
    if (!newProduct.name.trim() || !price) return toast.error("Lengkapi nama dan harga produk.");
    const stock = Number(newProduct.stock);
    if (!Number.isInteger(stock) || stock < 0) return toast.error("Stok harus berupa angka 0 atau lebih.");
    const costPrice = Number(newProduct.costPrice);
    if (!Number.isInteger(costPrice) || costPrice < 0) return toast.error("Harga modal harus berupa angka 0 atau lebih.");
    setProducts(current => [...current, { id: `${newProduct.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`, name: newProduct.name.trim(), price, costPrice, stock, category: newProduct.category, color: "from-violet-100 to-fuchsia-50" }]);
    setNewProduct({ name: "", price: "", costPrice: "", stock: "", category: "Makanan" });
    toast.success("Produk ditambahkan");
  };

  const updateProduct = (id: string, field: "price" | "costPrice" | "stock", value: string) => {
    const numericValue = Number(value);
    if (!Number.isInteger(numericValue) || numericValue < 0) return;
    setProducts(current => current.map(product => product.id === id ? { ...product, [field]: numericValue } : product));
  };

  const nav = [
    { id: "kasir" as const, label: "Kasir", icon: ShoppingBasket },
    { id: "produk" as const, label: "Produk", icon: Package },
    { id: "riwayat" as const, label: "Riwayat", icon: History },
    { id: "pengaturan" as const, label: "Pengaturan", icon: Settings2 },
  ];

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col lg:flex-row">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white px-5 py-7 lg:flex lg:flex-col">
          <div className="mb-12 flex items-center gap-3 px-2"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-900 text-white"><Mic2 size={20} /></div><div><div className="font-extrabold tracking-tight">SuaraKasir</div><div className="text-xs text-slate-400">Kasir tanpa ribet</div></div></div>
          <div className="space-y-2">{nav.map(item => <button key={item.id} onClick={() => { setReportDate(null); setActiveTab(item.id); }} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${activeTab === item.id ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200" : "text-slate-500 hover:bg-slate-50 hover:text-emerald-700"}`}><item.icon size={18} />{item.label}</button>)}</div>
          <div className="mt-auto rounded-3xl bg-[#e7f3ee] p-4"><div className="mb-2 flex items-center gap-2 text-sm font-bold text-emerald-900"><Sparkles size={16} />Mode pintar</div><p className="text-xs leading-5 text-emerald-800/70">Sebutkan barang seperti bicara biasa. AI akan memahami jumlah dan perintahmu.</p></div>
        </aside>

        <main className="min-w-0 flex-1 pb-56 lg:pb-8">
          <div className="px-5 py-6 lg:px-10">
            {activeTab === "kasir" && <>
              <form onSubmit={event => { event.preventDefault(); handleCommand(transcript); }} className="relative mb-2"><input id="command-input" value={transcript} onChange={event => setTranscript(event.target.value)} placeholder="Ketik perintah di sini…" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 pr-16 text-sm shadow-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50" /><button className="absolute right-2 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-2xl bg-emerald-600 text-white transition hover:bg-emerald-700" aria-label="Kirim perintah"><ArrowRight size={19} /></button></form>
              {cartNotice && <div className="mb-4 flex animate-in items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 fade-in slide-in-from-top-1 duration-300" role="status" aria-live="polite"><Check size={14} />{cartNotice}</div>}
              <div className="flex h-28 translate-y-3 items-center justify-center sm:h-36" aria-live="polite">
                <div className="flex h-24 w-full max-w-md items-center justify-center gap-1.5 px-4" aria-label={isSpeaking ? "Aplikasi sedang berbicara" : "Waveform siap"}>
                  {[18, 30, 44, 58, 72, 88, 64, 46, 76, 96, 68, 48, 80, 58, 38, 70, 92, 62, 42, 28, 18].map((height, index) => <span key={index} className={`w-1.5 rounded-full bg-gradient-to-t from-emerald-500 via-emerald-400 to-teal-200 shadow-[0_0_12px_rgba(52,211,153,0.35)] ${isSpeaking ? "animate-[wave_1.1s_ease-in-out_infinite]" : ""}`} style={{ height: `${height}px`, animationDelay: `${index * 55}ms` }} />)}
                </div>
              </div>

              <section className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="p-5 sm:p-6">
                  {lastHeard && <div className="flex items-start gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500"><Volume2 size={15} className="mt-0.5 shrink-0 text-emerald-600" /><span>Terakhir: "{lastHeard}"</span></div>}
                </div>

                {cart.length > 0 && <div className="fixed bottom-[252px] left-5 right-5 z-10 max-h-[300px] overflow-y-auto rounded-[2rem] bg-transparent p-0 shadow-none lg:static lg:max-h-none lg:overflow-visible lg:rounded-[2rem] lg:bg-white lg:p-5 lg:shadow-sm">
                  <div className="flex w-full origin-bottom flex-col justify-end gap-1 text-xs [&>div]:scale-y-[0.9]">{cart.map(item => <div key={item.id} className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-white p-2 shadow-sm"><div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${item.color}`}><span className="text-sm font-black text-slate-600">{item.name.charAt(0)}</span></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{item.name}</div><div className="text-xs text-slate-400">{currency(item.price)} × {item.quantity}</div></div><div className="flex items-center gap-1"><button onClick={() => removeProduct(item.id)} aria-label={`Kurangi ${item.name}`} className="grid h-7 w-7 place-items-center rounded-lg bg-slate-50 text-slate-500 hover:bg-rose-100 hover:text-rose-600">−</button><span className="w-4 text-center text-sm font-bold">{item.quantity}</span><button onClick={() => addProduct(item)} aria-label={`Tambah ${item.name}`} className="grid h-7 w-7 place-items-center rounded-lg bg-slate-50 text-slate-500 hover:bg-emerald-100 hover:text-emerald-600">+</button><button onClick={() => removeCartItem(item.id)} aria-label={`Hapus ${item.name} dari transaksi`} className="ml-1 grid h-7 w-7 place-items-center rounded-lg text-slate-300 transition hover:bg-rose-100 hover:text-rose-600"><Trash2 size={14} /></button></div><div className="w-20 text-right text-sm font-bold">{currency(item.price * item.quantity)}</div></div>)}</div>
                </div>}
              </section>
              <div className="fixed bottom-[102px] left-0 right-0 z-10 border-t border-slate-200 bg-white/95 px-5 py-4 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:static lg:mt-6 lg:border lg:border-slate-100 lg:rounded-[2rem] lg:px-6">
                <div className="mx-auto max-w-6xl"><div className="flex items-end justify-between"><span className="text-sm font-semibold text-slate-500">Total</span><span className="text-2xl font-black tracking-tight">{currency(total)}</span></div><button disabled={!cart.length} onClick={() => setPending({ type: "checkout", payment, reply: "Siap disimpan sebagai transaksi?" })} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200"><Save size={17} />Simpan transaksi</button></div>
              </div>

            </>}

            {activeTab === "produk" && <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
              <div className="rounded-[2rem] bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-center gap-2 text-sm font-bold"><Plus size={17} className="text-emerald-600" />Tambah produk</div>
                <div className="space-y-4">
                  <label className="block text-xs font-bold text-slate-500">Nama produk<input value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} placeholder="Contoh: Roti Bakar" className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-400" /></label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-xs font-bold text-slate-500">Harga jual<input type="number" value={newProduct.price} onChange={e => setNewProduct({ ...newProduct, price: e.target.value })} placeholder="15000" className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-400" /></label>
                    <label className="block text-xs font-bold text-slate-500">Harga modal<input type="number" min="0" value={newProduct.costPrice} onChange={e => setNewProduct({ ...newProduct, costPrice: e.target.value })} placeholder="10000" className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-400" /></label>
                  </div>
                  <label className="block text-xs font-bold text-slate-500">Stok<input type="number" min="0" step="1" value={newProduct.stock} onChange={e => setNewProduct({ ...newProduct, stock: e.target.value })} placeholder="Contoh: 20" className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-400" /></label>
                  <label className="block text-xs font-bold text-slate-500">Kategori<select value={newProduct.category} onChange={e => setNewProduct({ ...newProduct, category: e.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-400"><option>Makanan</option><option>Minuman</option><option>Camilan</option><option>Lainnya</option></select></label>
                  <button onClick={saveProduct} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 text-sm font-bold text-white hover:bg-emerald-600"><Plus size={17} />Simpan produk</button>
                </div>
              </div>
              <div className="rounded-[2rem] bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-black">Katalog produk</h2><p className="mt-1 text-xs text-slate-400">{products.length} produk tersedia untuk suara</p></div><Package className="text-slate-300" /></div>
                <div className="rounded-2xl border border-slate-100">
                  <table className="w-full table-fixed text-left text-[11px]">
                    <colgroup><col className="w-[42%]" /><col className="w-[22%]" /><col className="w-[22%]" /><col className="w-[10%]" /><col className="w-[4%]" /></colgroup>
                    <thead className="bg-slate-50 text-[9px] uppercase tracking-wide text-slate-500"><tr><th className="px-2 py-2 font-bold">Produk</th><th className="px-2 py-2 font-bold">Jual</th><th className="px-2 py-2 font-bold">Modal</th><th className="px-2 py-2 font-bold">Qty</th><th className="px-1 py-2" /></tr></thead>
                    <tbody>{products.map(product => <tr key={product.id} className="border-t border-slate-100"><td className="px-2 py-2"><span className="block truncate font-bold">{product.name}</span></td><td className="px-2 py-2"><input type="number" min="0" value={product.price} onChange={event => updateProduct(product.id, "price", event.target.value)} className="w-full min-w-0 border-0 bg-transparent p-0 font-semibold outline-none focus:ring-0" /></td><td className="px-2 py-2"><input type="number" min="0" value={product.costPrice} onChange={event => updateProduct(product.id, "costPrice", event.target.value)} className="w-full min-w-0 border-0 bg-transparent p-0 font-semibold outline-none focus:ring-0" /></td><td className="px-2 py-2"><input type="number" min="0" step="1" value={product.stock} onChange={event => updateProduct(product.id, "stock", event.target.value)} className="w-full min-w-0 border-0 bg-transparent p-0 font-semibold outline-none focus:ring-0" /></td><td className="px-1 py-2 text-right">{!initialProducts.some(item => item.id === product.id) && <button onClick={() => setProducts(current => current.filter(item => item.id !== product.id))} className="text-slate-300 hover:text-rose-500" aria-label={`Hapus ${product.name}`}><Trash2 size={14} /></button>}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
            </section>}

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

        <nav className="fixed bottom-3 left-1/2 z-20 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 lg:hidden">
          <div className="relative flex h-[74px] items-center justify-between rounded-[2rem] border border-slate-100 bg-white/95 px-6 shadow-[0_12px_32px_rgba(15,23,42,0.14)] backdrop-blur">
            <div className="pointer-events-none absolute left-1/2 top-0 h-[64px] w-[132px] -translate-x-1/2 rounded-b-[66px] bg-[#f7f8fa]" />
            <div className="relative z-10 flex w-[44%] justify-between">
              {nav.slice(0, 2).map(item => <button key={item.id} onClick={() => { setReportDate(null); setActiveTab(item.id); }} aria-label={item.label} className={`relative grid h-12 w-12 place-items-center rounded-2xl transition ${item.id === "produk" ? "-translate-x-[55px]" : ""} ${activeTab === item.id ? "text-emerald-600" : "text-slate-300 hover:text-slate-500"}`}><item.icon size={22} />{activeTab === item.id && <span className="absolute -bottom-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />}</button>)}
            </div>
            <button onClick={startListening} aria-label={status === "listening" ? "Berhenti mendengarkan" : "Mulai input suara"} className={`absolute left-1/2 top-0 z-20 grid h-[76px] w-[76px] -translate-x-1/2 -translate-y-[30px] place-items-center rounded-full border-8 border-[#f7f8fa] transition ${status === "listening" ? "bg-rose-500 shadow-xl shadow-rose-200" : "bg-emerald-600 shadow-xl shadow-emerald-200 hover:scale-105"}`}>
              <span className="absolute inset-1 rounded-full border border-white/30" />
              {status === "listening" ? <div className="flex items-center gap-1"><span className="h-5 w-1 rounded-full bg-white animate-pulse" /><span className="h-8 w-1 rounded-full bg-white animate-pulse" /><span className="h-6 w-1 rounded-full bg-white animate-pulse" /></div> : <Mic size={30} className="text-white" />}
            </button>
            <div className="relative z-10 flex w-[44%] justify-between">
              {nav.slice(2).map(item => <button key={item.id} onClick={() => { setReportDate(null); setActiveTab(item.id); }} aria-label={item.label} className={`relative grid h-12 w-12 place-items-center rounded-2xl transition ${item.id === "riwayat" ? "translate-x-[55px]" : ""} ${activeTab === item.id ? "text-emerald-600" : "text-slate-300 hover:text-slate-500"}`}><item.icon size={22} />{activeTab === item.id && <span className="absolute -bottom-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />}</button>)}
            </div>
          </div>
        </nav>
      </div>

      {pending && <div className="fixed inset-0 z-30 grid place-items-end bg-slate-950/30 p-4 backdrop-blur-sm sm:place-items-center"><div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between"><div><div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-emerald-600"><Sparkles size={14} />Konfirmasi suara</div><h3 className="text-2xl font-black tracking-tight">{pending.type === "add" ? "Tambahkan ke keranjang?" : pending.type === "checkout" ? "Simpan transaksi?" : "Kosongkan keranjang?"}</h3></div><button onClick={() => setPending(null)} className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-900 hover:text-white"><X size={17} /></button></div>{pending.type === "add" && <div className="mb-5 space-y-2 rounded-2xl bg-slate-50 p-4">{pending.items?.map(item => <div key={item.name} className="flex justify-between text-sm font-bold"><span>{item.quantity}× {item.name}</span><span className="text-slate-400">{(() => { const p = findProduct(products, item.name); return p ? currency(p.price * item.quantity) : "—"; })()}</span></div>)}</div>}{pending.type === "checkout" && <div className="mb-5 rounded-2xl bg-slate-50 p-4"><div className="flex justify-between text-sm font-bold"><span>{itemCount} item</span><span>{currency(total)}</span></div><div className="mt-2 text-xs text-slate-400">Pembayaran: {pending.payment === "qr" ? "QRIS" : pending.payment === "debit" ? "Debit" : "Tunai"}</div></div>}<p className="mb-6 text-sm leading-6 text-slate-500">{pending.reply}</p><div className="grid grid-cols-2 gap-3"><button onClick={() => setPending(null)} className="rounded-2xl border border-slate-200 py-3.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Belum</button><button onClick={confirmPending} className="rounded-2xl bg-slate-900 py-3.5 text-sm font-bold text-white hover:bg-emerald-600">Ya, lanjutkan</button></div></div></div>}
    </div>
  );
}
