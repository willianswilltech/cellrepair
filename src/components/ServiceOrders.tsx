// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Truck,
  XCircle,
  Phone,
  Smartphone,
  MoreVertical,
  Edit2,
  Trash2
} from 'lucide-react';
import { supabase } from '../supabase';
import { ServiceOrder, Customer } from '../types';
import { formatCurrency, formatDate } from '../utils/format';
import { fetchAddressByCep } from '../utils/cep';

export default function ServiceOrders() {
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [editingOrder, setEditingOrder] = useState<ServiceOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isModalOpen || isDeleteModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isModalOpen, isDeleteModalOpen]);

  const [formData, setFormData] = useState({
    customerId: '',
    customerName: '',
    customerPhone: '',
    cep: '',
    address: '',
    device: '',
    problem: '',
    observations: '',
    totalValue: 0,
    status: 'pending' as const
  });

  const handleCepChange = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    setFormData(prev => ({ ...prev, cep: cleanCep }));

    if (cleanCep.length === 8) {
      const addressData = await fetchAddressByCep(cleanCep);
      if (addressData) {
        const fullAddress = `${addressData.logradouro}, ${addressData.bairro}, ${addressData.localidade} - ${addressData.uf}`;
        setFormData(prev => ({ ...prev, address: fullAddress }));
      }
    }
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([fetchOrders(), fetchCustomers()]);
      setIsLoading(false);
    };
    init();

    // @ts-ignore
    const channel = supabase
      .channel('orders_and_customers_changes')
      .on('postgres_changes', { event: '*', table: 'service_orders' }, () => {
        fetchOrders();
      })
      .on('postgres_changes', { event: '*', table: 'customers' }, () => {
        fetchCustomers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from('service_orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (error) {
      console.error('Error fetching orders:', error);
    } else {
      const mappedOrders = (data || []).map((o: any) => ({
        id: o.id,
        customerId: o.customer_id,
        customerName: o.customer_name,
        customerPhone: o.customer_phone,
        cep: o.cep,
        address: o.address,
        device: o.device,
        problem: o.problem,
        status: o.status,
        totalValue: o.total_value,
        partsUsed: o.parts_used,
        observations: o.observations,
        createdAt: o.created_at,
        updatedAt: o.updated_at
      }));
      setOrders(mappedOrders);
    }
  };

  const fetchCustomers = async () => {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('name');
    
    if (error) {
      console.error('Error fetching customers:', error);
    } else {
      setCustomers(data || []);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const payload = {
        customer_id: formData.customerId || null,
        customer_name: formData.customerName,
        customer_phone: formData.customerPhone,
        cep: formData.cep,
        address: formData.address,
        device: formData.device,
        problem: formData.problem,
        observations: formData.observations,
        total_value: formData.totalValue,
        status: formData.status
      };

      if (editingOrder) {
        const { error: submitError } = await supabase
          .from('service_orders')
          .update({
            ...payload,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingOrder.id);
        if (submitError) throw submitError;
      } else {
        const { error: submitError } = await supabase
          .from('service_orders')
          .insert({
            ...payload,
            parts_used: []
          });
        if (submitError) throw submitError;
      }

      await fetchOrders();
      setIsModalOpen(false);
      setEditingOrder(null);
      setFormData({ customerId: '', customerName: '', customerPhone: '', cep: '', address: '', device: '', problem: '', observations: '', totalValue: 0, status: 'pending' });
    } catch (err: any) {
      console.error("Erro ao salvar OS:", err);
      setError(err.message || "Ocorreu um erro ao salvar a ordem de serviço. Verifique os dados e tente novamente.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setOrderToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!orderToDelete) return;
    
    try {
      const { error: deleteError } = await supabase
        .from('service_orders')
        .delete()
        .eq('id', orderToDelete);
      
      if (deleteError) throw deleteError;
      
      console.log('OS excluída com sucesso');
      await fetchOrders();
      setIsDeleteModalOpen(false);
      setOrderToDelete(null);
    } catch (err: any) {
      console.error('Erro ao excluir OS:', err);
      alert('Erro ao excluir OS: ' + (err.message || 'Verifique suas permissões.'));
      setIsDeleteModalOpen(false);
    }
  };

  const updateStatus = async (id: string, newStatus: ServiceOrder['status']) => {
    try {
      const { error } = await supabase
        .from('service_orders')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);
      
      if (error) throw error;
      
      await fetchOrders();
      // Feedback visual opcional
      if (newStatus === 'delivered') {
        alert("Ordem de Serviço entregue e finalizada com sucesso!");
      }
    } catch (error: any) {
      console.error('Error updating status:', error);
      alert('Erro ao atualizar status: ' + (error.message || 'Verifique suas permissões.'));
    }
  };

  const getStatusBadge = (status: ServiceOrder['status']) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      'in-progress': 'bg-blue-100 text-blue-700 border-blue-200',
      completed: 'bg-green-100 text-green-700 border-green-200',
      delivered: 'bg-purple-100 text-purple-700 border-purple-200',
      cancelled: 'bg-red-100 text-red-700 border-red-200'
    };
    const labels = {
      pending: 'Pendente',
      'in-progress': 'Em Reparo',
      completed: 'Pronto',
      delivered: 'Entregue',
      cancelled: 'Cancelado'
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const filteredOrders = orders.filter(o => 
    o.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.device.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ordens de Serviço</h1>
          <p className="text-gray-500">Acompanhe e gerencie os reparos dos clientes.</p>
        </div>
        <button 
          onClick={() => {
            setEditingOrder(null);
            setFormData({ customerId: '', customerName: '', customerPhone: '', cep: '', address: '', device: '', problem: '', observations: '', totalValue: 0, status: 'pending' });
            setIsModalOpen(true);
          }}
          className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 shadow-lg shadow-orange-200 transition-all"
        >
          <Plus className="w-5 h-5" />
          Nova OS
        </button>
      </header>

      <div className="flex gap-4 overflow-x-auto pb-2">
        <div className="bg-white p-4 rounded-2xl border border-orange-100 min-w-[200px] flex-1">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Pendentes</p>
          <p className="text-2xl font-bold text-yellow-600">{orders.filter(o => o.status === 'pending').length}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-orange-100 min-w-[200px] flex-1">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Em Reparo</p>
          <p className="text-2xl font-bold text-blue-600">{orders.filter(o => o.status === 'in-progress').length}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-orange-100 min-w-[200px] flex-1">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Prontos</p>
          <p className="text-2xl font-bold text-green-600">{orders.filter(o => o.status === 'completed').length}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden">
        <div className="p-4 border-b border-orange-50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Buscar por cliente ou aparelho..." 
              className="w-full pl-10 pr-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="divide-y divide-orange-50">
          {filteredOrders.map((order) => (
            <div key={order.id} className="p-6 hover:bg-orange-50/30 transition-colors">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="bg-orange-100 p-3 rounded-2xl">
                    <Smartphone className="w-6 h-6 text-orange-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-gray-900">{order.customerName}</h3>
                      {getStatusBadge(order.status)}
                    </div>
                    <p className="text-sm text-gray-600 flex items-center gap-2">
                      <Smartphone className="w-4 h-4" /> {order.device}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Criada em {formatDate(order.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 lg:gap-8">
                  <div className="text-right">
                    <p className="text-xs font-bold text-gray-400 uppercase">Valor Total</p>
                    <p className="text-lg font-bold text-orange-600">{formatCurrency(order.totalValue)}</p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        setEditingOrder(order);
                        setFormData({
                          customerId: order.customerId || '',
                          customerName: order.customerName,
                          customerPhone: order.customerPhone,
                          cep: order.cep || '',
                          address: order.address || '',
                          device: order.device,
                          problem: order.problem,
                          observations: order.observations || '',
                          totalValue: order.totalValue,
                          status: order.status
                        });
                        setIsModalOpen(true);
                      }}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                      title="Editar OS"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => updateStatus(order.id!, 'in-progress')}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                      title="Iniciar Reparo"
                    >
                      <Clock className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => updateStatus(order.id!, 'completed')}
                      className="p-2 text-green-600 hover:bg-green-50 rounded-xl transition-all"
                      title="Marcar como Pronto"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => updateStatus(order.id!, 'delivered')}
                      className="p-2 text-purple-600 hover:bg-purple-50 rounded-xl transition-all"
                      title="Entregar ao Cliente"
                    >
                      <Truck className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => handleDelete(order.id!)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-all"
                      title="Excluir OS"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-4 p-4 bg-orange-50 rounded-xl">
                <p className="text-sm font-medium text-orange-900">
                  <span className="font-bold">Problema:</span> {order.problem}
                </p>
                <div className="mt-2 flex items-center gap-4 text-xs text-orange-700">
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {order.customerPhone}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Nova OS */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-orange-100 flex justify-between items-center bg-orange-50 shrink-0">
              <h2 className="text-xl font-bold text-gray-900">
                {editingOrder ? 'Editar Ordem de Serviço' : 'Nova Ordem de Serviço'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              {error && (
                <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Selecionar Cliente</label>
                  <select 
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.customerId}
                    onChange={e => {
                      const customer = customers.find(c => c.id === e.target.value);
                      if (customer) {
                        setFormData({
                          ...formData,
                          customerId: customer.id,
                          customerName: customer.name,
                          customerPhone: customer.phone,
                          cep: customer.cep || '',
                          address: customer.address || ''
                        });
                      } else {
                        setFormData({
                          ...formData,
                          customerId: '',
                          customerName: '',
                          customerPhone: '',
                          cep: '',
                          address: ''
                        });
                      }
                    }}
                  >
                    <option value="">Novo Cliente / Digitar Manual</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Cliente</label>
                  <input 
                    required
                    type="text" 
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.customerName}
                    onChange={e => setFormData({...formData, customerName: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                  <input 
                    required
                    type="text" 
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.customerPhone}
                    onChange={e => setFormData({...formData, customerPhone: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
                  <input 
                    type="text" 
                    maxLength={8}
                    placeholder="00000000"
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.cep}
                    onChange={e => handleCepChange(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Endereço</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.address}
                    onChange={e => setFormData({...formData, address: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Aparelho</label>
                  <input 
                    required
                    type="text" 
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.device}
                    onChange={e => setFormData({...formData, device: e.target.value})}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Problema Relatado</label>
                  <textarea 
                    required
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.problem}
                    onChange={e => setFormData({...formData, problem: e.target.value})}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                  <textarea 
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.observations}
                    onChange={e => setFormData({...formData, observations: e.target.value})}
                    rows={3}
                    placeholder="Informações adicionais sobre o reparo..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valor Estimado</label>
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={isNaN(formData.totalValue) ? '' : formData.totalValue}
                    onChange={e => setFormData({...formData, totalValue: parseFloat(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select 
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.status}
                    onChange={e => setFormData({...formData, status: e.target.value as any})}
                  >
                    <option value="pending">Pendente</option>
                    <option value="in-progress">Em Reparo</option>
                    <option value="completed">Pronto</option>
                    <option value="delivered">Entregue</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-6 py-3 border border-orange-200 text-orange-700 font-semibold rounded-xl hover:bg-orange-50 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 px-6 py-3 bg-orange-600 text-white font-semibold rounded-xl hover:bg-orange-700 shadow-lg shadow-orange-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Salvando...' : (editingOrder ? 'Salvar Alterações' : 'Abrir OS')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="text-center space-y-2">
              <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                <Trash2 className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Excluir Ordem de Serviço?</h3>
              <p className="text-gray-500">Esta ação não pode ser desfeita. A OS será removida permanentemente.</p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 shadow-lg shadow-red-200 transition-all"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
