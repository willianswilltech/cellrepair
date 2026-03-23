import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  Wrench, 
  ShoppingCart, 
  LogOut, 
  Menu, 
  X,
  User,
  AlertTriangle,
  Banknote
} from 'lucide-react';
import { supabase } from './supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import ServiceOrders from './components/ServiceOrders';
import POS from './components/POS';
import SalesHistory from './components/SalesHistory';
import Profile from './components/Profile';
import Cashier from './components/Cashier';
import Customers from './components/Customers';
import Categories from './components/Categories';
import Suppliers from './components/Suppliers';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'orders' | 'pos' | 'sales' | 'profile' | 'cashier' | 'customers' | 'categories' | 'suppliers'>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [configError, setConfigError] = useState(false);
  
  // Auth Form State
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    // Check for missing config
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      setConfigError(true);
      setLoading(false);
      return;
    }

    // Check active sessions and subscribe to auth changes
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error, data } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            data: {
              full_name: displayName,
            }
          }
        });
        if (error) throw error;
        if (data.user) {
          // Create profile
          await supabase.from('profiles').insert({
            id: data.user.id,
            name: displayName,
            email: email,
            role: 'admin'
          });
        }
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      setAuthError(error.message);
    }
  };

  const handleGoogleAuth = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (error: any) {
      console.error('Google auth error:', error);
      alert('Erro ao entrar com Google. Verifique as configurações do Supabase.');
    }
  };

  const logOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (configError) {
    return (
      <div className="min-h-screen bg-orange-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-6">
          <div className="bg-red-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-10 h-10 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Configuração Necessária</h1>
          <p className="text-gray-600">
            As chaves do Supabase não foram encontradas. Por favor, configure as variáveis de ambiente:
          </p>
          <div className="bg-gray-50 p-4 rounded-xl text-left font-mono text-xs space-y-2">
            <p>VITE_SUPABASE_URL</p>
            <p>VITE_SUPABASE_ANON_KEY</p>
          </div>
          <p className="text-sm text-gray-500">
            Você pode configurar estas chaves no menu <strong>Settings</strong> do AI Studio.
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-orange-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-6">
          <div className="bg-orange-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
            <Wrench className="w-10 h-10 text-orange-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">CellRepair Pro</h1>
          <p className="text-gray-600">Acesse o sistema para gerenciar sua assistência técnica.</p>
          
          <form onSubmit={handleEmailAuth} className="space-y-4 text-left">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <input 
                required
                type="email" 
                className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
              <input 
                required
                type="password" 
                className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            
            {authError && (
              <p className="text-xs text-red-600 font-medium">{authError}</p>
            )}

            <button
              type="submit"
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-lg shadow-orange-200"
            >
              {isLogin ? 'Entrar' : 'Criar Conta'}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
            <div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-gray-500">Ou continue com</span></div>
          </div>

          <button
            onClick={handleGoogleAuth}
            className="w-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <User className="w-5 h-5" />
            Entrar com Google
          </button>

          <p className="text-sm text-gray-600">
            {isLogin ? 'Não tem uma conta?' : 'Já tem uma conta?'}
            <button 
              onClick={() => setIsLogin(!isLogin)}
              className="ml-1 text-orange-600 font-bold hover:underline"
            >
              {isLogin ? 'Cadastre-se' : 'Faça Login'}
            </button>
          </p>
          
          <p className="text-xs text-gray-400">
            Certifique-se de permitir popups em seu navegador para realizar o login com Google.
          </p>
        </div>
      </div>
    );
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'pos', label: 'PDV / Vendas', icon: ShoppingCart },
    { id: 'cashier', label: 'Caixa / Financeiro', icon: Banknote },
    { id: 'sales', label: 'Histórico', icon: ShoppingCart },
    { id: 'inventory', label: 'Estoque', icon: Package },
    { id: 'orders', label: 'Ordens de Serviço', icon: Wrench },
    { id: 'customers', label: 'Clientes', icon: User },
    { id: 'categories', label: 'Categorias', icon: LayoutDashboard },
    { id: 'suppliers', label: 'Fornecedores', icon: Package },
    { id: 'profile', label: 'Meu Perfil', icon: User },
  ];

  return (
    <div className="min-h-screen bg-orange-50 flex">
      {/* Sidebar Mobile Toggle */}
      <button 
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        {isSidebarOpen ? <X /> : <Menu />}
      </button>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-orange-100 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-0",
        !isSidebarOpen && "-translate-x-full"
      )}>
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-orange-100 flex items-center gap-3">
            <div className="bg-orange-600 p-2 rounded-lg">
              <Wrench className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">CellRepair</span>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id as any);
                  setIsSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium",
                  activeTab === item.id 
                    ? "bg-orange-600 text-white shadow-lg shadow-orange-200" 
                    : "text-gray-600 hover:bg-orange-50 hover:text-orange-600"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="p-4 border-t border-orange-100">
            <div className="flex items-center gap-3 px-4 py-3 mb-4">
              <img 
                src={user.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${user.user_metadata?.full_name || user.email}`} 
                alt="Avatar" 
                className="w-10 h-10 rounded-full border-2 border-orange-200"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{user.user_metadata?.full_name || 'Usuário'}</p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
            </div>
            <button
              onClick={logOut}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 transition-all font-medium"
            >
              <LogOut className="w-5 h-5" />
              Sair do Sistema
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-4 lg:p-8">
        <div className="max-w-7xl mx-auto">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'inventory' && <Inventory />}
          {activeTab === 'orders' && <ServiceOrders />}
          {activeTab === 'pos' && <POS onNavigate={setActiveTab} />}
          {activeTab === 'sales' && <SalesHistory onNavigate={setActiveTab} />}
          {activeTab === 'cashier' && <Cashier user={user} />}
          {activeTab === 'customers' && <Customers />}
          {activeTab === 'categories' && <Categories />}
          {activeTab === 'suppliers' && <Suppliers />}
          {activeTab === 'profile' && <Profile user={user} />}
        </div>
      </main>
    </div>
  );
}
