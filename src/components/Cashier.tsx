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
  X,
  Edit,
  Trash2
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
import { formatCurrency, formatCurrencyInput, parseCurrencyInput } from '../utils/format';
import { format, startOfMonth, endOfMonth, subDays, isWithinInterval, parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfYear, endOfYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Cashier({ user }: { user: any }) {
  console.log("Renderizando componente Cashier para o usuário:", user?.id);
  const [error, setError] = useState<string | null>(null);
  const [sales, setSales] = useState([]);
  const [serviceOrders, setServiceOrders] = useState([]);
  const [activeSession, setActiveSession] = useState<any>(null);
  const activeSessionRef = useRef<any>(null);
  const [movements, setMovements] = useState([]);
  const [sessionsHistory, setSessionsHistory] = useState([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);
  const [historyDateRange, setHistoryDateRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });
  const [historyChartData, setHistoryChartData] = useState<any[]>([]);
  const [historyTopProducts, setHistoryTopProducts] = useState<any[]>([]);
  const [historyTotals, setHistoryTotals] = useState({ gross: 0, net: 0 });
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

  const [isEditSessionModalOpen, setIsEditSessionModalOpen] = useState(false);
  const [sessionToEdit, setSessionToEdit] = useState<any>(null);
  const [isDeleteSessionModalOpen, setIsDeleteSessionModalOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<any>(null);
  const [editSessionData, setEditSessionData] = useState({ initial_amount: '', actual_amount: '', notes: '' });

  useEffect(() => {
    if (isOpeningModal || isClosingModal || isMovementModal || isEditSessionModalOpen || isDeleteSessionModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpeningModal, isClosingModal, isMovementModal, isEditSessionModalOpen, isDeleteSessionModalOpen]);
  
  const [showFinanceDetails, setShowFinanceDetails] = useState(false);
  
  const [dateRange, setDateRange] = useState({
    start: format(new Date(), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });

  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchData();
    }
  }, [refreshTrigger]);

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
      .on('postgres_changes', { event: '*', table: 'sales' }, () => setRefreshTrigger(prev => prev + 1))
      .subscribe();

    const ordersChannel = supabase
      .channel('cashier_orders')
      .on('postgres_changes', { event: '*', table: 'service_orders' }, () => setRefreshTrigger(prev => prev + 1))
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
        if (activeSessionRef.current) fetchMovements(activeSessionRef.current.id);
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

  useEffect(() => {
    fetchSessionsHistory();
  }, [historyDateRange]);

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
      const start = historyDateRange.start + 'T00:00:00';
      const end = historyDateRange.end + 'T23:59:59';

      const [sessionsRes, salesRes, ordersRes, productsRes] = await Promise.all([
        supabase.from('cashier_sessions')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'closed')
          .gte('opened_at', start)
          .lte('opened_at', end)
          .order('closed_at', { ascending: false }),
        supabase.from('sales')
          .select('*')
          .eq('user_id', user.id)
          .gte('created_at', start)
          .lte('created_at', end),
        supabase.from('service_orders')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'delivered')
          .gte('updated_at', start)
          .lte('updated_at', end),
        supabase.from('products')
          .select('*')
          .eq('user_id', user.id)
      ]);

      const sessions = sessionsRes.data || [];
      const allSales = salesRes.data || [];
      const allOrders = ordersRes.data || [];
      const allProducts = productsRes.data || [];

      const productMap = new Map();
      allProducts.forEach(p => productMap.set(p.id, p));

      const parseCost = (val: any) => {
        if (val === undefined || val === null || val === '') return 0;
        const num = Number(String(val).replace(',', '.'));
        return isNaN(num) ? 0 : num;
      };

      // --- Chart Data Processing ---
      const dailySales: Record<string, number> = {};
      const productSales: Record<string, { name: string, total: number, quantity: number }> = {};

      allSales.forEach(sale => {
        const date = format(parseISO(sale.created_at), 'dd/MM');
        dailySales[date] = (dailySales[date] || 0) + (Number(sale.total) || 0);

        const items = Array.isArray(sale.items) ? sale.items.filter((i:any) => i.productId !== 'METADATA') : [];
        items.forEach((item: any) => {
          const pId = item.productId;
          if (pId) {
            if (!productSales[pId]) productSales[pId] = { name: item.name || productMap.get(pId)?.name || 'Produto', total: 0, quantity: 0 };
            productSales[pId].quantity += (Number(item.quantity) || 1);
            productSales[pId].total += (Number(item.price) || 0) * (Number(item.quantity) || 1);
          }
        });
      });

      allOrders.forEach(order => {
        const date = format(parseISO(order.updated_at), 'dd/MM');
        dailySales[date] = (dailySales[date] || 0) + (Number(order.total_value) || 0);

        const parts = order.parts_used as any[] || [];
        parts.forEach(part => {
          const pId = part.productId;
          if (pId) {
            if (!productSales[pId]) productSales[pId] = { name: part.name || productMap.get(pId)?.name || 'Peça', total: 0, quantity: 0 };
            productSales[pId].quantity += (Number(part.quantity) || 1);
            productSales[pId].total += (Number(part.price) || 0) * (Number(part.quantity) || 1);
          }
        });
      });

      const chartData = Object.entries(dailySales)
        .map(([date, total]) => ({ date, total }))
        .sort((a, b) => {
          // Sort by date assuming dd/MM format and same year for simplicity in this view
          const [dayA, monthA] = a.date.split('/');
          const [dayB, monthB] = b.date.split('/');
          return new Date(2000, Number(monthA)-1, Number(dayA)).getTime() - new Date(2000, Number(monthB)-1, Number(dayB)).getTime();
        });

      const topProducts = Object.values(productSales)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

      setHistoryChartData(chartData);
      setHistoryTopProducts(topProducts);

      if (sessions.length === 0) {
        setSessionsHistory([]);
        return;
      }

      const enrichedSessions = sessions.map((session) => {
        const sStart = new Date(session.opened_at).getTime();
        const sEnd = session.closed_at ? new Date(session.closed_at).getTime() : new Date().getTime();

        const sessionSales = allSales.filter(s => {
          const t = new Date(s.created_at).getTime();
          return t >= sStart && t <= sEnd;
        });
        const sessionOrders = allOrders.filter(o => {
          const t = new Date(o.updated_at).getTime();
          return t >= sStart && t <= sEnd;
        });

        let totalDiscounts = 0;
        let totalAdditions = 0;
        let totalCost = 0;

        sessionSales.forEach(sale => {
          const metadata = Array.isArray(sale.items) ? sale.items.find((i: any) => i.productId === 'METADATA') : null;
          totalDiscounts += metadata ? (metadata.discount || 0) : (sale.discount || 0);
          totalAdditions += metadata ? (metadata.addition || 0) : (sale.addition || 0);

          const items = Array.isArray(sale.items) ? sale.items.filter((i: any) => i.productId !== 'METADATA') : sale.items;
          items?.forEach((item: any) => {
            const quantity = Number(item.quantity) || 1;
            const productId = item.productId;
            const product = productMap.get(productId);
            
            if (item.cost !== undefined) {
              totalCost += parseCost(item.cost) * quantity;
            } else if (productId) {
              totalCost += parseCost(product?.cost) * quantity;
            }
          });
        });

        sessionOrders.forEach(order => {
          const parts = order.parts_used as any[];
          parts?.forEach(part => {
            const quantity = Number(part.quantity) || 1;
            const productId = part.productId;
            const product = productMap.get(productId);

            if (part.cost !== undefined) {
              totalCost += parseCost(part.cost) * quantity;
            } else if (productId) {
              totalCost += parseCost(product?.cost) * quantity;
            }
          });
        });

        return {
          ...session,
          calculated_discounts: totalDiscounts,
          calculated_additions: totalAdditions,
          calculated_cost: totalCost
        };
      });

      const totalGross = enrichedSessions.reduce((acc, s) => acc + (s.total_sales || 0) + (s.calculated_discounts || 0) - (s.calculated_additions || 0), 0);
      const totalNet = enrichedSessions.reduce((acc, s) => acc + (s.total_sales || 0) - (s.calculated_cost || 0), 0);

      setHistoryTotals({ gross: totalGross, net: totalNet });
      setSessionsHistory(enrichedSessions);
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

      const mappedSales = (salesRes.data || []).map((s: any) => {
        const metadata = Array.isArray(s.items) ? s.items.find((i: any) => i.productId === 'METADATA') : null;
        return {
          ...s,
          total: s.total,
          paymentMethod: s.payment_method,
          createdAt: s.created_at,
          discount: metadata ? metadata.discount : (s.discount || 0),
          addition: metadata ? metadata.addition : (s.addition || 0),
          payments: metadata ? metadata.payments : (s.payments || []),
          items: Array.isArray(s.items) ? s.items.filter((i: any) => i.productId !== 'METADATA') : s.items
        };
      });

      const mappedOrders = (ordersRes.data || []).map((o: any) => ({
        ...o,
        totalValue: o.total_value,
        createdAt: o.created_at,
        updatedAt: o.updated_at
      }));

      setSales(mappedSales);
      setServiceOrders(mappedOrders);
      
      if (!activeSessionRef.current) {
        setMovements(movementsRes.data || []);
      }
    } catch (err: any) {
      console.error("Erro ao buscar dados do caixa:", err);
      setError(`Erro inesperado: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFilter = (type: 'today' | 'week' | 'month' | 'year') => {
    const now = new Date();
    let start, end;
    switch (type) {
      case 'today':
        start = startOfDay(now);
        end = endOfDay(now);
        break;
      case 'week':
        start = startOfWeek(now, { weekStartsOn: 0 });
        end = endOfWeek(now, { weekStartsOn: 0 });
        break;
      case 'month':
        start = startOfMonth(now);
        end = endOfMonth(now);
        break;
      case 'year':
        start = startOfYear(now);
        end = endOfYear(now);
        break;
    }
    setHistoryDateRange({
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd')
    });
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
      const { total: totalSales, discount: totalDiscounts, addition: totalAdditions } = calculateSessionSales();
      const { suprimento: totalSuprimentos, sangria: totalSangrias } = sessionTotals;
      const expected = calculateExpectedBalance();
      const diff = actual - expected;

      let updateData: any = {
        closed_at: new Date().toISOString(),
        actual_amount: actual,
        expected_amount: expected,
        difference: diff,
        total_sales: totalSales,
        total_suprimentos: totalSuprimentos,
        total_sangrias: totalSangrias,
        total_discounts: totalDiscounts,
        total_additions: totalAdditions,
        status: 'closed'
      };

      let { error } = await supabase
        .from('cashier_sessions')
        .update(updateData)
        .eq('id', activeSession.id);

      if (error && error.message.includes('Could not find the')) {
        // Fallback for users who haven't run the migration
        delete updateData.total_discounts;
        delete updateData.total_additions;
        const retryResult = await supabase
          .from('cashier_sessions')
          .update(updateData)
          .eq('id', activeSession.id);
        error = retryResult.error;
      }

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

  const handleEditSession = (session: any) => {
    setSessionToEdit(session);
    setEditSessionData({
      initial_amount: formatCurrencyInput((session.initial_amount * 100).toString()),
      actual_amount: formatCurrencyInput((session.actual_amount * 100).toString()),
      notes: session.notes || ''
    });
    setIsEditSessionModalOpen(true);
  };

  const handleDeleteSession = (session: any) => {
    setSessionToDelete(session);
    setIsDeleteSessionModalOpen(true);
  };

  const confirmEditSession = async () => {
    if (!sessionToEdit) return;
    setIsSubmitting(true);
    try {
      const initialAmount = parseCurrencyInput(editSessionData.initial_amount);
      const actualAmount = parseCurrencyInput(editSessionData.actual_amount);
      
      const expectedAmount = initialAmount + (sessionToEdit.total_sales || 0) + (sessionToEdit.total_suprimentos || 0) - (sessionToEdit.total_sangrias || 0);
      const difference = actualAmount - expectedAmount;

      const { error } = await supabase
        .from('cashier_sessions')
        .update({
          initial_amount: initialAmount,
          actual_amount: actualAmount,
          expected_amount: expectedAmount,
          difference: difference,
          notes: editSessionData.notes
        })
        .eq('id', sessionToEdit.id)
        .eq('user_id', user.id);

      if (error) throw error;
      
      setIsEditSessionModalOpen(false);
      setSessionToEdit(null);
      fetchSessionsHistory();
    } catch (err: any) {
      console.error("Erro ao editar sessão:", err);
      setError(`Erro ao editar sessão: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteSession = async () => {
    if (!sessionToDelete) return;
    setIsSubmitting(true);
    try {
      // Delete movements first
      await supabase
        .from('cashier_movements')
        .delete()
        .eq('session_id', sessionToDelete.id);

      // Then delete session
      const { error } = await supabase
        .from('cashier_sessions')
        .delete()
        .eq('id', sessionToDelete.id)
        .eq('user_id', user.id);

      if (error) throw error;
      
      setIsDeleteSessionModalOpen(false);
      setSessionToDelete(null);
      fetchSessionsHistory();
    } catch (err: any) {
      console.error("Erro ao excluir sessão:", err);
      setError(`Erro ao excluir sessão: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateSessionSales = () => {
    if (!activeSession) return { total: 0, cash: 0, pix: 0, card: 0, discount: 0, addition: 0 };
    const sessionStart = new Date(activeSession.opened_at);
    
    const sessionSales = sales.filter(s => new Date(s.createdAt) >= sessionStart);
    const sessionOrders = serviceOrders.filter(o => new Date(o.updatedAt || o.createdAt) >= sessionStart);
    
    const allSessionTransactions = [
      ...sessionSales.map(s => ({ ...s, total: s.total || 0, payment_method: s.paymentMethod || 'cash', discount: s.discount || 0, addition: s.addition || 0 })),
      ...sessionOrders.map(o => ({ ...o, total: o.totalValue || 0, payment_method: o.payment_method || 'cash', discount: 0, addition: 0 }))
    ];

    const total = allSessionTransactions.reduce((acc, t) => acc + t.total, 0);
    const cash = allSessionTransactions.filter(t => t.payment_method === 'cash').reduce((acc, t) => acc + t.total, 0);
    const pix = allSessionTransactions.filter(t => t.payment_method === 'pix').reduce((acc, t) => acc + t.total, 0);
    const card = allSessionTransactions.filter(t => t.payment_method === 'credit_card' || t.payment_method === 'debit_card').reduce((acc, t) => acc + t.total, 0);
    const discount = allSessionTransactions.reduce((acc, t) => acc + t.discount, 0);
    const addition = allSessionTransactions.reduce((acc, t) => acc + t.addition, 0);
    
    return { total, cash, pix, card, discount, addition };
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
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-orange-100 shadow-sm flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h3 className="font-bold text-gray-900">Filtros do Histórico</h3>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleQuickFilter('today')}
                  className="px-4 py-2 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded-xl text-sm font-medium transition-colors"
                >
                  Hoje
                </button>
                <button
                  onClick={() => handleQuickFilter('week')}
                  className="px-4 py-2 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded-xl text-sm font-medium transition-colors"
                >
                  Semana
                </button>
                <button
                  onClick={() => handleQuickFilter('month')}
                  className="px-4 py-2 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded-xl text-sm font-medium transition-colors"
                >
                  Mês
                </button>
                <button
                  onClick={() => handleQuickFilter('year')}
                  className="px-4 py-2 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded-xl text-sm font-medium transition-colors"
                >
                  Ano
                </button>
                <div className="h-6 w-px bg-gray-200 mx-2 hidden md:block"></div>
                <input 
                  type="date" 
                  className="px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm font-medium text-gray-700"
                  value={historyDateRange.start}
                  onChange={e => setHistoryDateRange({...historyDateRange, start: e.target.value})}
                />
                <span className="text-gray-400">até</span>
                <input 
                  type="date" 
                  className="px-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm font-medium text-gray-700"
                  value={historyDateRange.end}
                  onChange={e => setHistoryDateRange({...historyDateRange, end: e.target.value})}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-orange-600 mb-1">Faturamento Bruto (Período)</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(historyTotals.gross)}</p>
                </div>
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm">
                  <TrendingUp className="w-6 h-6 text-orange-500" />
                </div>
              </div>
              <div className="bg-green-50 p-4 rounded-2xl border border-green-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-600 mb-1">Lucro Líquido (Período)</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(historyTotals.net)}</p>
                </div>
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm">
                  <DollarSign className="w-6 h-6 text-green-500" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-orange-100 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-6">Dias de Maior Venda</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={historyChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(value) => `R$ ${value}`} />
                    <Tooltip 
                      cursor={{ fill: '#fff7ed' }}
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                      formatter={(value: number) => [formatCurrency(value), 'Total']}
                    />
                    <Bar dataKey="total" fill="#f97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-orange-100 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-6">Produtos Mais Vendidos</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={historyTopProducts} layout="vertical" margin={{ left: 50 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(value) => `R$ ${value}`} />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} width={100} />
                    <Tooltip 
                      cursor={{ fill: '#fff7ed' }}
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                      formatter={(value: number) => [formatCurrency(value), 'Total']}
                    />
                    <Bar dataKey="total" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

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
                  <th className="px-6 py-4 text-right">Faturamento Bruto</th>
                  <th className="px-6 py-4 text-right">Lucro Líquido</th>
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
                      {formatCurrency((session.total_sales || 0) + (session.calculated_discounts || 0) - (session.calculated_additions || 0))}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-emerald-600">
                      {formatCurrency((session.total_sales || 0) - (session.calculated_cost || 0))}
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
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => setSelectedSessionDetails(session)}
                          className="p-2 text-orange-600 hover:bg-orange-100 rounded-xl transition-colors"
                          title="Ver Detalhes"
                        >
                          <Search className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleEditSession(session)}
                          className="p-2 text-blue-600 hover:bg-blue-100 rounded-xl transition-colors"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteSession(session)}
                          className="p-2 text-red-600 hover:bg-red-100 rounded-xl transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
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
                  <p className="text-[10px] font-bold text-orange-100 uppercase mb-1">Faturamento Bruto</p>
                  <p className="text-lg font-black text-white">{formatCurrency((selectedSessionDetails.total_sales || 0) + (selectedSessionDetails.calculated_discounts || 0) - (selectedSessionDetails.calculated_additions || 0))}</p>
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
                    <span className="text-sm text-gray-600 font-medium">Faturamento Líquido (Vendas com Descontos/Acréscimos)</span>
                    <span className="text-sm font-black text-gray-900">
                      {formatCurrency(selectedSessionDetails.total_sales || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-200">
                    <span className="text-sm text-gray-600 font-medium">Custo das Vendas</span>
                    <span className="text-sm font-black text-red-600">
                      -{formatCurrency(selectedSessionDetails.calculated_cost || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-200">
                    <span className="text-sm text-gray-600 font-medium">Lucro Líquido</span>
                    <span className="text-sm font-black text-emerald-600">
                      {formatCurrency((selectedSessionDetails.total_sales || 0) - (selectedSessionDetails.calculated_cost || 0))}
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

      {/* Edit Session Modal */}
      {isEditSessionModalOpen && sessionToEdit && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center gap-3 text-blue-600">
                <Edit className="w-6 h-6" />
                <h2 className="text-xl font-black uppercase tracking-tight">Editar Fechamento</h2>
              </div>
              <button 
                onClick={() => setIsEditSessionModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                disabled={isSubmitting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Valor Inicial (Abertura)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <DollarSign className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={editSessionData.initial_amount}
                    onChange={e => setEditSessionData({...editSessionData, initial_amount: formatCurrencyInput(e.target.value)})}
                    className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent font-bold text-gray-900"
                    placeholder="R$ 0,00"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Valor Informado (Fechamento)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <DollarSign className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={editSessionData.actual_amount}
                    onChange={e => setEditSessionData({...editSessionData, actual_amount: formatCurrencyInput(e.target.value)})}
                    className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent font-bold text-gray-900"
                    placeholder="R$ 0,00"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Observações</label>
                <textarea
                  value={editSessionData.notes}
                  onChange={e => setEditSessionData({...editSessionData, notes: e.target.value})}
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium text-gray-900 resize-none h-24"
                  placeholder="Motivo da edição..."
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
              <button 
                onClick={() => setIsEditSessionModalOpen(false)}
                className="flex-1 py-3 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-100 transition-colors"
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button 
                onClick={confirmEditSession}
                disabled={isSubmitting || !editSessionData.initial_amount || !editSessionData.actual_amount}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  'Salvar Alterações'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Session Modal */}
      {isDeleteSessionModalOpen && sessionToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-red-100 flex justify-between items-center bg-red-50/50">
              <div className="flex items-center gap-3 text-red-600">
                <AlertTriangle className="w-6 h-6" />
                <h2 className="text-xl font-black uppercase tracking-tight">Excluir Fechamento</h2>
              </div>
              <button 
                onClick={() => setIsDeleteSessionModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                disabled={isSubmitting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-gray-600 font-medium">
                Tem certeza que deseja excluir o fechamento do dia <strong className="text-gray-900">{format(parseISO(sessionToDelete.opened_at), "dd/MM/yyyy")}</strong>?
              </p>
              <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                <p className="text-sm text-red-800 font-medium">
                  <strong>Atenção:</strong> Esta ação é irreversível. Todas as movimentações (suprimentos e sangrias) associadas a este fechamento também serão excluídas. As vendas e ordens de serviço não serão afetadas.
                </p>
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
              <button 
                onClick={() => setIsDeleteSessionModalOpen(false)}
                className="flex-1 py-3 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-100 transition-colors"
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button 
                onClick={confirmDeleteSession}
                disabled={isSubmitting}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <Trash2 className="w-5 h-5" />
                    Excluir Fechamento
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
