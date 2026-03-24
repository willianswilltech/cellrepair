// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  CreditCard, 
  Banknote, 
  QrCode,
  CheckCircle2,
  Camera,
  AlertTriangle,
  X,
  Lock,
  History,
  Printer
} from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { supabase } from '../supabase';
import { Product, SaleItem } from '../types';
import { formatCurrency, formatDate } from '../utils/format';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

export default function POS({ user, onNavigate, isActive }: { user: any, onNavigate?: (tab: string) => void, isActive?: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit_card' | 'debit_card' | 'pix'>('cash');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [activeSession, setActiveSession] = useState<any>(null);
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
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', user.id)
      .order('name')
      .limit(100);
    
    if (error) {
      console.error('Error fetching products:', error);
    } else {
      setProducts(data || []);
    }
  };

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .order('name');
    
    if (error) {
      console.error('Error fetching categories:', error);
    } else {
      setCategories(data || []);
    }
  };

  const fetchProfile = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    
    if (error) {
      console.error('Error fetching profile:', error);
    } else {
      setProfile(data);
    }
  };

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.productId === product.id);
    if (existing) {
      setCart(cart.map(item => 
        item.productId === product.id 
          ? { ...item, quantity: item.quantity + 1 } 
          : item
      ));
    } else {
      setCart([...cart, {
        productId: product.id!,
        name: product.name,
        price: product.price,
        cost: product.cost,
        quantity: 1
      }]);
    }
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.productId === productId) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const total = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  const handleCheckout = React.useCallback(async () => {
    if (cart.length === 0 || isProcessing) return;
    
    if (!activeSession) {
      alert("⚠️ CAIXA FECHADO: Você não pode realizar vendas com o caixa fechado. Por favor, abra o caixa no módulo 'Caixa / Financeiro' primeiro.");
      return;
    }

    setIsProcessing(true);
    try {
      console.log("Iniciando checkout...", { cart, total, paymentMethod, sessionId: activeSession.id, userId: user.id });
      
      // Step 1: Create Sale record
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert({
          items: cart,
          total,
          payment_method: paymentMethod,
          session_id: activeSession.id,
          user_id: user.id
        })
        .select();
      
      if (saleError) {
        console.error("Erro ao inserir venda:", saleError);
        throw new Error(`[PASSO 1: REGISTRO] Erro ao registrar venda: ${saleError.message} (Código: ${saleError.code})`);
      }

      console.log("Venda registrada com sucesso:", saleData);

      // Step 2: Update Stock
      for (const item of cart) {
        console.log(`Atualizando estoque para produto ${item.productId}...`);
        const { data: product, error: fetchError } = await supabase
          .from('products')
          .select('stock')
          .eq('id', item.productId)
          .eq('user_id', user.id)
          .single();
        
        if (fetchError) {
          console.error(`Erro ao buscar estoque do produto ${item.productId}:`, fetchError);
          throw new Error(`[PASSO 2: BUSCA ESTOQUE] Erro ao buscar estoque do produto ${item.name}: ${fetchError.message}`);
        }

        const newStock = (product.stock || 0) - (item.quantity || 0);
        const { error: updateError } = await supabase
          .from('products')
          .update({ stock: newStock })
          .eq('id', item.productId)
          .eq('user_id', user.id);
        
        if (updateError) {
          console.error(`Erro ao atualizar estoque do produto ${item.productId}:`, updateError);
          throw new Error(`[PASSO 2: ATUALIZA ESTOQUE] Erro ao atualizar estoque do produto ${item.name}: ${updateError.message}`);
        }
        console.log(`Estoque atualizado para ${item.name}: ${newStock}`);
      }

      setCart([]);
      setLastSale({ items: cart, total, paymentMethod, date: new Date() });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 5000);
    } catch (error: any) {
      console.error("Erro detalhado no checkout:", error);
      alert("❌ Erro ao finalizar venda:\n\n" + (error.message || "Erro desconhecido. Verifique o console para mais detalhes."));
    } finally {
      setIsProcessing(false);
    }
  }, [cart, total, paymentMethod, activeSession, user, isProcessing]);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchProducts(),
        fetchCategories(),
        checkActiveSession(),
        fetchProfile()
      ]);
      setIsLoading(false);
    };
    init();

    // @ts-ignore
    const channel = supabase
      .channel('public:pos_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        fetchProducts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
        fetchCategories();
      })
      .subscribe();

    const sessionChannel = supabase
      .channel('pos_session_check')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cashier_sessions' }, () => {
        checkActiveSession();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(sessionChannel);
      if (scannerRef.current) {
        scannerRef.current.clear();
      }
    };
  }, []);

  useEffect(() => {
    if (searchTerm.trim().length >= 3) {
      const exactMatch = products.find(p => p.barcode === searchTerm.trim());
      if (exactMatch) {
        addToCart(exactMatch);
        setSearchTerm('');
      }
    }
  }, [searchTerm, products]);

  useEffect(() => {
    if (isScanning) {
      const scanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
      );
      
      scanner.render((decodedText) => {
        handleScan(decodedText);
        setIsScanning(false);
        try {
          scanner.clear();
        } catch (e) {
          console.error("Erro ao limpar scanner:", e);
        }
      }, (error) => {
        // console.warn(error);
      });

      scannerRef.current = scanner;
    } else {
      if (scannerRef.current) {
        try {
          scannerRef.current.clear();
        } catch (e) {
          console.error("Erro ao limpar scanner:", e);
        }
        scannerRef.current = null;
      }
    }
    
    return () => {
      if (scannerRef.current) {
        try {
          scannerRef.current.clear();
        } catch (e) {
          // ignore
        }
      }
    };
  }, [isScanning]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Prevent default browser behavior for F keys we use
      if (['F1', 'F2', 'F3', 'F4', 'F10'].includes(e.key)) {
        e.preventDefault();
      }

      if (e.key === 'Escape') {
        setIsScanning(false);
      }

      if (e.key === 'F1') setPaymentMethod('cash');
      if (e.key === 'F2') setPaymentMethod('credit_card');
      if (e.key === 'F3') setPaymentMethod('debit_card');
      if (e.key === 'F4') setPaymentMethod('pix');
      
      if (e.key === 'F10') {
        if (cart.length > 0 && !isProcessing && activeSession) {
          handleCheckout();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [cart, isProcessing, activeSession, paymentMethod, handleCheckout]);


  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchTerm.trim()) {
      const exactMatch = products.find(p => 
        p.barcode === searchTerm.trim() || 
        p.name.toLowerCase() === searchTerm.trim().toLowerCase()
      );
      if (exactMatch) {
        addToCart(exactMatch);
        setSearchTerm('');
        e.preventDefault();
      }
    }
  };

  const filteredProducts = React.useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.barcode && p.barcode.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesCategory = !selectedCategory || p.category === selectedCategory;
      
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  const printReceipt = (sale: any) => {
    const doc = new jsPDF({
      unit: 'mm',
      format: [80, 200]
    });

    const storeName = profile?.store_name || 'CELLREPAIR PRO';
    const storeCnpj = profile?.cnpj || '';
    const storePhone = profile?.phone || '';
    const storeAddress = profile?.address || '';

    doc.setFontSize(12);
    doc.text(storeName.toUpperCase(), 40, 10, { align: 'center' });
    doc.setFontSize(8);
    if (storeCnpj) doc.text(`CNPJ: ${storeCnpj}`, 40, 15, { align: 'center' });
    if (storePhone) doc.text(`Tel: ${storePhone}`, 40, 20, { align: 'center' });
    if (storeAddress) {
      const splitAddress = doc.splitTextToSize(storeAddress, 70);
      doc.text(splitAddress, 40, 25, { align: 'center' });
    }
    
    const startY = storeAddress ? 35 : 25;
    doc.text('Cupom Não Fiscal', 40, startY, { align: 'center' });
    doc.text('------------------------------------------', 40, startY + 5, { align: 'center' });
    
    let y = startY + 10;
    doc.text(`Data: ${formatDate(sale.date)}`, 5, y);
    y += 5;
    doc.text(`Pagamento: ${sale.paymentMethod}`, 5, y);
    y += 5;
    doc.text('------------------------------------------', 40, y, { align: 'center' });
    
    y += 5;
    sale.items.forEach((item: any) => {
      doc.text(`${item.quantity}x ${item.name.substring(0, 20)}`, 5, y);
      doc.text(`${formatCurrency(item.price * item.quantity)}`, 75, y, { align: 'right' });
      y += 5;
    });
    
    doc.text('------------------------------------------', 40, y, { align: 'center' });
    y += 5;
    doc.setFontSize(10);
    doc.text(`TOTAL: ${formatCurrency(sale.total)}`, 5, y);
    y += 10;
    doc.setFontSize(8);
    doc.text('Obrigado pela preferência!', 40, y, { align: 'center' });

    doc.save(`Venda_${new Date().getTime()}.pdf`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:h-[calc(100vh-160px)] relative">
      {!activeSession && (
        <div className="absolute inset-0 z-50 bg-white/60 backdrop-blur-[2px] flex items-center justify-center rounded-3xl border-2 border-dashed border-orange-200">
          <div className="bg-white p-8 rounded-3xl shadow-2xl border border-orange-100 text-center max-w-md animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock className="w-10 h-10 text-orange-600" />
            </div>
            <h2 className="text-2xl font-black text-gray-900 mb-2">Caixa Fechado</h2>
            <p className="text-gray-500 mb-6 font-medium">
              Não é possível realizar vendas com o caixa fechado. Por favor, abra uma nova sessão na aba <span className="text-orange-600 font-bold">Caixa / Financeiro</span>.
            </p>
            <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 text-orange-800 text-sm font-bold">
              Atenção: Todas as vendas devem ser registradas em um caixa aberto para garantir a integridade financeira.
            </div>
          </div>
        </div>
      )}

      {/* Product Selection */}
      <div className="lg:col-span-2 flex flex-col space-y-4">
        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input 
                ref={searchInputRef}
                type="text" 
                placeholder="Buscar produto por nome, categoria ou código..." 
                className="w-full pl-10 pr-4 py-3 bg-orange-50/20 border border-orange-100 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchTerm.trim()) {
                    const exactMatch = products.find(p => 
                      p.barcode === searchTerm.trim() || 
                      p.name.toLowerCase() === searchTerm.trim().toLowerCase()
                    );
                    if (exactMatch) {
                      addToCart(exactMatch);
                      setSearchTerm('');
                      e.preventDefault();
                    }
                  }
                }}
              />
            </div>
            <button 
              onClick={() => setIsScanning(!isScanning)}
              className={`px-6 py-3 rounded-2xl font-semibold flex items-center gap-2 transition-all shadow-sm ${
                isScanning 
                  ? 'bg-red-100 text-red-600 border border-red-200' 
                  : 'bg-orange-600 text-white hover:bg-orange-700 shadow-orange-200'
              }`}
            >
              {isScanning ? <X className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
              {isScanning ? 'Fechar' : 'Escanear'}
            </button>
            
            {onNavigate && (
              <button 
                onClick={() => onNavigate('sales')}
                className="px-6 py-3 bg-white border border-orange-100 text-orange-600 rounded-2xl font-semibold flex items-center gap-2 hover:bg-orange-50 transition-all shadow-sm"
              >
                <History className="w-5 h-5" />
                Histórico
              </button>
            )}
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all border ${
                selectedCategory === null 
                  ? 'bg-orange-600 text-white border-orange-600 shadow-md' 
                  : 'bg-white text-gray-600 border-orange-100 hover:border-orange-300'
              }`}
            >
              Todos
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.name)}
                className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all border ${
                  selectedCategory === cat.name 
                    ? 'bg-orange-600 text-white border-orange-600 shadow-md' 
                    : 'bg-white text-gray-600 border-orange-100 hover:border-orange-300'
              }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {isScanning && (
          <div className="bg-white p-4 rounded-3xl border border-orange-100 shadow-xl overflow-hidden relative">
            <div id="reader" className="w-full"></div>
            <p className="text-center text-sm text-gray-500 mt-4">
              Aponte a câmera para o código de barras ou QR code do produto.
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              onClick={() => addToCart(product)}
              disabled={product.stock <= 0}
              className="bg-blue-50/50 p-2 rounded-xl border border-blue-100 hover:border-blue-400 hover:bg-blue-100 hover:shadow-sm transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="aspect-square bg-white rounded-lg mb-1.5 flex items-center justify-center group-hover:bg-blue-50 transition-colors w-8 h-8">
                <ShoppingCart className="w-4 h-4 text-blue-600" />
              </div>
              <h3 className="font-bold text-[11px] text-gray-900 leading-tight line-clamp-2 h-8 mb-1">{product.name}</h3>
              <p className="text-[9px] text-blue-600 font-bold mb-1">{formatCurrency(product.price)}</p>
              <div className="flex items-center justify-between mt-auto">
                <span className={`text-[8px] font-bold px-1 py-0.5 rounded-md ${product.stock <= 5 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                  {product.stock} un
                </span>
                <span className="text-[8px] text-gray-400 truncate max-w-[40px]">{product.category}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Cart / Checkout */}
      <div className="bg-orange-50/10 rounded-3xl shadow-xl border border-orange-100 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-orange-50 bg-orange-50/50 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-orange-600" />
            Carrinho
            {cart.length > 0 && (
              <span className="bg-orange-100 text-orange-600 text-[10px] px-2 py-0.5 rounded-full">
                {cart.reduce((acc, item) => acc + item.quantity, 0)} itens
              </span>
            )}
          </h2>
          {cart.length > 0 && (
            <button 
              onClick={() => setCart([])}
              className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              Limpar
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-2">
              <ShoppingCart className="w-12 h-12 opacity-20" />
              <p>Seu carrinho está vazio</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.productId} className="flex items-center gap-3 group">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-orange-600 font-semibold">{formatCurrency(item.price)}</p>
                </div>
                <div className="flex items-center bg-orange-50 rounded-lg p-1">
                  <button onClick={() => updateQuantity(item.productId, -1)} className="p-1 hover:bg-white rounded-md transition-colors">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.productId, 1)} className="p-1 hover:bg-white rounded-md transition-colors">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <button 
                  onClick={() => removeFromCart(item.productId)}
                  className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-6 bg-orange-50/50 border-t border-orange-100 space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Forma de Pagamento</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'cash', label: 'Dinheiro', icon: Banknote, key: 'F1' },
                { id: 'credit_card', label: 'Crédito', icon: CreditCard, key: 'F2' },
                { id: 'debit_card', label: 'Débito', icon: CreditCard, key: 'F3' },
                { id: 'pix', label: 'PIX', icon: QrCode, key: 'F4' },
              ].map((method) => (
                <button
                  key={method.id}
                  onClick={() => setPaymentMethod(method.id as any)}
                  className={`flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                    paymentMethod === method.id 
                      ? 'bg-orange-600 text-white border-orange-600 shadow-md' 
                      : 'bg-white text-gray-600 border-orange-100 hover:border-orange-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <method.icon className="w-4 h-4" />
                    {method.label}
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${paymentMethod === method.id ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                    {method.key}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-gray-500 font-medium">Total</span>
            <span className="text-2xl font-black text-gray-900">{formatCurrency(total)}</span>
          </div>

          <button
            onClick={handleCheckout}
            disabled={cart.length === 0 || isProcessing}
            className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white font-bold py-4 rounded-2xl shadow-lg shadow-orange-200 transition-all flex flex-col items-center justify-center gap-1"
          >
            {isProcessing ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-6 h-6" />
                  Finalizar Venda
                </div>
                <span className="text-[10px] opacity-80 font-medium">Atalho: F10</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Success Overlay */}
      {showSuccess && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-orange-600/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="text-center text-white space-y-4">
            <div className="bg-white w-24 h-24 rounded-full flex items-center justify-center mx-auto shadow-2xl">
              <CheckCircle2 className="w-16 h-16 text-orange-600" />
            </div>
            <h2 className="text-4xl font-black">Venda Realizada!</h2>
            <p className="text-orange-100 text-xl">O estoque foi atualizado automaticamente.</p>
            <div className="flex gap-4 justify-center pt-8">
              <button 
                onClick={() => printReceipt(lastSale)}
                className="px-8 py-4 bg-white text-orange-600 rounded-2xl font-bold flex items-center gap-2 hover:bg-orange-50 transition-all shadow-xl"
              >
                <Printer className="w-6 h-6" />
                Imprimir Recibo
              </button>
              <button 
                onClick={() => setShowSuccess(false)}
                className="px-8 py-4 bg-orange-700 text-white rounded-2xl font-bold flex items-center gap-2 hover:bg-orange-800 transition-all shadow-xl"
              >
                <X className="w-6 h-6" />
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
