// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  User,
  Phone,
  Mail,
  MapPin,
  FileText,
  AlertCircle,
  X,
  XCircle
} from 'lucide-react';
import { supabase } from '../supabase';
import { Customer } from '../types';
import { fetchAddressByCep } from '../utils/cep';

export default function Customers({ user }: { user: any }) {
  const [isLoading, setIsLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    cep: '',
    document: '',
    address: ''
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
      await fetchCustomers();
      setIsLoading(false);
    };
    init();

    const channel = supabase
      .channel('customers_changes')
      .on('postgres_changes', { event: '*', table: 'customers' }, () => {
        fetchCustomers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCustomers = async () => {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('user_id', user.id)
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
      if (editingCustomer) {
        const { error: submitError } = await supabase
          .from('customers')
          .update({
            ...formData,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingCustomer.id)
          .eq('user_id', user.id);
        if (submitError) throw submitError;
      } else {
        const { error: submitError } = await supabase
          .from('customers')
          .insert({
            ...formData,
            user_id: user.id
          });
        if (submitError) throw submitError;
      }
      
      await fetchCustomers();
      setIsModalOpen(false);
      setEditingCustomer(null);
      setFormData({ name: '', email: '', phone: '', cep: '', document: '', address: '' });
    } catch (err: any) {
      console.error("Erro ao salvar cliente:", err);
      setError(err.message || "Ocorreu um erro ao salvar o cliente. Verifique os dados e tente novamente.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    setCustomerToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!customerToDelete) return;
    
    setIsDeleting(true);
    try {
      const { error: deleteError } = await supabase
        .from('customers')
        .delete()
        .eq('id', customerToDelete)
        .eq('user_id', user.id);
      
      if (deleteError) throw deleteError;
      
      setIsDeleteModalOpen(false);
      setCustomerToDelete(null);
    } catch (err: any) {
      console.error('Error deleting customer:', err);
      alert('Erro ao excluir cliente: ' + (err.message || 'Verifique suas permissões.'));
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm) ||
    (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase()))
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
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500">Gerencie o cadastro de seus clientes.</p>
        </div>
        <button 
          onClick={() => {
            setEditingCustomer(null);
            setFormData({ name: '', email: '', phone: '', cep: '', document: '', address: '' });
            setIsModalOpen(true);
          }}
          className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 shadow-lg shadow-orange-200 transition-all"
        >
          <Plus className="w-5 h-5" />
          Novo Cliente
        </button>
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden">
        <div className="p-4 border-b border-orange-50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Buscar por nome, telefone ou e-mail..." 
              className="w-full pl-10 pr-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-orange-50 text-orange-900 text-sm font-semibold">
              <tr>
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Contato</th>
                <th className="px-6 py-4">Documento</th>
                <th className="px-6 py-4">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-50">
              {filteredCustomers.map((customer) => (
                <tr key={customer.id} className="hover:bg-orange-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-orange-100 p-2 rounded-lg">
                        <User className="w-5 h-5 text-orange-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{customer.name}</p>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {customer.address || 'Sem endereço'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <p className="text-sm text-gray-700 flex items-center gap-2">
                        <Phone className="w-3 h-3 text-orange-400" /> {customer.phone}
                      </p>
                      {customer.email && (
                        <p className="text-xs text-gray-500 flex items-center gap-2">
                          <Mail className="w-3 h-3 text-orange-400" /> {customer.email}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-400" />
                      {customer.document || 'N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          setEditingCustomer(customer);
                          setFormData({
                            name: customer.name,
                            email: customer.email || '',
                            phone: customer.phone,
                            cep: customer.cep || '',
                            document: customer.document || '',
                            address: customer.address || ''
                          });
                          setIsModalOpen(true);
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(customer.id!)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-orange-100 flex justify-between items-center bg-orange-50">
              <h2 className="text-xl font-bold text-gray-900">
                {editingCustomer ? 'Editar Cliente' : 'Novo Cliente'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                  <input 
                    required
                    type="text" 
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Telefone / WhatsApp</label>
                    <input 
                      required
                      type="text" 
                      className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                      value={formData.phone}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                    />
                  </div>
                <div className="grid grid-cols-2 gap-4">
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CPF / CNPJ</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                      value={formData.document}
                      onChange={e => setFormData({...formData, document: e.target.value})}
                    />
                  </div>
                </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                  <input 
                    type="email" 
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Endereço Completo</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.address}
                    onChange={e => setFormData({...formData, address: e.target.value})}
                  />
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
                  {isSaving ? 'Salvando...' : 'Salvar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Excluir Cliente?</h3>
              <p className="text-gray-500 text-sm mb-6">
                Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-all"
                  disabled={isDeleting}
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-red-200 flex items-center justify-center gap-2"
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Excluir
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
