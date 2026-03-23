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
  ArrowDownRight
} from 'lucide-react';
import { supabase } from '../supabase';
import { formatCurrency } from '../utils/format';

export default function Dashboard() {
  const [isLoading, setIsLoading] = useState(true);
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
      try {
        // Usando count: 'exact' e head: true para não baixar os dados, apenas contar
        const [salesRes, ordersRes, productsRes, lowStockRes] = await Promise.all([
          supabase.from('sales').select('total'),
          supabase.from('service_orders').select('*', { count: 'exact', head: true }),
          supabase.from('products').select('*', { count: 'exact', head: true }),
          supabase.from('products').select('*', { count: 'exact', head: true }).lte('stock', 5)
        ]);

        if (salesRes.error || ordersRes.error || productsRes.error || lowStockRes.error) {
          console.error('Error fetching dashboard data');
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
