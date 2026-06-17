// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, Banknote, QrCode,
  CheckCircle2, Camera, AlertTriangle, X, Lock, History, Printer, Package, ChevronRight, Tags
} from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { supabase } from '../supabase';
import { Product, SaleItem } from '../types';
import { formatCurrency, formatDate, formatCurrencyInput, parseCurrencyInput } from '../utils/format';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { motion, AnimatePresence } from 'motion/react';

export default function POS({ user, onNavigate, isActive }: { user: any, onNavigate?: (tab: string) => void, isActive?: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    if (searchTerm.trim() !== '') setSelectedCategory(null);
  }, [searchTerm]);
  
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit_card' | 'debit_card' | 'pix'>('cash');
  const [discount, setDiscount] = useState<number>(0);
  const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('fixed');
  const [addition, setAddition] = useState<number>(0);
  const [payments, setPayments] = useState<{ method: string, amount: number }[]>([]);
  const [currentPaymentAmount, setCurrentPaymentAmount] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [selectedPaymentIndex, setSelectedPaymentIndex] = useState<number>(0);

  const PAYMENT_METHODS = [
    { id: 'cash', label: 'Dinheiro', icon: Banknote, key: 'F1', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
    { id: 'credit_card', label: 'Crédito', icon: CreditCard, key: 'F2', color: 'bg-blue-50 text-blue-600 border-blue-200' },
    { id: 'debit_card', label: 'Débito', icon: CreditCard, key: 'F3', color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
    { id: 'pix', label: 'PIX', icon: QrCode, key: 'F4', color: 'bg-teal-50 text-teal-600 border-teal-200' },
  ];

  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isActive && !isLoading && activeSession && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isActive, isLoading, activeSession]);

  const checkActiveSession = async () => {
    try {
      const { data, error } = await supabase
        .from('cashier_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .maybeSingle();
      if (error) throw error;
      setActiveSession(data);
    } catch (error) {
      console.error("Erro ao verificar sessão:", error);
    }
  };

  const handleScan = (code: string) => {
    const product = products.find(p => p.barcode === code || p.id === code);
    if (product) {
      addToCart(product);
    } else {
      alert(`Produto com código ${code} não encontrado.`);
    }
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase.from('products').select('*').eq('user_id', user.id).order('name');
    if (!error) setProducts(data || []);
  };

  const fetchCategories = async () => {
    const { data, error } = await supabase.from('categories').select('*').eq('user_id', user.id).order('name');
    if (!error) setCategories(data || []);
  };

  const fetchProfile = async () => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (!error) setProfile(data);
  };

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.productId === product.id);
    if (existing) {
      setCart(cart.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([{ productId: product.id!, name: product.name, price: product.price, cost: product.cost, quantity: 1 }, ...cart]);
    }
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.productId === productId) {
        return { ...item, quantity: Math.max(1, item.quantity + delta) };
      }
      return item;
    }));
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const discountAmount = discountType === 'percentage' ? subtotal * (discount / 100) : discount;
  const finalTotal = Math.max(0, subtotal - discountAmount + addition);
  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
  const remainingAmount = Math.max(0, finalTotal - totalPaid);

  const handleAddPayment = (method: string) => {
    let amount = currentPaymentAmount ? parseCurrencyInput(currentPaymentAmount) : remainingAmount;
    if (isNaN(amount) || amount <= 0) return;
    if (amount > remainingAmount && method !== 'cash') {
      alert(`Apenas pagamentos em dinheiro podem ter troco. O valor máximo para este método é R$ ${remainingAmount.toFixed(2)}`);
      return;
    }
    setPayments([...payments, { method, amount }]);
    setCurrentPaymentAmount('');
  };

  const removePayment = (index: number) => {
    setPayments(payments.filter((_, i) => i !== index));
  };

  const confirmCheckout = React.useCallback(async () => {
    if (cart.length === 0 || isProcessing || remainingAmount > 0) return;
    if (!activeSession) {
      alert("⚠️ CAIXA FECHADO: Você não pode realizar vendas com o caixa fechado.");
      return;
    }
    setIsProcessing(true);
    try {
      const primaryPaymentMethod = payments.length === 1 ? payments[0].method : 'multiple';
      const itemsWithMetadata = [...cart, { productId: 'METADATA', name: 'Metadata', price: 0, quantity: 1, discount: discountAmount, addition: addition, payments: payments }];

      let insertData: any = { items: itemsWithMetadata, total: finalTotal, payment_method: primaryPaymentMethod, discount: discountAmount, addition: addition, payments: payments, session_id: activeSession.id, user_id: user.id };
      let { data: saleData, error: saleError } = await supabase.from('sales').insert(insertData).select();

      if (saleError && saleError.message.includes('Could not find the')) {
        delete insertData.discount; delete insertData.addition; delete insertData.payments;
        const retryResult = await supabase.from('sales').insert(insertData).select();
        saleData = retryResult.data; saleError = retryResult.error;
      }
      
      if (saleError) throw new Error(`Erro ao registrar venda: ${saleError.message}`);

      for (const item of cart) {
        const { data: product, error: fetchError } = await supabase.from('products').select('stock').eq('id', item.productId).eq('user_id', user.id).single();
        if (fetchError) throw new Error(`Erro ao buscar estoque: ${fetchError.message}`);
        const newStock = (product.stock || 0) - (item.quantity || 0);
        const { error: updateError } = await supabase.from('products').update({ stock: newStock }).eq('id', item.productId).eq('user_id', user.id);
        if (updateError) throw new Error(`Erro ao atualizar estoque: ${updateError.message}`);
      }

      setCart([]); setDiscount(0); setAddition(0); setPayments([]); setCurrentPaymentAmount('');
      setLastSale({ items: cart, total: finalTotal, paymentMethod: primaryPaymentMethod, payments, discount: discountAmount, addition, date: new Date() });
      setShowSuccess(true);
    } catch (error: any) {
      alert("❌ Erro ao finalizar venda:\n\n" + (error.message || "Erro desconhecido."));
    } finally {
      setIsProcessing(false);
    }
  }, [cart, finalTotal, payments, discountAmount, addition, activeSession, user, isProcessing, remainingAmount]);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([ fetchProducts(), fetchCategories(), checkActiveSession(), fetchProfile() ]);
      setIsLoading(false);
    };
    init();

    const channel = supabase.channel('public:pos_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, fetchProducts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, fetchCategories)
      .subscribe();

    const sessionChannel = supabase.channel('pos_session_check')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cashier_sessions' }, checkActiveSession)
      .subscribe();

    return () => { supabase.removeChannel(channel); supabase.removeChannel(sessionChannel); if (scannerRef.current) scannerRef.current.clear(); };
  }, []);

  useEffect(() => { if (isActive) { fetchProducts(); fetchCategories(); } }, [isActive]);

  useEffect(() => {
    if (searchTerm.trim().length >= 3) {
      const exactMatch = products.find(p => p.barcode === searchTerm.trim());
      if (exactMatch) { addToCart(exactMatch); setSearchTerm(''); }
    }
  }, [searchTerm, products]);

  useEffect(() => {
    if (isScanning) {
      const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
      scanner.render((decodedText) => { handleScan(decodedText); setIsScanning(false); try { scanner.clear(); } catch (e) {} }, () => {});
      scannerRef.current = scanner;
    } else {
      if (scannerRef.current) { try { scannerRef.current.clear(); } catch (e) {} scannerRef.current = null; }
    }
    return () => { if (scannerRef.current) { try { scannerRef.current.clear(); } catch (e) {} } };
  }, [isScanning]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (['F1', 'F2', 'F3', 'F4', 'F10'].includes(e.key)) e.preventDefault();
      if (e.key === 'Escape') setIsScanning(false);
      if (showSuccess) {
        if (e.key === 'Enter') { e.preventDefault(); setShowSuccess(false); }
        return;
      }
      if (e.key === 'F1') handleAddPayment('cash');
      if (e.key === 'F2') handleAddPayment('credit_card');
      if (e.key === 'F3') handleAddPayment('debit_card');
      if (e.key === 'F4') handleAddPayment('pix');
      if (e.key === 'F10') { if (cart.length > 0 && !isProcessing && activeSession && remainingAmount <= 0) confirmCheckout(); }
      if (document.activeElement?.tagName !== 'INPUT') {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setSelectedPaymentIndex(prev => (prev + 1) % 4); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setSelectedPaymentIndex(prev => (prev - 1 + 4) % 4); }
        if (e.key === 'Enter') {
          if (cart.length > 0 && remainingAmount > 0) { e.preventDefault(); handleAddPayment(PAYMENT_METHODS[selectedPaymentIndex].id); }
          else if (cart.length > 0 && remainingAmount <= 0) { e.preventDefault(); confirmCheckout(); }
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [cart, isProcessing, activeSession, paymentMethod, handleAddPayment, confirmCheckout, remainingAmount, selectedPaymentIndex, PAYMENT_METHODS, showSuccess]);

  const filteredProducts = React.useMemo(() => {
    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      return products.filter(p => p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term) || (p.barcode && p.barcode.toLowerCase().includes(term)));
    }
    return products.filter(p => !selectedCategory || p.category === selectedCategory);
  }, [products, searchTerm, selectedCategory]);

  const printReceipt = (sale: any) => {
    const doc = new jsPDF({ unit: 'mm', format: [80, 200] });
    const storeName = profile?.store_name || 'CELLREPAIR PRO';
    const storeCnpj = profile?.cnpj || '';
    const storePhone = profile?.phone || '';
    const storeAddress = profile?.address || '';

    doc.setFontSize(12); doc.text(storeName.toUpperCase(), 40, 10, { align: 'center' }); doc.setFontSize(8);
    if (storeCnpj) doc.text(`CNPJ: ${storeCnpj}`, 40, 15, { align: 'center' });
    if (storePhone) doc.text(`Tel: ${storePhone}`, 40, 20, { align: 'center' });
    if (storeAddress) { const splitAddress = doc.splitTextToSize(storeAddress, 70); doc.text(splitAddress, 40, 25, { align: 'center' }); }
    
    const startY = storeAddress ? 35 : 25;
    doc.text('Cupom Não Fiscal', 40, startY, { align: 'center' }); doc.text('------------------------------------------', 40, startY + 5, { align: 'center' });
    let y = startY + 10;
    doc.text(`Data: ${formatDate(sale.date)}`, 5, y); y += 5;
    doc.text(`Pagamento: ${sale.paymentMethod === 'multiple' ? 'Múltiplos' : sale.paymentMethod}`, 5, y); y += 5;
    doc.text('------------------------------------------', 40, y, { align: 'center' }); y += 5;
    
    sale.items.forEach((item: any) => {
      doc.text(`${item.quantity}x ${item.name.substring(0, 20)}`, 5, y);
      doc.text(`${formatCurrency(item.price * item.quantity)}`, 75, y, { align: 'right' }); y += 5;
    });
    
    if (sale.discount > 0) { doc.text(`Desconto:`, 5, y); doc.text(`-${formatCurrency(sale.discount)}`, 75, y, { align: 'right' }); y += 5; }
    if (sale.addition > 0) { doc.text(`Acréscimo:`, 5, y); doc.text(`+${formatCurrency(sale.addition)}`, 75, y, { align: 'right' }); y += 5; }
    doc.text('------------------------------------------', 40, y, { align: 'center' }); y += 5;
    doc.setFontSize(10); doc.text(`TOTAL: ${formatCurrency(sale.total)}`, 5, y); y += 10;
    
    if (sale.payments && sale.payments.length > 0) {
      doc.setFontSize(8); doc.text('Pagamentos:', 5, y); y += 5;
      sale.payments.forEach((p: any) => { doc.text(`${p.method}:`, 5, y); doc.text(`${formatCurrency(p.amount)}`, 75, y, { align: 'right' }); y += 5; });
      y += 5;
    }
    doc.setFontSize(8); doc.text('Obrigado pela preferência!', 40, y, { align: 'center' }); doc.save(`Venda_${new Date().getTime()}.pdf`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full h-[calc(100vh-2rem)] bg-transparent">
      {/* Active Session Overlay */}
      <AnimatePresence>
        {!activeSession && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-white/40 backdrop-blur-md flex items-center justify-center rounded-[2.5rem] border border-white/50 shadow-2xl"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="bg-white/90 p-10 rounded-3xl shadow-2xl border border-gray-100 text-center max-w-md backdrop-blur-xl"
            >
              <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                <Lock className="w-12 h-12 text-red-500" />
              </div>
              <h2 className="text-3xl font-black text-gray-900 mb-3 tracking-tight">Caixa Fechado</h2>
              <p className="text-gray-500 mb-8 font-medium leading-relaxed">
                Abra uma nova sessão na aba <strong className="text-gray-900">Financeiro</strong> para poder realizar vendas com segurança.
              </p>
              <div className="flex justify-center">
                 {onNavigate && (
                  <button onClick={() => onNavigate('cashier')} className="px-6 py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-bold shadow-xl transition-all hover:-translate-y-0.5">
                    Ir para o Caixa
                  </button>
                 )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white/60 backdrop-blur-2xl rounded-[2.5rem] shadow-xl border border-white/60 overflow-hidden">
        {/* Header Bar */}
        <div className="px-8 pt-8 pb-4 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3">
              <div className="bg-orange-500 text-white p-2 rounded-xl shadow-lg shadow-orange-500/30">
                <ShoppingCart className="w-6 h-6" />
              </div>
              Frente de Caixa
            </h1>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsScanning(!isScanning)}
                className={`px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-sm ${
                  isScanning 
                    ? 'bg-red-500 text-white shadow-red-500/30' 
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                {isScanning ? <X className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
                {isScanning ? 'Cancelar Scanner' : 'Ler Código (F5)'}
              </button>
              {onNavigate && (
                <button onClick={() => onNavigate('sales')} className="p-2.5 bg-white text-gray-600 hover:text-orange-600 rounded-xl font-bold transition-all shadow-sm border border-gray-200 hover:border-orange-200">
                  <History className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-4 items-center">
            <div className="relative flex-1 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-orange-500 transition-colors" />
              <input 
                ref={searchInputRef} type="text" placeholder="Buscar por nome, código ou categoria..." 
                className="w-full pl-12 pr-4 py-4 bg-white/80 border-2 border-transparent focus:border-orange-500 rounded-2xl shadow-sm outline-none transition-all text-gray-700 font-medium placeholder-gray-400 focus:bg-white"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchTerm.trim()) {
                    const exactMatch = products.find(p => p.barcode === searchTerm.trim() || p.name.toLowerCase() === searchTerm.trim().toLowerCase());
                    if (exactMatch) { addToCart(exactMatch); setSearchTerm(''); e.preventDefault(); }
                  }
                }}
              />
            </div>
          </div>

          {/* Categories */}
          <div className="flex flex-wrap gap-2 pb-2">
            <button
              onClick={() => { setSelectedCategory(null); setSearchTerm(''); }}
              className={`px-5 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all shadow-sm flex items-center gap-2 ${
                selectedCategory === null 
                  ? 'bg-gray-900 text-white shadow-gray-900/20' 
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Tags className="w-4 h-4" /> Todos
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id} onClick={() => { setSelectedCategory(cat.name); setSearchTerm(''); }}
                className={`px-5 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all shadow-sm ${
                  selectedCategory === cat.name 
                    ? 'bg-gray-900 text-white shadow-gray-900/20' 
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Scanner view */}
        <AnimatePresence>
          {isScanning && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-8 overflow-hidden">
              <div className="bg-gray-900 p-1 rounded-2xl shadow-2xl relative mb-6">
                <div id="reader" className="w-full rounded-xl overflow-hidden [&>video]:rounded-xl"></div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto px-8 pb-8 pt-2 scrollbar-hide">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {filteredProducts.map((product) => (
              <motion.button
                whileHover={{ scale: product.stock > 0 ? 1.02 : 1, y: product.stock > 0 ? -4 : 0 }}
                whileTap={{ scale: product.stock > 0 ? 0.98 : 1 }}
                key={product.id} onClick={() => addToCart(product)} disabled={product.stock <= 0}
                className="bg-white p-5 rounded-2xl border border-gray-100 hover:border-orange-200 shadow-sm hover:shadow-xl transition-all text-left group disabled:opacity-50 disabled:grayscale flex flex-col min-h-[140px] relative overflow-hidden"
              >
                <div className="absolute -right-4 -top-4 w-16 h-16 bg-gradient-to-br from-orange-50 to-orange-100 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500" />
                <div className="mb-auto z-10">
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1">{product.category}</span>
                  <h3 className="font-bold text-sm text-gray-900 leading-tight line-clamp-2">{product.name}</h3>
                </div>
                <div className="mt-4 z-10 flex items-end justify-between">
                  <p className="text-lg text-orange-600 font-black tracking-tight">{formatCurrency(product.price)}</p>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg shadow-sm ${product.stock <= 5 ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-green-50 text-green-700 border border-green-100'}`}>
                    {product.stock} un
                  </span>
                </div>
              </motion.button>
            ))}
            {filteredProducts.length === 0 && (
              <div className="col-span-full py-20 text-center text-gray-400 flex flex-col items-center justify-center">
                <Package className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-lg font-medium">Nenhum produto encontrado</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cart Sidebar */}
      <div className="w-full lg:w-[400px] flex-shrink-0 bg-white rounded-[2.5rem] shadow-2xl border border-gray-100 flex flex-col h-full overflow-hidden relative">
        <div className="p-8 pb-6 border-b border-gray-50 flex items-center justify-between bg-white/80 backdrop-blur-md z-10 shrink-0">
          <div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Carrinho</h2>
            <p className="text-sm text-gray-500 font-medium mt-1">
              {cart.reduce((acc, item) => acc + item.quantity, 0)} itens selecionados
            </p>
          </div>
          {cart.length > 0 && (
            <button onClick={() => setCart([])} className="p-2.5 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl transition-colors">
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-8 pt-4 space-y-4 scrollbar-hide bg-gray-50/30">
          <AnimatePresence>
            {cart.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center border-2 border-dashed border-gray-200">
                  <ShoppingCart className="w-10 h-10 text-gray-300" />
                </div>
                <p className="font-medium">Adicione produtos para vender</p>
              </motion.div>
            ) : (
              cart.map((item) => (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20, scale: 0.95 }}
                  key={item.productId} className="flex items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100 group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 truncate">{item.name}</p>
                    <p className="text-sm text-orange-600 font-black">{formatCurrency(item.price)}</p>
                  </div>
                  <div className="flex items-center bg-gray-50 rounded-xl p-1 shadow-inner border border-gray-100">
                    <button onClick={() => updateQuantity(item.productId, -1)} className="p-1.5 hover:bg-white rounded-lg transition-all text-gray-600 hover:text-red-500 hover:shadow-sm">
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold text-gray-900">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.productId, 1)} className="p-1.5 hover:bg-white rounded-lg transition-all text-gray-600 hover:text-green-500 hover:shadow-sm">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        <div className="p-8 pt-6 bg-white border-t border-gray-100 flex flex-col gap-5 shrink-0 rounded-t-[2rem] shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)] z-10">
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Desconto</label>
              <div className="flex items-center gap-2">
                <select value={discountType} onChange={(e) => setDiscountType(e.target.value as any)} className="bg-transparent text-sm font-bold text-gray-700 outline-none w-12 cursor-pointer">
                  <option value="fixed">R$</option>
                  <option value="percentage">%</option>
                </select>
                <div className="h-4 w-px bg-gray-300"></div>
                <input 
                  type="text" value={discountType === 'fixed' ? formatCurrencyInput(discount) : discount || ''}
                  onChange={(e) => setDiscount(discountType === 'fixed' ? parseCurrencyInput(e.target.value) : parseFloat(e.target.value) || 0)}
                  className="w-full bg-transparent text-sm font-bold outline-none text-right placeholder-gray-300" placeholder="0,00"
                />
              </div>
            </div>
            <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Acréscimo</label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-500">R$</span>
                <div className="h-4 w-px bg-gray-300"></div>
                <input 
                  type="text" value={formatCurrencyInput(addition)}
                  onChange={(e) => setAddition(parseCurrencyInput(e.target.value))}
                  className="w-full bg-transparent text-sm font-bold outline-none text-right placeholder-gray-300" placeholder="0,00"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-between items-end mb-2">
            <div>
              <p className="text-sm text-gray-500 font-semibold mb-1">Total da Venda</p>
              {subtotal !== finalTotal && <p className="text-xs text-gray-400 line-through">{formatCurrency(subtotal)}</p>}
            </div>
            <span className="text-4xl font-black text-gray-900 tracking-tighter">{formatCurrency(finalTotal)}</span>
          </div>

          {payments.length > 0 && (
            <div className="space-y-2 max-h-32 overflow-y-auto pr-2">
              {payments.map((p, idx) => {
                const methodConfig = PAYMENT_METHODS.find(m => m.id === p.method);
                return (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={idx} className={`flex justify-between items-center p-3 rounded-xl border ${methodConfig?.color || 'bg-gray-50'}`}>
                    <div className="flex items-center gap-2">
                      {methodConfig && <methodConfig.icon className="w-4 h-4" />}
                      <span className="font-bold text-sm">{methodConfig?.label || p.method}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-black">{formatCurrency(p.amount)}</span>
                      <button onClick={() => removePayment(idx)} className="p-1 hover:bg-white/50 rounded-md transition-colors text-red-500"><X className="w-4 h-4" /></button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {remainingAmount > 0 && (
            <div className="space-y-3">
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <span className="text-gray-400 font-bold group-focus-within:text-orange-500 transition-colors">R$</span>
                </div>
                <input
                  type="text" value={currentPaymentAmount}
                  onChange={(e) => setCurrentPaymentAmount(formatCurrencyInput(e.target.value))}
                  onFocus={() => { if (!currentPaymentAmount && remainingAmount > 0) setCurrentPaymentAmount(formatCurrencyInput(remainingAmount)); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleAddPayment(PAYMENT_METHODS[selectedPaymentIndex].id); }
                    else if (e.key === 'ArrowRight') { e.preventDefault(); setSelectedPaymentIndex(prev => (prev + 1) % 4); }
                    else if (e.key === 'ArrowLeft') { e.preventDefault(); setSelectedPaymentIndex(prev => (prev - 1 + 4) % 4); }
                  }}
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-orange-500 focus:bg-white rounded-2xl text-lg font-black outline-none transition-all placeholder-gray-300"
                  placeholder="Valor recebido"
                />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {PAYMENT_METHODS.map((method, index) => (
                  <button
                    key={method.id} onClick={() => handleAddPayment(method.id)}
                    className={`relative flex flex-col items-center justify-center gap-2 p-3 rounded-xl transition-all border-2 ${
                      selectedPaymentIndex === index 
                        ? 'border-gray-900 bg-gray-900 text-white shadow-xl shadow-gray-900/20 scale-105 z-10' 
                        : 'border-gray-100 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`absolute top-1 right-1.5 text-[8px] font-bold px-1 rounded ${selectedPaymentIndex === index ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-400'}`}>
                      {method.key}
                    </div>
                    <method.icon className={`w-5 h-5 ${selectedPaymentIndex === index ? 'text-white' : ''}`} />
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${selectedPaymentIndex === index ? 'text-white' : ''}`}>
                      {method.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {payments.length > 0 && remainingAmount <= 0 && (
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex justify-between items-center animate-in zoom-in-95 duration-300">
              <span className="font-bold text-emerald-800 uppercase tracking-wider text-sm">Troco a Devolver</span>
              <span className="text-2xl font-black text-emerald-600">{formatCurrency(totalPaid - finalTotal)}</span>
            </div>
          )}

          <button
            onClick={confirmCheckout}
            disabled={cart.length === 0 || isProcessing || remainingAmount > 0}
            className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-gray-200 disabled:to-gray-300 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-black text-lg py-5 rounded-2xl shadow-xl shadow-orange-500/30 transition-all flex items-center justify-center gap-3 relative overflow-hidden group"
          >
            {isProcessing ? (
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processando...
              </div>
            ) : (
              <>
                Finalizar Venda
                <div className="bg-white/20 p-1.5 rounded-lg group-hover:translate-x-1 transition-transform">
                  <ChevronRight className="w-5 h-5" />
                </div>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Success Modal */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: -20 }}
              className="bg-white rounded-[3rem] p-12 text-center max-w-lg w-full shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-green-50 to-white" />
              <div className="relative z-10">
                <motion.div 
                  initial={{ scale: 0 }} animate={{ scale: 1, rotate: [0, 10, -10, 0] }} transition={{ type: 'spring', bounce: 0.5 }}
                  className="bg-gradient-to-tr from-green-400 to-emerald-500 w-32 h-32 rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-green-500/40 border-8 border-white"
                >
                  <CheckCircle2 className="w-16 h-16 text-white" />
                </motion.div>
                
                <h2 className="text-4xl font-black text-gray-900 mb-2 tracking-tight">Venda Concluída!</h2>
                <p className="text-lg text-gray-500 mb-10 font-medium">O estoque e o caixa foram atualizados.</p>
                
                <div className="flex flex-col gap-3">
                  <button onClick={() => printReceipt(lastSale)} className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-black transition-all shadow-xl hover:-translate-y-1">
                    <Printer className="w-6 h-6" />
                    Imprimir Recibo (PDF)
                  </button>
                  <button onClick={() => setShowSuccess(false)} className="w-full py-4 bg-gray-100 text-gray-700 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-gray-200 transition-all">
                    Nova Venda
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
