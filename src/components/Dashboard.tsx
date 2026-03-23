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

export default function Dashboard({ user }: { user: any }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalSales: 0,
    totalOrders: 0,
    lowStock: 0,
    revenue: 0
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
        // Usando count: 'exact' e head: true para não baixar os dados, apenas contar
        const [salesRes, ordersRes, productsRes, lowStockRes] = await Promise.all([
          supabase.from('sales').select('total').eq('user_id', user.id),
          supabase.from('service_orders').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('products').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('products').select('*', { count: 'exact', head: true }).eq('user_id', user.id).lte('stock', 5)
        ]);

        if (salesRes.error || ordersRes.error || productsRes.error || lowStockRes.error) {
          const firstError = salesRes.error || ordersRes.error || productsRes.error || lowStockRes.error;
          console.error('Error fetching dashboard data:', {
            salesError: salesRes.error,
            ordersError: ordersRes.error,
            productsError: productsRes.error,
            lowStockError: lowStockRes.error
          });
          setError(`Erro ao buscar dados: ${firstError?.message || 'Erro desconhecido'}. Verifique se as tabelas do banco de dados foram configuradas corretamente.`);
          return;
        }

        let revenue = 0;
        salesRes.data?.forEach(s => revenue += Number(s.total) || 0);

        setStats({
          totalSales: salesRes.data?.length || 0,
          totalOrders: ordersRes.count || 0,
          lowStock: lowStockRes.count || 0,
          revenue
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
    { label: 'Faturamento Total', value: formatCurrency(stats.revenue), icon: DollarSign, color: 'bg-green-500', trend: '+12%' },
    { label: 'Vendas Realizadas', value: stats.totalSales, icon: TrendingUp, color: 'bg-blue-500', trend: '+5%' },
    { label: 'Ordens de Serviço', value: stats.totalOrders, icon: Wrench, color: 'bg-orange-500', trend: '+8%' },
    { label: 'Produtos em Baixa', value: stats.lowStock, icon: Package, color: 'bg-red-500', trend: '-2%' },
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
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-orange-100">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Desempenho Semanal</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
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
              <BarChart data={data}>
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
