import React, { useState, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  AreaChart,
  Area
} from 'recharts';
import { 
  TrendingUp, 
  Package, 
  Wrench, 
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle
} from 'lucide-react';
import { supabase } from '../supabase';
import { formatCurrency } from '../utils/format';
import { subDays, format, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Dashboard({ user }: { user: any }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalSales: 0,
    totalOrders: 0,
    lowStock: 0,
    revenue: 0,
    expenses: 0,
    lowStockItems: [] as any[],
    chartData: [] as any[]
  });

  const data = [
    { name: 'Seg', vendas: 4000, os: 2400 },
    { name: 'Ter', vendas: 3000, os: 1398 },
    { name: 'Qua', vendas: 2000, os: 9800 },
    { name: 'Qui', vendas: 2780, os: 3908 },
    { name: 'Sex', vendas: 1890, os: 4800 },
    { name: 'Sáb', vendas: 2390, os: 3800 },
    { name: 'Dom', vendas: 3490, os: 4300 },
  ];

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const sevenDaysAgo = subDays(new Date(), 6);
        
        // Usando count: 'exact' e head: true para não baixar os dados, apenas contar
        const [salesRes, ordersRes, allProductsRes, lowStockRes, expensesRes, weeklySalesRes, weeklyOrdersRes] = await Promise.all([
          supabase.from('sales').select('total, items').eq('user_id', user.id),
          supabase.from('service_orders').select('total_value, parts_used, status').eq('user_id', user.id),
          supabase.from('products').select('id, cost').eq('user_id', user.id),
          supabase.from('products').select('*').eq('user_id', user.id).lte('stock', 5),
          supabase.from('expenses').select('amount').eq('user_id', user.id).eq('status', 'paid'),
          supabase.from('sales').select('total, created_at, items').eq('user_id', user.id).gte('created_at', sevenDaysAgo.toISOString()),
          supabase.from('service_orders').select('total_value, created_at, status').eq('user_id', user.id).gte('created_at', sevenDaysAgo.toISOString())
        ]);

        if (salesRes.error || ordersRes.error || allProductsRes.error || lowStockRes.error || expensesRes.error || weeklySalesRes.error || weeklyOrdersRes.error) {
          const firstError = salesRes.error || ordersRes.error || allProductsRes.error || lowStockRes.error || expensesRes.error || weeklySalesRes.error || weeklyOrdersRes.error;
          setError(`Erro ao buscar dados: ${firstError?.message || 'Erro desconhecido'}.`);
          return;
        }

        const productCosts = new Map();
        allProductsRes.data?.forEach(p => productCosts.set(p.id, Number(p.cost) || 0));

        let revenue = 0;
        let totalCost = 0;

        // Vendas
        salesRes.data?.forEach(s => {
          revenue += Number(s.total) || 0;
          const items = s.items as any[];
          items?.forEach(item => {
            const quantity = Number(item.quantity) || 1;
            if (item.cost !== undefined) {
              // Use o custo gravado na venda
              totalCost += Number(item.cost) * quantity;
            } else if (item.productId) {
              // Fallback para o custo atual do produto
              const cost = productCosts.get(item.productId) || 0;
              totalCost += cost * quantity;
            }
          });
        });

        // Ordens de Serviço (Apenas Entregues contam para faturamento)
        ordersRes.data?.forEach(o => {
          if (o.status === 'delivered') {
            revenue += Number(o.total_value) || 0;
            const parts = o.parts_used as any[];
            parts?.forEach(part => {
              const quantity = Number(part.quantity) || 1;
              if (part.cost !== undefined) {
                // Use o custo gravado na OS (mais preciso para o momento da venda)
                totalCost += Number(part.cost) * quantity;
              } else if (part.productId) {
                // Fallback para o custo atual do produto
                const cost = productCosts.get(part.productId) || 0;
                totalCost += cost * quantity;
              }
            });
          }
        });

        let expenses = 0;
        expensesRes.data?.forEach(e => expenses += Number(e.amount) || 0);

        // Process chart data
        const days = eachDayOfInterval({ start: sevenDaysAgo, end: new Date() });
        const chartData = days.map(day => {
          const dayStr = format(day, 'yyyy-MM-dd');
          const dayName = format(day, 'EEE', { locale: ptBR });
          
          const daySales = (weeklySalesRes.data || [])
            .filter(s => format(new Date(s.created_at), 'yyyy-MM-dd') === dayStr)
            .reduce((acc, s) => acc + Number(s.total), 0);
          
          const dayOrders = (weeklyOrdersRes.data || [])
            .filter(o => o.status === 'delivered' && format(new Date(o.created_at), 'yyyy-MM-dd') === dayStr)
            .reduce((acc, o) => acc + Number(o.total_value), 0);

          return { 
            name: dayName.charAt(0).toUpperCase() + dayName.slice(1), 
            vendas: daySales, 
            os: dayOrders 
          };
        });

        setStats({
          totalSales: salesRes.data?.length || 0,
          totalOrders: ordersRes.data?.length || 0,
          lowStock: lowStockRes.data?.length || 0,
          revenue,
          expenses: expenses + totalCost, // Lucro líquido vai descontar isso
          lowStockItems: lowStockRes.data || [],
          chartData
        });
      } catch (err: any) {
        console.error('Fatal error fetching dashboard data:', err);
        setError(`Erro fatal: ${err.message || 'Erro desconhecido'}`);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 p-6 rounded-2xl text-center space-y-4">
        <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Erro ao Carregar Dashboard</h2>
        <p className="text-gray-600">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-xl font-semibold transition-all"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  const cards = [
    { label: 'Faturamento Bruto', value: formatCurrency(stats.revenue), icon: DollarSign, color: 'bg-green-500', trend: '+12%' },
    { label: 'Despesas e Custos', value: formatCurrency(stats.expenses), icon: ArrowDownRight, color: 'bg-red-500', trend: '-5%' },
    { label: 'Lucro Líquido', value: formatCurrency(stats.revenue - stats.expenses), icon: TrendingUp, color: 'bg-blue-600', trend: '+15%' },
    { label: 'Produtos em Baixa', value: stats.lowStock, icon: Package, color: 'bg-orange-500', trend: '-2%' },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Visão Geral</h1>
        <p className="text-gray-500">Bem-vindo ao painel de controle da sua assistência.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-orange-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className={`${card.color} p-3 rounded-xl text-white`}>
                <card.icon className="w-6 h-6" />
              </div>
              <span className={`text-sm font-medium flex items-center gap-1 ${card.trend.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
                {card.trend}
                {card.trend.startsWith('+') ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              </span>
            </div>
            <p className="text-gray-500 text-sm font-medium">{card.label}</p>
            <h3 className="text-2xl font-bold text-gray-900 mt-1">{card.value}</h3>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Alerts */}
        {stats.lowStockItems.length > 0 && (
          <div className="lg:col-span-2 bg-red-50 border border-red-100 p-6 rounded-3xl space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-black uppercase tracking-tight">Alertas de Estoque Baixo</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.lowStockItems.map((item: any) => (
                <div key={item.id} className="bg-white p-4 rounded-2xl border border-red-100 flex justify-between items-center shadow-sm">
                  <div>
                    <p className="font-bold text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-500 uppercase font-bold">{item.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black text-red-600">{item.stock}</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Restantes</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-orange-100">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Desempenho Semanal</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.chartData}>
                <defs>
                  <linearGradient id="colorVendas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="vendas" stroke="#f97316" fillOpacity={1} fill="url(#colorVendas)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-orange-100">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Vendas vs OS</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="vendas" fill="#f97316" radius={[4, 4, 0, 0]} />
                <Bar dataKey="os" fill="#fdba74" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
