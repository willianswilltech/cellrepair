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
  XCircle,
  MessageCircle,
  History,
  Smartphone,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { supabase } from '../supabase';
import { Customer, ServiceOrder } from '../types';
import { fetchAddressByCep } from '../utils/cep';
import { formatCurrency, formatDate } from '../utils/format';

import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const getWhatsAppLink = (phone: string) => {
  if (!phone) return '';
  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length >= 10 && cleanPhone.length <= 11) {
    return `https://wa.me/55${cleanPhone}`;
  }
  return `https://wa.me/${cleanPhone}`;
};

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
  
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState<Customer | null>(null);
  const [customerHistory, setCustomerHistory] = useState<ServiceOrder[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    cep: '',
    document: '',
    address: '',
    address_number: ''
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
      setFormData({ name: '', email: '', phone: '', cep: '', document: '', address: '', address_number: '' });
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

  const handleViewHistory = async (customer: Customer) => {
    setSelectedCustomerForHistory(customer);
    setIsHistoryModalOpen(true);
    setIsLoadingHistory(true);
    
    try {
      const { data, error } = await supabase
        .from('service_orders')
        .select('*')
        .eq('customer_id', customer.id)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setCustomerHistory(data || []);
    } catch (error) {
      console.error('Error fetching customer history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm) ||
    (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Relatório de Clientes', 14, 22);
    
    doc.setFontSize(11);
    doc.text(`Data de Emissão: ${formatDate(new Date().toISOString())}`, 14, 30);
    
    const tableColumn = ["Nome", "Telefone", "Email", "Documento", "Endereço"];
    const tableRows: any[] = [];
    
    filteredCustomers.forEach(customer => {
      const customerData = [
        customer.name,
        customer.phone,
        customer.email || 'N/A',
        customer.document || 'N/A',
        customer.address ? `${customer.address}${customer.address_number ? `, ${customer.address_number}` : ''}` : 'N/A'
      ];
      tableRows.push(customerData);
    });

    // @ts-ignore
    doc.autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 40,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [249, 115, 22] } // orange-500
    });

    doc.save(`relatorio_clientes_${formatDate(new Date().toISOString()).replace(/\//g, '-')}.pdf`);
  };

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
        <div className="flex items-center gap-3">
          <button
            onClick={exportToPDF}
            className="px-4 py-3 bg-white border border-orange-200 hover:bg-orange-50 text-orange-600 rounded-xl font-semibold flex items-center gap-2 transition-all"
            title="Exportar para PDF"
          >
            <FileText className="w-5 h-5" />
            Exportar PDF
          </button>
          <button 
            onClick={() => {
              setEditingCustomer(null);
              setFormData({ name: '', email: '', phone: '', cep: '', document: '', address: '', address_number: '' });
              setIsModalOpen(true);
            }}
            className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 shadow-lg shadow-orange-200 transition-all"
          >
            <Plus className="w-5 h-5" />
            Novo Cliente
          </button>
        </div>
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
                          <MapPin className="w-3 h-3" /> {customer.address ? `${customer.address}${customer.address_number ? `, ${customer.address_number}` : ''}` : 'Sem endereço'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-gray-700 flex items-center gap-2">
                          <Phone className="w-3 h-3 text-orange-400" /> {customer.phone}
                        </p>
                        {customer.phone && (
                          <a 
                            href={getWhatsAppLink(customer.phone)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                            title="Abrir no WhatsApp"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        )}
                      </div>
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
                        onClick={() => handleViewHistory(customer)}
                        className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-all"
                        title="Ver Histórico (OS)"
                      >
                        <History className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => {
                          setEditingCustomer(customer);
                          setFormData({
                            name: customer.name || '',
                            email: customer.email || '',
                            phone: customer.phone || '',
                            cep: customer.cep || '',
                            document: customer.document || '',
                            address: customer.address || '',
                            address_number: customer.address_number || ''
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
                    value={formData.name || ''}
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
                      value={formData.phone || ''}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                    <input 
                      type="email" 
                      className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                      value={formData.email || ''}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CPF / CNPJ</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                      value={formData.document || ''}
                      onChange={e => setFormData({...formData, document: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
                    <input 
                      type="text" 
                      maxLength={8}
                      placeholder="00000000"
                      className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                      value={formData.cep || ''}
                      onChange={e => handleCepChange(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Endereço Completo</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                      value={formData.address || ''}
                      onChange={e => setFormData({...formData, address: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                      value={formData.address_number || ''}
                      onChange={e => setFormData({...formData, address_number: e.target.value})}
                    />
                  </div>
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
      {/* History Modal */}
      {isHistoryModalOpen && selectedCustomerForHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-orange-100 flex justify-between items-center bg-orange-50 shrink-0">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Histórico do Cliente</h2>
                <p className="text-sm text-gray-600">{selectedCustomerForHistory.name}</p>
              </div>
              <button onClick={() => setIsHistoryModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-orange-600" />
                Ordens de Serviço ({customerHistory.length})
              </h3>
              
              {isLoadingHistory ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div>
                </div>
              ) : customerHistory.length > 0 ? (
                <div className="space-y-4">
                  {customerHistory.map(os => (
                    <div key={os.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-bold text-gray-900">{os.device}</p>
                          <p className="text-xs text-gray-500">{formatDate(os.createdAt)}</p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1
                          ${os.status === 'completed' ? 'bg-green-100 text-green-700' : 
                            os.status === 'delivered' ? 'bg-purple-100 text-purple-700' :
                            os.status === 'in-progress' ? 'bg-blue-100 text-blue-700' : 
                            'bg-yellow-100 text-yellow-700'}`}
                        >
                          {os.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                          {os.status === 'in-progress' && <Clock className="w-3 h-3" />}
                          {os.status === 'pending' && <AlertCircle className="w-3 h-3" />}
                          {os.status === 'delivered' && <CheckCircle2 className="w-3 h-3" />}
                          {os.status === 'completed' ? 'Pronto' : 
                           os.status === 'delivered' ? 'Entregue' :
                           os.status === 'in-progress' ? 'Em Reparo' : 'Pendente'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mb-2"><span className="font-semibold">Defeito:</span> {os.problem}</p>
                      <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-50">
                        <p className="text-xs text-gray-500">OS: {os.id?.substring(0,8)}</p>
                        <p className="font-bold text-orange-600">{formatCurrency(os.totalValue)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-white rounded-xl border border-dashed border-gray-200">
                  <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Nenhuma Ordem de Serviço encontrada.</p>
                </div>
              )}
            </div>
            
            <div className="p-6 border-t border-gray-100 bg-white shrink-0">
              <button
                type="button"
                onClick={() => setIsHistoryModalOpen(false)}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-xl font-semibold transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
