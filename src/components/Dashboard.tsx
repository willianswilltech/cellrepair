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
  Area,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { 
  TrendingUp, 
  Package, 
  Wrench, 
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Calendar,
  Filter,
  History,
  ShoppingCart,
  PieChart as PieChartIcon
} from 'lucide-react';
import { supabase } from '../supabase';
import { formatCurrency } from '../utils/format';
import { subDays, format, eachDayOfInterval, isWithinInterval, startOfDay, endOfDay, parseISO, startOfWeek, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const COLORS = ['#f97316', '#fb923c', '#fdba74', '#fed7aa', '#ffedd5', '#ea580c', '#c2410c', '#9a3412'];

export default function Dashboard({ user }: { user: any }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({
    start: format(new Date(), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });

  const [stats, setStats] = useState({
    totalSales: 0,
    totalOrders: 0,
    lowStock: 0,
    revenue: 0,
    expenses: 0,
    lowStockItems: [] as any[],
    chartData: [] as any[],
    topProducts: [] as any[],
    categoryData: [] as any[],
    paymentMethodData: [] as any[]
  });

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const start = startOfDay(parseISO(dateRange.start)).toISOString();
        const end = endOfDay(parseISO(dateRange.end)).toISOString();
        
        const [salesRes, ordersRes, allProductsRes, lowStockRes, expensesRes] = await Promise.all([
          supabase.from('sales').select('*').eq('user_id', user.id).gte('created_at', start).lte('created_at', end),
          supabase.from('service_orders').select('*').eq('user_id', user.id).gte('created_at', start).lte('created_at', end),
          supabase.from('products').select('*').eq('user_id', user.id),
          supabase.from('products').select('*').eq('user_id', user.id).lte('stock', 5),
          supabase.from('expenses').select('amount').eq('user_id', user.id).eq('status', 'paid').gte('due_date', start).lte('due_date', end)
        ]);

        if (salesRes.error || ordersRes.error || allProductsRes.error || lowStockRes.error || expensesRes.error) {
          const firstError = salesRes.error || ordersRes.error || allProductsRes.error || lowStockRes.error || expensesRes.error;
          setError(`Erro ao buscar dados: ${firstError?.message || 'Erro desconhecido'}.`);
          return;
        }

        const productMap = new Map();
        allProductsRes.data?.forEach(p => productMap.set(p.id, p));

        let revenue = 0;
        let totalCost = 0;
        const productSalesCount: Record<string, { name: string, quantity: number, total: number }> = {};
        const categorySales: Record<string, number> = {};
        const paymentMethods: Record<string, number> = {};

        // Process Sales
        salesRes.data?.forEach(s => {
          revenue += Number(s.total) || 0;
          const method = s.payment_method || 'Outros';
          paymentMethods[method] = (paymentMethods[method] || 0) + Number(s.total);

          const items = s.items as any[];
          items?.forEach(item => {
            const quantity = Number(item.quantity) || 1;
            const itemTotal = (Number(item.price) || 0) * quantity;
            const productId = item.productId;
            const product = productMap.get(productId);
            
            if (productId) {
              if (!productSalesCount[productId]) {
                productSalesCount[productId] = { name: item.name || product?.name || 'Produto', quantity: 0, total: 0 };
              }
              productSalesCount[productId].quantity += quantity;
              productSalesCount[productId].total += itemTotal;

              const category = product?.category || 'Sem Categoria';
              categorySales[category] = (categorySales[category] || 0) + itemTotal;
            }

            if (item.cost !== undefined) {
              totalCost += Number(item.cost) * quantity;
            } else if (productId) {
              totalCost += (product?.cost || 0) * quantity;
            }
          });
        });

        // Process Orders
        ordersRes.data?.forEach(o => {
          if (o.status === 'delivered') {
            revenue += Number(o.total_value) || 0;
            const method = o.payment_method || 'Outros';
            paymentMethods[method] = (paymentMethods[method] || 0) + Number(o.total_value);

            const parts = o.parts_used as any[];
            parts?.forEach(part => {
              const quantity = Number(part.quantity) || 1;
              const productId = part.productId;
              const product = productMap.get(productId);

              if (productId) {
                if (!productSalesCount[productId]) {
                  productSalesCount[productId] = { name: part.name || product?.name || 'Peça', quantity: 0, total: 0 };
                }
                productSalesCount[productId].quantity += quantity;
                productSalesCount[productId].total += (Number(part.price) || 0) * quantity;

                const category = product?.category || 'Peças/Serviços';
                categorySales[category] = (categorySales[category] || 0) + (Number(part.price) || 0) * quantity;
              }

              if (part.cost !== undefined) {
                totalCost += Number(part.cost) * quantity;
              } else if (productId) {
                totalCost += (product?.cost || 0) * quantity;
              }
            });

            // Labor/Service as a category
            const laborValue = Number(o.labor_value) || 0;
            if (laborValue > 0) {
              categorySales['Serviços'] = (categorySales['Serviços'] || 0) + laborValue;
            }
          }
        });

        let expenses = 0;
        expensesRes.data?.forEach(e => expenses += Number(e.amount) || 0);

        // Process chart data (Daily Trend)
        const days = eachDayOfInterval({ start: parseISO(dateRange.start), end: parseISO(dateRange.end) });
        const chartData = days.map(day => {
          const dayStr = format(day, 'yyyy-MM-dd');
          const dayName = format(day, 'dd/MM');
          
          const daySales = (salesRes.data || [])
            .filter(s => format(new Date(s.created_at), 'yyyy-MM-dd') === dayStr)
            .reduce((acc, s) => acc + Number(s.total), 0);
          
          const dayOrders = (ordersRes.data || [])
            .filter(o => o.status === 'delivered' && format(new Date(o.created_at), 'yyyy-MM-dd') === dayStr)
            .reduce((acc, o) => acc + Number(o.total_value), 0);

          return { 
            name: dayName, 
            vendas: daySales, 
            os: dayOrders,
            total: daySales + dayOrders
          };
        });

        // Top Products
        const topProducts = Object.values(productSalesCount)
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5);

        // Category Data
        const categoryData = Object.entries(categorySales)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);

        // Payment Method Data
        const paymentMethodData = Object.entries(paymentMethods)
          .map(([name, value]) => ({ 
            name: name === 'cash' ? 'Dinheiro' : 
                  name === 'pix' ? 'PIX' : 
                  name === 'credit_card' ? 'Cartão Crédito' : 
                  name === 'debit_card' ? 'Cartão Débito' : name, 
            value 
          }))
          .sort((a, b) => b.value - a.value);

        setStats({
          totalSales: salesRes.data?.length || 0,
          totalOrders: ordersRes.data?.length || 0,
          lowStock: lowStockRes.data?.length || 0,
          revenue,
          expenses: expenses + totalCost,
          lowStockItems: lowStockRes.data || [],
          chartData,
          topProducts,
          categoryData,
          paymentMethodData
        });
      } catch (err: any) {
        console.error('Fatal error fetching dashboard data:', err);
        setError(`Erro fatal: ${err.message || 'Erro desconhecido'}`);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [dateRange, user.id]);

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
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Dashboard</h1>
          <p className="text-gray-500 font-medium">Gestão e indicadores da sua assistência.</p>
        </div>
        
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setDateRange({
                start: format(new Date(), 'yyyy-MM-dd'),
                end: format(new Date(), 'yyyy-MM-dd')
              })}
              className="px-3 py-1.5 text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              Hoje
            </button>
            <button
              onClick={() => setDateRange({
                start: format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'),
                end: format(new Date(), 'yyyy-MM-dd')
              })}
              className="px-3 py-1.5 text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              Esta Semana
            </button>
            <button
              onClick={() => setDateRange({
                start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
                end: format(new Date(), 'yyyy-MM-dd')
              })}
              className="px-3 py-1.5 text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              Este Mês
            </button>
            <button
              onClick={() => setDateRange({
                start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
                end: format(new Date(), 'yyyy-MM-dd')
              })}
              className="px-3 py-1.5 text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              Últimos 30 Dias
            </button>
            <button
              onClick={() => setDateRange({
                start: '2000-01-01',
                end: format(new Date(), 'yyyy-MM-dd')
              })}
              className="px-3 py-1.5 text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              Tempo Total
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-orange-100">
            <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 rounded-xl border border-orange-100">
              <Calendar className="w-4 h-4 text-orange-600" />
              <input 
                type="date" 
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="bg-transparent border-none text-sm font-bold text-orange-900 focus:ring-0 p-0"
              />
            </div>
            <span className="text-gray-400 font-bold">até</span>
            <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 rounded-xl border border-orange-100">
              <Calendar className="w-4 h-4 text-orange-600" />
              <input 
                type="date" 
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="bg-transparent border-none text-sm font-bold text-orange-900 focus:ring-0 p-0"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, i) => (
          <div key={i} className="group bg-white p-6 rounded-3xl shadow-sm border border-orange-100 hover:border-orange-300 hover:shadow-xl hover:shadow-orange-500/5 transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className={`${card.color} p-4 rounded-2xl text-white shadow-lg shadow-current/20 group-hover:scale-110 transition-transform`}>
                <card.icon className="w-6 h-6" />
              </div>
              <div className="flex flex-col items-end">
                <span className={`text-xs font-black px-2 py-1 rounded-lg ${card.trend.startsWith('+') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {card.trend}
                </span>
              </div>
            </div>
            <p className="text-gray-400 text-xs font-black uppercase tracking-widest">{card.label}</p>
            <h3 className="text-3xl font-black text-gray-900 mt-1 tracking-tight">{card.value}</h3>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Trend Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] shadow-sm border border-orange-100">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-black text-gray-900 tracking-tight uppercase">Tendência de Vendas</h3>
              <p className="text-sm text-gray-500 font-medium">Volume diário de vendas e ordens de serviço</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                <span className="text-xs font-bold text-gray-500 uppercase">Vendas</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-300"></div>
                <span className="text-xs font-bold text-gray-500 uppercase">OS</span>
              </div>
            </div>
          </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.chartData}>
                <defs>
                  <linearGradient id="colorVendas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorOS" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fdba74" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#fdba74" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}}
                  tickFormatter={(value) => `R$ ${value}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '20px', 
                    border: 'none', 
                    boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                    padding: '16px'
                  }}
                  itemStyle={{ fontWeight: 700, fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="vendas" stroke="#f97316" fillOpacity={1} fill="url(#colorVendas)" strokeWidth={4} />
                <Area type="monotone" dataKey="os" stroke="#fdba74" fillOpacity={1} fill="url(#colorOS)" strokeWidth={4} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-orange-100">
          <h3 className="text-xl font-black text-gray-900 tracking-tight uppercase mb-6">Top 5 Produtos</h3>
          <div className="space-y-6">
            {stats.topProducts.map((product: any, idx: number) => (
              <div key={idx} className="flex items-center gap-4 group">
                <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-600 font-black text-lg group-hover:bg-orange-500 group-hover:text-white transition-all">
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 leading-tight">{product.name}</p>
                  <p className="text-xs text-gray-400 font-bold uppercase">{product.quantity} unidades vendidas</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-gray-900">{formatCurrency(product.total)}</p>
                </div>
              </div>
            ))}
            {stats.topProducts.length === 0 && (
              <div className="text-center py-12">
                <ShoppingCart className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-400 font-bold">Nenhuma venda no período</p>
              </div>
            )}
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-orange-100">
          <h3 className="text-xl font-black text-gray-900 tracking-tight uppercase mb-6">Vendas por Categoria</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {stats.categoryData.map((_entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-orange-100">
          <h3 className="text-xl font-black text-gray-900 tracking-tight uppercase mb-6">Métodos de Pagamento</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.paymentMethodData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#64748b', fontSize: 12, fontWeight: 700}}
                  width={100}
                />
                <Tooltip 
                  cursor={{fill: 'transparent'}}
                  contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" fill="#f97316" radius={[0, 10, 10, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Critical Stock */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-orange-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-black text-gray-900 tracking-tight uppercase">Estoque Crítico</h3>
            <span className="bg-red-100 text-red-700 text-xs font-black px-3 py-1 rounded-full uppercase">
              {stats.lowStock} itens
            </span>
          </div>
          <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {stats.lowStockItems.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between p-4 bg-red-50 rounded-2xl border border-red-100">
                <div>
                  <p className="font-bold text-gray-900">{item.name}</p>
                  <p className="text-[10px] text-red-600 font-black uppercase">{item.category}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-red-600">{item.stock}</p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase">Unid.</p>
                </div>
              </div>
            ))}
            {stats.lowStockItems.length === 0 && (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-400 font-bold">Estoque em dia!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
