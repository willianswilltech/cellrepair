// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Calendar, 
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Banknote,
  CreditCard,
  QrCode,
  Search,
  Plus,
  Minus,
  Lock,
  Unlock,
  History,
  AlertCircle,
  AlertTriangle,
  X
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { supabase } from '../supabase';
import { formatCurrency } from '../utils/format';
import { format, startOfMonth, endOfMonth, subDays, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Cashier({ user }: { user: any }) {
  console.log("Renderizando componente Cashier para o usuário:", user?.id);
  const [error, setError] = useState<string | null>(null);
  const [sales, setSales] = useState([]);
  const [serviceOrders, setServiceOrders] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [movements, setMovements] = useState([]);
  const [sessionsHistory, setSessionsHistory] = useState([]);
  const [view, setView] = useState('overview'); // 'overview' or 'history'
  const [loading, setLoading] = useState(true);
  const [isOpeningModal, setIsOpeningModal] = useState(false);
  const [isClosingModal, setIsClosingModal] = useState(false);
  const [selectedSessionDetails, setSelectedSessionDetails] = useState<any>(null);
  const [isMovementModal, setIsMovementModal] = useState(false);
  const [movementType, setMovementType] = useState('sangria');
  const [formData, setFormData] = useState({ amount: '', description: '', payment_method: 'cash' });
  const [closingAmount, setClosingAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (isOpeningModal || isClosingModal || isMovementModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpeningModal, isClosingModal, isMovementModal]);

  const formatCurrencyInput = (value: string) => {
    if (!value) return '';
    const digits = value.replace(/\D/g, '');
    const number = parseInt(digits) / 100;
    if (isNaN(number)) return '';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(number);
  };

  const parseCurrencyInput = (formattedValue: string) => {
    if (!formattedValue) return 0;
    const digits = formattedValue.replace(/\D/g, '');
    return parseInt(digits) / 100 || 0;
  };
  
  const [showFinanceDetails, setShowFinanceDetails] = useState(false);
  
  const [dateRange, setDateRange] = useState({
    start: format(new Date(), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });

  useEffect(() => {
    const testConnection = async () => {
      try {
        const { error: sbError } = await supabase
          .from('cashier_sessions')
          .select('id')
          .eq('user_id', user.id)
          .limit(1);
        if (sbError) {
          console.error("Erro de conexão/tabela Supabase:", sbError);
          setError(`Erro de conexão com o banco: ${sbError.message} (Tabela cashier_sessions pode estar faltando)`);
        } else {
          console.log("Conexão com Supabase OK");
        }
      } catch (err: any) {
        console.error("Erro fatal de conexão:", err);
        setError(`Erro fatal de conexão: ${err.message}`);
      }
    };
    testConnection();
    fetchData();
    checkActiveSession();
    fetchSessionsHistory();

    const salesChannel = supabase
      .channel('cashier_sales')
      .on('postgres_changes', { event: '*', table: 'sales' }, () => fetchData())
      .subscribe();

    const ordersChannel = supabase
      .channel('cashier_orders')
      .on('postgres_changes', { event: '*', table: 'service_orders' }, () => fetchData())
      .subscribe();

    const sessionChannel = supabase
      .channel('cashier_sessions')
      .on('postgres_changes', { event: '*', table: 'cashier_sessions' }, () => {
        checkActiveSession();
        fetchSessionsHistory();
      })
      .subscribe();

    const movementChannel = supabase
      .channel('cashier_movements')
      .on('postgres_changes', { event: '*', table: 'cashier_movements' }, () => {
        if (activeSession) fetchMovements(activeSession.id);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(salesChannel);
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(sessionChannel);
      supabase.removeChannel(movementChannel);
    };
  }, []);

  useEffect(() => {
    if (activeSession) {
      fetchMovements(activeSession.id);
    } else {
      setMovements([]);
    }
  }, [activeSession]);

  const checkActiveSession = async () => {
    try {
      const { data, error: sbError } = await supabase
        .from('cashier_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .single();

      if (sbError && sbError.code !== 'PGRST116') {
        setError(`Erro ao verificar sessão: ${sbError.message} (${sbError.code})`);
        throw sbError;
      }
      setActiveSession(data || null);
    } catch (err) {
      console.error("Erro ao verificar sessão ativa:", err);
    }
  };

  const fetchSessionsHistory = async () => {
    try {
      const { data } = await supabase
        .from('cashier_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(20);
      setSessionsHistory(data || []);
    } catch (error) {
      console.error("Erro ao buscar histórico de sessões:", error);
    }
  };

  const fetchMovements = async (sessionId) => {
    try {
      const { data } = await supabase
        .from('cashier_movements')
        .select('*')
        .eq('session_id', sessionId);
      setMovements(data || []);
    } catch (error) {
      console.error("Erro ao buscar movimentações:", error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Filtrar no banco de dados pelo período selecionado
      const start = dateRange.start + 'T00:00:00';
      const end = dateRange.end + 'T23:59:59';

      const [salesRes, ordersRes, movementsRes] = await Promise.all([
        supabase.from('sales').select('*').eq('user_id', user.id).gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false }),
        supabase.from('service_orders').select('*').eq('user_id', user.id).eq('status', 'delivered').gte('updated_at', start).lte('updated_at', end).order('updated_at', { ascending: false }),
        supabase.from('cashier_movements').select('*').eq('user_id', user.id).gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false })
      ]);

      if (salesRes.error) throw salesRes.error;
      if (ordersRes.error) throw ordersRes.error;
      if (movementsRes.error) throw movementsRes.error;

      const mappedSales = (salesRes.data || []).map((s: any) => ({
        ...s,
        total: s.total,
        paymentMethod: s.payment_method,
        createdAt: s.created_at
      }));

      const mappedOrders = (ordersRes.data || []).map((o: any) => ({
        ...o,
        totalValue: o.total_value,
        createdAt: o.created_at,
        updatedAt: o.updated_at
      }));

      setSales(mappedSales);
      setServiceOrders(mappedOrders);
      
      if (!activeSession) {
        setMovements(movementsRes.data || []);
      }
    } catch (err: any) {
      console.error("Erro ao buscar dados do caixa:", err);
      setError(`Erro inesperado: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCashier = async () => {
    if (isSubmitting || submittingRef.current) return;
    setIsSubmitting(true);
    submittingRef.current = true;
    console.log("handleOpenCashier chamado", formData);
    try {
      const amount = parseCurrencyInput(formData.amount);
      console.log("Valor processado:", amount);
      
      const { data, error: sbError } = await supabase
        .from('cashier_sessions')
        .insert([{
          user_id: user.id,
          initial_amount: amount,
          expected_amount: amount,
          status: 'open'
        }])
        .select();

      if (sbError) {
        console.error("Erro Supabase ao abrir caixa:", sbError);
        alert("Erro do banco (Abertura): " + sbError.message + " (" + sbError.code + ")");
        setError(`Erro ao abrir caixa: ${sbError.message}`);
        setIsSubmitting(false);
        submittingRef.current = false;
        return;
      }

      if (data && data.length > 0) {
        console.log("Sessão criada com sucesso:", data[0]);
        setActiveSession(data[0]);
        setIsOpeningModal(false);
        setFormData({ amount: '', description: '' });
        alert("Caixa aberto com sucesso!");
      } else {
        console.log("Nenhum dado retornado, verificando sessão ativa...");
        await checkActiveSession();
        setIsOpeningModal(false);
        alert("Caixa aberto (verificado via checkActiveSession)");
      }
    } catch (error: any) {
      console.error("Erro fatal no handleOpenCashier:", error);
      alert("Erro crítico: " + error.message);
    } finally {
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  };

  const handleCloseCashier = async () => {
    if (isSubmitting || submittingRef.current) return;
    setIsSubmitting(true);
    submittingRef.current = true;
    try {
      const actual = parseCurrencyInput(closingAmount);
      const { total: totalSales } = calculateSessionSales();
      const { suprimento: totalSuprimentos, sangria: totalSangrias } = sessionTotals;
      const expected = calculateExpectedBalance();
      const diff = actual - expected;

      const { error } = await supabase
        .from('cashier_sessions')
        .update({
          closed_at: new Date().toISOString(),
          actual_amount: actual,
          expected_amount: expected,
          difference: diff,
          total_sales: totalSales,
          total_suprimentos: totalSuprimentos,
          total_sangrias: totalSangrias,
          status: 'closed'
        })
        .eq('id', activeSession.id);

      if (error) {
        alert("Erro Supabase ao fechar: " + error.message);
        setIsSubmitting(false);
        submittingRef.current = false;
        throw error;
      }
      
      setActiveSession(null);
      setIsClosingModal(false);
      setClosingAmount('');
      fetchSessionsHistory();
      alert("Caixa fechado com sucesso!");
    } catch (error: any) {
      console.error("Erro ao fechar caixa:", error);
      alert("Erro ao fechar caixa: " + error.message);
    } finally {
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  };

  const handleAddMovement = async () => {
    if (isSubmitting || submittingRef.current) return;
    setIsSubmitting(true);
    submittingRef.current = true;
    try {
      const amount = parseCurrencyInput(formData.amount);
      const { error: sbError } = await supabase
        .from('cashier_movements')
        .insert([{
          user_id: user.id,
          session_id: activeSession.id,
          type: movementType,
          amount: amount,
          description: formData.description,
          payment_method: formData.payment_method
        }]);

      if (sbError) {
        alert("Erro Supabase ao registrar movimentação: " + sbError.message);
        setIsSubmitting(false);
        submittingRef.current = false;
        throw sbError;
      }
      
      // Update expected amount in session
      const newExpected = activeSession.expected_amount + (movementType === 'suprimento' ? amount : -amount);
      const { error: updateError } = await supabase
        .from('cashier_sessions')
        .update({ expected_amount: newExpected })
        .eq('id', activeSession.id);

      if (updateError) {
        alert("Erro Supabase ao atualizar saldo: " + updateError.message);
        setIsSubmitting(false);
        submittingRef.current = false;
        throw updateError;
      }

      setIsMovementModal(false);
      setFormData({ amount: '', description: '', payment_method: 'cash' });
      checkActiveSession(); // Refresh active session data
      alert("Movimentação registrada com sucesso!");
    } catch (error: any) {
      console.error("Erro ao registrar movimentação:", error);
      alert("Erro ao registrar movimentação: " + error.message);
    } finally {
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  };

  const calculateSessionSales = () => {
    if (!activeSession) return { total: 0, cash: 0, pix: 0, card: 0 };
    const sessionStart = new Date(activeSession.opened_at);
    
    const sessionSales = sales.filter(s => new Date(s.createdAt) >= sessionStart);
    const sessionOrders = serviceOrders.filter(o => new Date(o.updatedAt || o.createdAt) >= sessionStart);
    
    const allSessionTransactions = [
      ...sessionSales.map(s => ({ ...s, total: s.total || 0, payment_method: s.paymentMethod || 'cash' })),
      ...sessionOrders.map(o => ({ ...o, total: o.totalValue || 0, payment_method: o.payment_method || 'cash' }))
    ];

    const total = allSessionTransactions.reduce((acc, t) => acc + t.total, 0);
    const cash = allSessionTransactions.filter(t => t.payment_method === 'cash').reduce((acc, t) => acc + t.total, 0);
    const pix = allSessionTransactions.filter(t => t.payment_method === 'pix').reduce((acc, t) => acc + t.total, 0);
    const card = allSessionTransactions.filter(t => t.payment_method === 'credit_card' || t.payment_method === 'debit_card').reduce((acc, t) => acc + t.total, 0);
    
    return { total, cash, pix, card };
  };

  const calculateExpectedBalance = () => {
    if (!activeSession) return 0;
    const { cash: cashSales } = calculateSessionSales();
    const movementsTotal = movements
      .filter(m => m.payment_method === 'cash' || !m.payment_method) // Include legacy movements as cash
      .reduce((acc, curr) => {
        return acc + (curr.type === 'suprimento' ? curr.amount : -curr.amount);
      }, 0);
    
    return activeSession.initial_amount + cashSales + movementsTotal;
  };

  const sessionTotals = movements.reduce((acc, curr) => {
    if (curr.type === 'suprimento') acc.suprimento += curr.amount;
    else acc.sangria += curr.amount;
    return acc;
  }, { suprimento: 0, sangria: 0 });

  // Filter data by date
  const filteredSales = sales.filter(sale => {
    const date = parseISO(sale.createdAt);
    return isWithinInterval(date, {
      start: parseISO(dateRange.start),
      end: parseISO(dateRange.end + 'T23:59:59')
    });
  });

  const filteredOrders = serviceOrders.filter(order => {
    const date = parseISO(order.updatedAt || order.createdAt);
    return isWithinInterval(date, {
      start: parseISO(dateRange.start),
      end: parseISO(dateRange.end + 'T23:59:59')
    });
  });

  // Combine and sort transactions
  const allTransactions = [
    ...filteredSales.map(s => ({ ...s, type: 'sale', label: 'Venda PDV' })),
    ...filteredOrders.map(o => ({ ...o, type: 'order', label: 'Ordem de Serviço', total: o.totalValue, payment_method: o.payment_method || 'cash' }))
  ].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  const totalRevenue = allTransactions.reduce((acc, curr) => acc + (curr.total || 0), 0);
  const totalSalesOnly = filteredSales.reduce((acc, curr) => acc + (curr.total || 0), 0);
  const totalOrdersOnly = filteredOrders.reduce((acc, curr) => acc + (curr.totalValue || 0), 0);
  
  const filteredMovements = movements.filter(m => {
    const date = parseISO(m.created_at);
    return isWithinInterval(date, {
      start: parseISO(dateRange.start),
      end: parseISO(dateRange.end + 'T23:59:59')
    });
  });

  const periodMovements = filteredMovements.reduce((acc, curr) => {
    if (curr.type === 'suprimento') acc.suprimento += curr.amount;
    else acc.sangria += curr.amount;
    return acc;
  }, { suprimento: 0, sangria: 0 });

  const totalsByMethod = allTransactions.reduce((acc, curr) => {
    const method = curr.payment_method || 'cash';
    acc[method] = (acc[method] || 0) + (curr.total || curr.total_value || 0);
    return acc;
  }, {});

  // Prepare chart data
  const chartData = [];
  const days = [];
  let current = parseISO(dateRange.start);
  const end = parseISO(dateRange.end);
  
  while (current <= end) {
    const dateStr = format(current, 'yyyy-MM-dd');
    const dayTotal = allTransactions
      .filter(t => format(parseISO(t.updatedAt || t.createdAt), 'yyyy-MM-dd') === dateStr)
      .reduce((acc, curr) => acc + (curr.total || 0), 0);
    
    chartData.push({
      date: format(current, 'dd/MM', { locale: ptBR }),
      total: dayTotal
    });
    
    current = new Date(current.setDate(current.getDate() + 1));
  }

  const COLORS = ['#ea580c', '#f97316', '#fb923c', '#fdba74'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Caixa e Financeiro</h1>
          <p className="text-gray-500">Gerencie sessões de caixa e acompanhe o fluxo financeiro.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-orange-50 p-1 rounded-xl mr-2">
            <button 
              onClick={() => setView('overview')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${view === 'overview' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-orange-600'}`}
            >
              Visão Geral
            </button>
            <button 
              onClick={() => setView('history')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${view === 'history' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-orange-600'}`}
            >
              Histórico
            </button>
          </div>

          <button 
            onClick={() => setShowFinanceDetails(!showFinanceDetails)}
            className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${showFinanceDetails ? 'bg-orange-100 text-orange-700' : 'bg-white text-gray-600 border border-orange-100 shadow-sm hover:bg-orange-50'}`}
          >
            <Filter className="w-4 h-4" />
            {showFinanceDetails ? 'Ocultar Filtros' : 'Filtros e Resumo'}
          </button>

          <div className="hidden sm:flex items-center gap-4 px-4 py-2 bg-white rounded-xl border border-orange-100 shadow-sm">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-gray-400 uppercase">Receita Total</span>
              <span className="text-sm font-black text-orange-600">{formatCurrency(totalRevenue)}</span>
            </div>
          </div>

          {activeSession ? (
            <>
              <button 
                onClick={() => { setMovementType('suprimento'); setIsMovementModal(true); }}
                className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-emerald-100 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Suprimento
              </button>
              <button 
                onClick={() => { setMovementType('sangria'); setIsMovementModal(true); }}
                className="bg-red-50 text-red-600 px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-red-100 transition-colors"
              >
                <Minus className="w-4 h-4" />
                Sangria
              </button>
              <button 
                onClick={() => setIsClosingModal(true)}
                className="bg-orange-600 text-white px-6 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-orange-700 shadow-lg shadow-orange-200 transition-all"
              >
                <Lock className="w-4 h-4" />
                Fechar Caixa
              </button>
            </>
          ) : (
            <button 
              onClick={() => setIsOpeningModal(true)}
              className="bg-orange-600 text-white px-6 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-orange-700 shadow-lg shadow-orange-200 transition-all"
            >
              <Unlock className="w-4 h-4" />
              Abrir Caixa
            </button>
          )}
          
      </div>
    </header>

    {showFinanceDetails && (
      <div className="bg-white p-4 rounded-3xl border border-orange-100 shadow-sm animate-in fade-in slide-in-from-top-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-orange-600" />
            <span className="text-sm font-bold text-gray-700">Período Selecionado:</span>
          </div>
          <div className="flex items-center gap-2 bg-orange-50 p-1 rounded-2xl border border-orange-100">
            <div className="flex items-center gap-2 px-3">
              <input 
                type="date" 
                className="text-sm font-bold outline-none border-none bg-transparent text-orange-900"
                value={dateRange.start}
                onChange={e => setDateRange({...dateRange, start: e.target.value})}
              />
            </div>
            <span className="text-orange-200">|</span>
            <div className="flex items-center gap-2 px-3">
              <input 
                type="date" 
                className="text-sm font-bold outline-none border-none bg-transparent text-orange-900"
                value={dateRange.end}
                onChange={e => setDateRange({...dateRange, end: e.target.value})}
              />
            </div>
            <button 
              onClick={() => fetchData()}
              className="bg-orange-600 text-white p-2 rounded-xl hover:bg-orange-700 transition-colors"
              title="Atualizar dados"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    )}

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-4">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-bold text-red-800">Erro de Banco de Dados</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
            <button 
              onClick={() => fetchData()} 
              className="mt-2 text-xs font-bold text-red-600 hover:underline flex items-center gap-1"
            >
              Tentar novamente
            </button>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {view === 'overview' ? (
        <>
          {/* Active Session Status */}
          {activeSession && (
            <div className="bg-orange-50/40 border border-orange-100 p-6 rounded-3xl shadow-sm flex flex-col lg:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="bg-orange-100 p-4 rounded-2xl text-orange-600">
                  <Unlock className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-orange-900">Caixa Aberto</h2>
                  <p className="text-orange-600 text-sm font-medium">Iniciado em {format(parseISO(activeSession.opened_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 w-full lg:w-auto">
                {showFinanceDetails ? (
                  <>
                    <div className="text-center bg-white p-3 rounded-2xl border border-orange-100">
                      <p className="text-orange-500 text-[10px] font-bold uppercase tracking-wider mb-1">Saldo Inicial</p>
                      <p className="text-lg font-black text-orange-900">{formatCurrency(activeSession.initial_amount)}</p>
                    </div>
                    <div className="text-center bg-white p-3 rounded-2xl border border-orange-100">
                      <p className="text-orange-500 text-[10px] font-bold uppercase tracking-wider mb-1">Vendas (Cash)</p>
                      <p className="text-lg font-black text-orange-900">{formatCurrency(calculateSessionSales().cash)}</p>
                    </div>
                    <div className="text-center bg-white p-3 rounded-2xl border border-orange-100">
                      <p className="text-orange-500 text-[10px] font-bold uppercase tracking-wider mb-1">Vendas (PIX)</p>
                      <p className="text-lg font-black text-orange-900">{formatCurrency(calculateSessionSales().pix)}</p>
                    </div>
                    <div className="text-center bg-white p-3 rounded-2xl border border-orange-100">
                      <p className="text-orange-500 text-[10px] font-bold uppercase tracking-wider mb-1">Suprimentos (+)</p>
                      <p className="text-lg font-black text-emerald-600">{formatCurrency(sessionTotals.suprimento)}</p>
                    </div>
                    <div className="text-center bg-white p-3 rounded-2xl border border-orange-100">
                      <p className="text-orange-500 text-[10px] font-bold uppercase tracking-wider mb-1">Sangrias (-)</p>
                      <p className="text-lg font-black text-red-600">{formatCurrency(sessionTotals.sangria)}</p>
                    </div>
                    <div className="text-center bg-orange-100 p-3 rounded-2xl border border-orange-200 col-span-2 md:col-span-1">
                      <p className="text-orange-600 text-[10px] font-bold uppercase tracking-wider mb-1">Dinheiro em Caixa</p>
                      <p className="text-xl font-black text-orange-900">{formatCurrency(calculateExpectedBalance())}</p>
                    </div>
                  </>
                ) : (
                  <button 
                    onClick={() => setShowFinanceDetails(true)}
                    className="col-span-full py-4 px-8 bg-white rounded-2xl border border-orange-100 text-orange-600 font-bold hover:bg-orange-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
                  >
                    <TrendingUp className="w-5 h-5" />
                    Ver Totais da Sessão Atual
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Summary Cards */}
          {showFinanceDetails && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4 animate-in fade-in zoom-in-95 duration-300">
              <div className="bg-orange-600 p-6 rounded-3xl border border-orange-500 shadow-lg shadow-orange-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-white/20 p-3 rounded-2xl">
                    <DollarSign className="w-6 h-6 text-white" />
                  </div>
                </div>
                <p className="text-orange-100 text-[10px] font-bold uppercase tracking-wider">Receita Total</p>
                <h3 className="text-xl font-black text-white">{formatCurrency(totalRevenue)}</h3>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-orange-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-orange-100 p-3 rounded-2xl">
                    <TrendingUp className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Vendas PDV</p>
                <h3 className="text-xl font-black text-gray-900">{formatCurrency(totalSalesOnly)}</h3>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-orange-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-blue-100 p-3 rounded-2xl">
                    <History className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Ordens de Serviço</p>
                <h3 className="text-xl font-black text-gray-900">{formatCurrency(totalOrdersOnly)}</h3>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-orange-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-emerald-100 p-3 rounded-2xl">
                    <Plus className="w-6 h-6 text-emerald-600" />
                  </div>
                </div>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Suprimentos</p>
                <h3 className="text-xl font-black text-emerald-600">{formatCurrency(periodMovements.suprimento)}</h3>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-orange-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-red-100 p-3 rounded-2xl">
                    <Minus className="w-6 h-6 text-red-600" />
                  </div>
                </div>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Sangrias</p>
                <h3 className="text-xl font-black text-red-600">{formatCurrency(periodMovements.sangria)}</h3>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-orange-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-blue-100 p-3 rounded-2xl">
                    <Banknote className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Dinheiro</p>
                <h3 className="text-xl font-black text-gray-900">{formatCurrency(totalsByMethod['cash'] || 0)}</h3>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-orange-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-purple-100 p-3 rounded-2xl">
                    <CreditCard className="w-6 h-6 text-purple-600" />
                  </div>
                </div>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Cartão</p>
                <h3 className="text-xl font-black text-gray-900">
                  {formatCurrency((totalsByMethod['credit_card'] || 0) + (totalsByMethod['debit_card'] || 0))}
                </h3>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-orange-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-emerald-100 p-3 rounded-2xl">
                    <QrCode className="w-6 h-6 text-emerald-600" />
                  </div>
                </div>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">PIX</p>
                <h3 className="text-xl font-black text-gray-900">{formatCurrency(totalsByMethod['pix'] || 0)}</h3>
              </div>
            </div>
          )}

          {showFinanceDetails && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in zoom-in-95 duration-500">
              {/* Main Chart */}
              <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-orange-100 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-gray-900">Desempenho de Vendas</h3>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                      <span className="text-gray-500">Receita Diária</span>
                    </div>
                  </div>
                </div>
                
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ea580c" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#ea580c" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="date" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: '#94a3b8', fontSize: 12}}
                        dy={10}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: '#94a3b8', fontSize: 12}}
                        tickFormatter={(value) => `R$${value}`}
                      />
                      <Tooltip 
                        contentStyle={{backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #fed7aa', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                        formatter={(value) => [formatCurrency(value), 'Total']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="total" 
                        stroke="#ea580c" 
                        strokeWidth={3}
                        fillOpacity={1} 
                        fill="url(#colorTotal)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Payment Methods Chart */}
              <div className="bg-white p-6 rounded-3xl border border-orange-100 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-6">Métodos de Pagamento</h3>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { name: 'Dinheiro', value: totalsByMethod['cash'] || 0 },
                      { name: 'Crédito', value: totalsByMethod['credit_card'] || 0 },
                      { name: 'Débito', value: totalsByMethod['debit_card'] || 0 },
                      { name: 'PIX', value: totalsByMethod['pix'] || 0 },
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: '#94a3b8', fontSize: 11}}
                      />
                      <YAxis hide />
                      <Tooltip 
                        cursor={{fill: '#fff7ed'}}
                        contentStyle={{backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #fed7aa'}}
                        formatter={(value) => [formatCurrency(value), 'Total']}
                      />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                        {[0, 1, 2, 3].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Recent Transactions List */}
          <div className="bg-white rounded-3xl border border-orange-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-orange-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Transações Recentes</h3>
              <button className="text-orange-600 text-sm font-bold hover:underline">Ver Tudo</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-orange-50/50 text-gray-500 text-xs font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Data/Hora</th>
                    <th className="px-6 py-4">Tipo</th>
                    <th className="px-6 py-4">Pagamento</th>
                    <th className="px-6 py-4 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-orange-50">
                  {/* Manual Movements */}
                  {filteredMovements.map((movement, index) => (
                    <tr key={`mov-${index}`} className="hover:bg-orange-50/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-gray-900">
                            {format(parseISO(movement.created_at), 'dd/MM/yyyy')}
                          </span>
                          <span className="text-xs text-gray-400">
                            {format(parseISO(movement.created_at), 'HH:mm')}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${movement.type === 'suprimento' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                          <span className="text-sm font-medium text-gray-700">
                            {movement.type === 'suprimento' ? 'Suprimento' : 'Sangria'}
                            {movement.description && <span className="text-xs text-gray-400 ml-2">- {movement.description}</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-bold px-2 py-1 bg-gray-100 text-gray-600 rounded-lg uppercase">
                          {movement.payment_method === 'cash' ? 'Dinheiro' : 
                           movement.payment_method === 'pix' ? 'PIX' : 
                           movement.payment_method === 'credit_card' ? 'Crédito' : 
                           movement.payment_method === 'debit_card' ? 'Débito' : 'Dinheiro'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`text-sm font-black ${movement.type === 'suprimento' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {movement.type === 'suprimento' ? '+' : '-'}{formatCurrency(movement.amount)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  
                  {/* Sales and Orders */}
                  {allTransactions.slice(0, 10).map((transaction, index) => (
                    <tr key={index} className="hover:bg-orange-50/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-gray-900">
                            {format(parseISO(transaction.updatedAt || transaction.createdAt || transaction.created_at), 'dd/MM/yyyy')}
                          </span>
                          <span className="text-xs text-gray-400">
                            {format(parseISO(transaction.updatedAt || transaction.createdAt || transaction.created_at), 'HH:mm')}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${transaction.type === 'sale' ? 'bg-orange-500' : 'bg-blue-500'}`}></div>
                          <span className="text-sm font-medium text-gray-700">{transaction.label}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-bold px-2 py-1 bg-gray-100 text-gray-600 rounded-lg uppercase">
                          {(transaction.paymentMethod || transaction.payment_method) === 'cash' ? 'Dinheiro' : 
                           (transaction.paymentMethod || transaction.payment_method) === 'pix' ? 'PIX' : 
                           (transaction.paymentMethod || transaction.payment_method) === 'credit_card' ? 'Crédito' : 'Débito'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-black text-gray-900">
                          {formatCurrency(transaction.total || transaction.totalValue || transaction.total_value)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {allTransactions.length === 0 && movements.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                        Nenhuma transação encontrada no período selecionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-3xl border border-orange-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-orange-50">
            <h3 className="font-bold text-gray-900">Histórico de Fechamentos</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-orange-50/50 text-gray-500 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Abertura</th>
                  <th className="px-6 py-4">Fechamento</th>
                  <th className="px-6 py-4 text-right">Inicial</th>
                  <th className="px-6 py-4 text-right">Bruto</th>
                  <th className="px-6 py-4 text-right">Líquido</th>
                  <th className="px-6 py-4 text-right">Esperado</th>
                  <th className="px-6 py-4 text-right">Informado</th>
                  <th className="px-6 py-4 text-right">Diferença</th>
                  <th className="px-6 py-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-orange-50">
                {sessionsHistory.map((session) => (
                  <tr key={session.id} className="hover:bg-orange-50/30 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {format(parseISO(session.opened_at), "dd/MM/yyyy HH:mm")}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {session.closed_at ? format(parseISO(session.closed_at), "dd/MM/yyyy HH:mm") : '-'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-gray-900">
                      {formatCurrency(session.initial_amount)}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-orange-600">
                      {formatCurrency(session.total_sales || 0)}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-emerald-600">
                      {formatCurrency((session.total_sales || 0) + (session.total_suprimentos || 0) - (session.total_sangrias || 0))}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-gray-900">
                      {formatCurrency(session.expected_amount)}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-gray-900">
                      {formatCurrency(session.actual_amount)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`text-sm font-black ${session.difference >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {session.difference > 0 ? '+' : ''}{formatCurrency(session.difference)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button 
                        onClick={() => setSelectedSessionDetails(session)}
                        className="p-2 text-orange-600 hover:bg-orange-100 rounded-xl transition-colors"
                        title="Ver Detalhes"
                      >
                        <Search className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {sessionsHistory.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                      Nenhum histórico de fechamento encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {isOpeningModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-orange-50 flex items-center justify-between bg-orange-50 shrink-0">
              <h3 className="text-xl font-black text-orange-900">Abrir Caixa</h3>
              <button onClick={() => setIsOpeningModal(false)} className="p-2 hover:bg-orange-100 rounded-xl transition-colors">
                <X className="w-6 h-6 text-orange-600" />
              </button>
            </div>
            <form onSubmit={async (e) => { 
              e.preventDefault(); 
              try {
                console.log("Submetendo formulário de abertura...");
                await handleOpenCashier(); 
              } catch (err: any) {
                console.error("Erro no onSubmit:", err);
                alert("Erro ao submeter: " + err.message);
              }
            }} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Saldo Inicial (Troco)</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input 
                    type="text" 
                    className="w-full pl-10 pr-4 py-3 bg-orange-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none font-bold text-lg"
                    placeholder="R$ 0,00"
                    value={formData.amount}
                    onChange={e => setFormData({...formData, amount: formatCurrencyInput(e.target.value)})}
                    required
                  />
                </div>
              </div>
              <button 
                type="submit"
                disabled={isSubmitting}
                className={`w-full bg-orange-600 text-white py-4 rounded-2xl font-black text-lg shadow-lg shadow-orange-200 hover:bg-orange-700 transition-all ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isSubmitting ? 'Processando...' : 'Confirmar Abertura'}
              </button>
            </form>
          </div>
        </div>
      )}

      {isClosingModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-orange-50 flex items-center justify-between bg-orange-50 shrink-0">
              <h3 className="text-xl font-black text-orange-900">Fechar Caixa</h3>
              <button onClick={() => setIsClosingModal(false)} className="p-2 hover:bg-orange-100 rounded-xl transition-colors">
                <X className="w-6 h-6 text-orange-600" />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleCloseCashier(); }} className="p-6 space-y-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <p className="text-gray-500 text-xs font-bold uppercase mb-1">Dinheiro Esperado</p>
                  <p className="text-xl font-black text-gray-900">{formatCurrency(calculateExpectedBalance())}</p>
                </div>
                <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100">
                  <p className="text-orange-600 text-xs font-bold uppercase mb-1">Vendas Totais</p>
                  <p className="text-xl font-black text-orange-900">{formatCurrency(calculateSessionSales().total)}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Saldo em Dinheiro no Caixa</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input 
                    type="text" 
                    className="w-full pl-10 pr-4 py-3 bg-orange-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none font-bold text-lg"
                    placeholder="R$ 0,00"
                    value={closingAmount}
                    onChange={e => setClosingAmount(formatCurrencyInput(e.target.value))}
                    required
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2 italic">Conte o dinheiro físico na gaveta e informe o valor total.</p>
              </div>

              <div className="pt-4">
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full bg-orange-600 text-white py-4 rounded-2xl font-black text-lg shadow-lg shadow-orange-200 hover:bg-orange-700 transition-all ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isSubmitting ? 'Processando...' : 'Finalizar e Fechar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isMovementModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-orange-50 flex items-center justify-between bg-orange-50 shrink-0">
              <h3 className="text-xl font-black text-orange-900">
                {movementType === 'suprimento' ? 'Suprimento (Entrada)' : 'Sangria (Retirada)'}
              </h3>
              <button onClick={() => setIsMovementModal(false)} className="p-2 hover:bg-orange-100 rounded-xl transition-colors">
                <X className="w-6 h-6 text-orange-600" />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleAddMovement(); }} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Valor</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input 
                      type="text" 
                      className="w-full pl-10 pr-4 py-3 bg-orange-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none font-bold text-lg"
                      placeholder="R$ 0,00"
                      value={formData.amount}
                      onChange={e => setFormData({...formData, amount: formatCurrencyInput(e.target.value)})}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Método</label>
                  <select
                    className="w-full px-4 py-3 bg-orange-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none font-bold text-sm h-[52px]"
                    value={formData.payment_method}
                    onChange={e => setFormData({...formData, payment_method: e.target.value})}
                    required
                  >
                    <option value="cash">Dinheiro</option>
                    <option value="pix">PIX</option>
                    <option value="credit_card">Cartão de Crédito</option>
                    <option value="debit_card">Cartão de Débito</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Motivo / Descrição</label>
                <textarea 
                  className="w-full p-4 bg-orange-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none resize-none"
                  rows={3}
                  placeholder="Ex: Troco para o dia, Retirada para almoço..."
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  required
                ></textarea>
              </div>
              <button 
                type="submit"
                disabled={isSubmitting}
                className={`w-full py-4 rounded-2xl font-black text-lg shadow-lg transition-all ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''} ${
                  movementType === 'suprimento' 
                    ? 'bg-emerald-600 text-white shadow-emerald-100 hover:bg-emerald-700' 
                    : 'bg-red-600 text-white shadow-red-100 hover:bg-red-700'
                }`}
              >
                {isSubmitting ? 'Processando...' : `Confirmar ${movementType === 'suprimento' ? 'Entrada' : 'Retirada'}`}
              </button>
            </form>
          </div>
        </div>
      )}

      {selectedSessionDetails && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-orange-50 flex items-center justify-between bg-orange-50 shrink-0">
              <div>
                <h3 className="text-xl font-black text-orange-900">Detalhes do Caixa</h3>
                <p className="text-xs text-orange-600 font-bold">
                  Sessão de {format(parseISO(selectedSessionDetails.opened_at), "dd/MM/yyyy HH:mm")}
                </p>
              </div>
              <button onClick={() => setSelectedSessionDetails(null)} className="p-2 hover:bg-orange-100 rounded-xl transition-colors">
                <X className="w-6 h-6 text-orange-600" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100">
                  <p className="text-[10px] font-bold text-orange-500 uppercase mb-1">Saldo Inicial</p>
                  <p className="text-lg font-black text-orange-900">{formatCurrency(selectedSessionDetails.initial_amount)}</p>
                </div>
                <div className="bg-orange-600 p-4 rounded-2xl shadow-lg shadow-orange-100">
                  <p className="text-[10px] font-bold text-orange-100 uppercase mb-1">Total Bruto</p>
                  <p className="text-lg font-black text-white">{formatCurrency(selectedSessionDetails.total_sales || 0)}</p>
                </div>
                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                  <p className="text-[10px] font-bold text-emerald-500 uppercase mb-1">Suprimentos</p>
                  <p className="text-lg font-black text-emerald-600">+{formatCurrency(selectedSessionDetails.total_suprimentos || 0)}</p>
                </div>
                <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
                  <p className="text-[10px] font-bold text-red-500 uppercase mb-1">Sangrias</p>
                  <p className="text-lg font-black text-red-600">-{formatCurrency(selectedSessionDetails.total_sangrias || 0)}</p>
                </div>
              </div>

              <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100">
                <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-orange-600" />
                  Resumo de Fechamento
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-200">
                    <span className="text-sm text-gray-600 font-medium">Total Líquido (Vendas + Entradas - Saídas)</span>
                    <span className="text-sm font-black text-gray-900">
                      {formatCurrency((selectedSessionDetails.total_sales || 0) + (selectedSessionDetails.total_suprimentos || 0) - (selectedSessionDetails.total_sangrias || 0))}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-200">
                    <span className="text-sm text-gray-600 font-medium">Saldo Esperado em Caixa</span>
                    <span className="text-sm font-black text-gray-900">{formatCurrency(selectedSessionDetails.expected_amount)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-200">
                    <span className="text-sm text-gray-600 font-medium">Saldo Informado (Real)</span>
                    <span className="text-sm font-black text-gray-900">{formatCurrency(selectedSessionDetails.actual_amount)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-sm font-bold text-gray-900">Diferença de Caixa</span>
                    <span className={`text-lg font-black ${selectedSessionDetails.difference >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {selectedSessionDetails.difference > 0 ? '+' : ''}{formatCurrency(selectedSessionDetails.difference)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                <Calendar className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="text-[10px] font-bold text-blue-500 uppercase">Período da Sessão</p>
                  <p className="text-sm font-bold text-blue-900">
                    {format(parseISO(selectedSessionDetails.opened_at), "HH:mm")} às {selectedSessionDetails.closed_at ? format(parseISO(selectedSessionDetails.closed_at), "HH:mm") : 'Em aberto'}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 shrink-0">
              <button 
                onClick={() => setSelectedSessionDetails(null)}
                className="w-full py-3 bg-white border border-gray-200 text-gray-600 rounded-2xl font-bold hover:bg-gray-100 transition-colors"
              >
                Fechar Detalhes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
