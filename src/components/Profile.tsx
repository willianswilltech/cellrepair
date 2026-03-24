// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { 
  User, 
  Mail, 
  Shield, 
  Save,
  CheckCircle2,
  Plus
} from 'lucide-react';
import { supabase } from '../supabase';

export default function Profile({ user, onProfileUpdate }: { user: any, onProfileUpdate?: () => void }) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          // Profile not found, create it
          const { data: newData, error: createError } = await supabase
            .from('profiles')
            .insert({
              id: user.id,
              name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuário',
              email: user.email,
              role: 'user'
            })
            .select()
            .single();
          
          if (createError) throw createError;
          setProfile(newData);
          setName(newData.name || '');
          setStoreName(newData.store_name || '');
          setCnpj(newData.cnpj || '');
          setPhone(newData.phone || '');
          setAddress(newData.address || '');
        } else {
          throw error;
        }
      } else {
        setProfile(data);
        setName(data.name || '');
        setStoreName(data.store_name || '');
        setCnpj(data.cnpj || '');
        setPhone(data.phone || '');
        setAddress(data.address || '');
      }
    } catch (error) {
      console.error('Error fetching/creating profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg('');
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          name,
          store_name: storeName,
          cnpj,
          phone,
          address
        })
        .eq('id', user.id);
      
      if (error) throw error;
      
      setShowSuccess(true);
      if (onProfileUpdate) onProfileUpdate();
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error: any) {
      console.error('Error updating profile:', error);
      setErrorMsg(error.message || 'Erro ao atualizar perfil');
    } finally {
      setIsSaving(false);
    }
  };

  const seedData = async () => {
    setIsSaving(true);
    try {
      // 1. Categories
      const categories = [
        { name: 'Smartphones', description: 'Aparelhos celulares', user_id: user.id },
        { name: 'Acessórios', description: 'Capas, películas, cabos', user_id: user.id },
        { name: 'Peças', description: 'Telas, baterias, conectores', user_id: user.id }
      ];
      const { data: catData, error: catError } = await supabase.from('categories').insert(categories).select();
      if (catError) throw catError;

      // 2. Products
      const products = [
        { name: 'iPhone 13 Pro Max', description: '128GB, Grafite', price: 5500, cost: 4500, stock: 5, category: 'Smartphones', category_id: catData[0].id, user_id: user.id },
        { name: 'Capa Silicone iPhone 13', description: 'Transparente', price: 50, cost: 15, stock: 20, category: 'Acessórios', category_id: catData[1].id, user_id: user.id },
        { name: 'Tela Original iPhone X', description: 'OLED', price: 450, cost: 300, stock: 3, category: 'Peças', category_id: catData[2].id, user_id: user.id }
      ];
      const { data: prodData, error: prodError } = await supabase.from('products').insert(products).select();
      if (prodError) throw prodError;

      // 3. Customers
      const customers = [
        { name: 'João Silva', email: 'joao@email.com', phone: '(11) 99999-9999', address: 'Rua A, 123', user_id: user.id },
        { name: 'Maria Oliveira', email: 'maria@email.com', phone: '(11) 88888-8888', address: 'Av B, 456', user_id: user.id },
        { name: 'Pedro Santos', email: 'pedro@email.com', phone: '(11) 77777-7777', address: 'Rua C, 789', user_id: user.id }
      ];
      const { data: custData, error: custError } = await supabase.from('customers').insert(customers).select();
      if (custError) throw custError;

      // 4. Suppliers
      const suppliers = [
        { name: 'Distribuidora Tech', contact: 'Carlos', phone: '(11) 5555-5555', email: 'vendas@tech.com', user_id: user.id },
        { name: 'Peças Express', contact: 'Ana', phone: '(11) 4444-4444', email: 'contato@express.com', user_id: user.id },
        { name: 'Acessórios Top', contact: 'Beto', phone: '(11) 3333-3333', email: 'beto@top.com', user_id: user.id }
      ];
      const { error: suppError } = await supabase.from('suppliers').insert(suppliers);
      if (suppError) throw suppError;

      // 5. Service Orders
      const serviceOrders = [
        { customer_name: 'João Silva', customer_phone: '(11) 99999-9999', customer_id: custData[0].id, device: 'iPhone 11', problem: 'Tela Quebrada', total_value: 350, status: 'pending', user_id: user.id },
        { customer_name: 'Maria Oliveira', customer_phone: '(11) 88888-8888', customer_id: custData[1].id, device: 'Samsung S21', problem: 'Bateria não carrega', total_value: 200, status: 'in-progress', user_id: user.id },
        { customer_name: 'Pedro Santos', customer_phone: '(11) 77777-7777', customer_id: custData[2].id, device: 'Motorola G60', problem: 'Conector de Carga', total_value: 150, status: 'completed', user_id: user.id }
      ];
      const { error: soError } = await supabase.from('service_orders').insert(serviceOrders);
      if (soError) throw soError;

      alert("Dados de exemplo criados com sucesso!");
      fetchProfile();
    } catch (error: any) {
      console.error('Error seeding data:', error);
      alert("Erro ao criar dados de exemplo: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 font-bold">Erro ao carregar perfil. Por favor, tente novamente.</p>
        <button 
          onClick={fetchProfile}
          className="mt-4 bg-orange-600 text-white px-6 py-2 rounded-xl font-bold"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meu Perfil</h1>
          <p className="text-gray-500">Gerencie suas informações pessoais e configurações.</p>
        </div>
        <button
          onClick={seedData}
          disabled={isSaving}
          className="bg-orange-100 text-orange-700 hover:bg-orange-200 px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Gerar Dados de Exemplo
        </button>
      </header>

      <div className="bg-white rounded-3xl shadow-xl border border-orange-100 overflow-hidden">
        <div className="p-8 bg-orange-50/50 border-b border-orange-100 flex items-center gap-6">
          <img 
            src={user.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${storeName || name || user.email}`} 
            alt="Avatar" 
            className="w-24 h-24 rounded-full border-4 border-white shadow-lg"
          />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{storeName || name || 'Minha Loja'}</h2>
            <p className="text-gray-500 flex items-center gap-2">
              <Mail className="w-4 h-4" /> {user.email}
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="col-span-2">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-orange-600" />
                Informações Pessoais
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Nome Completo</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-orange-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">E-mail</label>
                  <input 
                    type="email" 
                    disabled
                    className="w-full px-4 py-3 bg-gray-100 border-none rounded-2xl text-gray-500 cursor-not-allowed"
                    value={user.email}
                  />
                </div>
              </div>
            </div>

            <div className="col-span-2 pt-4 border-t border-orange-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-orange-600" />
                Dados da Empresa (Recibos)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Nome da Loja</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-orange-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="Ex: Assistência Técnica XYZ"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">CNPJ</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-orange-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    placeholder="00.000.000/0000-00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Telefone de Contato</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-orange-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Endereço Completo</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-orange-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Rua, Número, Bairro, Cidade - UF"
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white font-bold py-4 rounded-2xl shadow-lg shadow-orange-200 transition-all flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Salvar Alterações
              </>
            )}
          </button>

          {errorMsg && (
            <p className="text-center text-red-600 font-bold text-sm animate-bounce">{errorMsg}</p>
          )}
        </form>
      </div>

      {showSuccess && (
        <div className="fixed bottom-8 right-8 bg-green-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-8 duration-300">
          <CheckCircle2 className="w-6 h-6" />
          <p className="font-bold">Perfil atualizado com sucesso!</p>
        </div>
      )}
    </div>
  );
}
