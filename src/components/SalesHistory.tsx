// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Trash2, 
  ShoppingCart, 
  Calendar,
  CreditCard,
  Banknote,
  QrCode,
  ArrowLeft,
  AlertCircle,
  XCircle,
  Edit,
  DollarSign,
  X,
  Printer
} from 'lucide-react';
import { supabase } from '../supabase';
import { formatCurrency, formatDate } from '../utils/format';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { format, startOfDay, endOfDay, parseISO, startOfWeek, startOfMonth, subDays } from 'date-fns';

export default function SalesHistory({ user, onNavigate }: { user: any, onNavigate?: (tab: string) => void }) {
  const [isLoading, setIsLoading] = useState(true);
  const [sales, setSales] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [saleToDelete, setSaleToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [dateRange, setDateRange] = useState({
    start: format(new Date(), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [saleToEdit, setSaleToEdit] = useState<any>(null);
  const [editFormData, setEditFormData] = useState({ payment_method: 'cash', total: '' });
  const [isEditing, setIsEditing] = useState(false);

  const formatCurrencyInput = (value: string) => {
    if (!value) return '';
    const digits = value.replace(/\D/g, '');
    const number = parseInt(digits) / 100;
    if (isNaN(number)) return '';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(number);
  };

  const parseCurrencyInput = (formattedValue: string) => {
    if (!formattedValue) return 0;
    const digits = formattedValue.replace(/\D/g, '');
    return parseInt(digits) / 100 || 0;
  };

  useEffect(() => {
    if (isDeleteModalOpen || isEditModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isDeleteModalOpen, isEditModalOpen]);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await fetchSales();
      setIsLoading(false);
    };
    init();

    const channel = supabase
      .channel('sales_changes')
      .on('postgres_changes', { event: '*', table: 'sales' }, () => {
        fetchSales();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dateRange]);

  const fetchSales = async () => {
    const start = startOfDay(parseISO(dateRange.start)).toISOString();
    const end = endOfDay(parseISO(dateRange.end)).toISOString();

    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching sales:', error);
    } else {
      setSales(data || []);
    }
  };

  const handleDelete = (id: string) => {
    setSaleToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const handleEdit = (sale: any) => {
    setSaleToEdit(sale);
    setEditFormData({
      payment_method: sale.payment_method,
      total: formatCurrencyInput((sale.total * 100).toString())
    });
    setIsEditModalOpen(true);
  };

  const confirmEdit = async () => {
    if (!saleToEdit) return;
    setIsEditing(true);
    try {
      const newTotal = parseCurrencyInput(editFormData.total);
      const { error } = await supabase
        .from('sales')
        .update({
          payment_method: editFormData.payment_method,
          total: newTotal
        })
        .eq('id', saleToEdit.id)
        .eq('user_id', user.id);

      if (error) throw error;
      
      setIsEditModalOpen(false);
      setSaleToEdit(null);
      fetchSales();
    } catch (error) {
      console.error("Erro ao editar venda:", error);
      alert("Erro ao editar venda.");
    } finally {
      setIsEditing(false);
    }
  };

  const confirmDelete = async () => {
    if (!saleToDelete) return;
    
    setIsDeleting(true);
    try {
      // 1. Encontrar a venda para saber quais itens devolver ao estoque
      const sale = sales.find(s => s.id === saleToDelete);
      
      if (sale && sale.items && Array.isArray(sale.items)) {
        // 2. Devolver itens ao estoque
        for (const item of sale.items) {
          if (!item.productId) continue;

          // Buscar estoque atual
          const { data: product, error: fetchError } = await supabase
            .from('products')
            .select('stock')
            .eq('id', item.productId)
            .eq('user_id', user.id)
            .single();
          
          if (fetchError) {
            console.error(`Erro ao buscar produto ${item.productId}:`, fetchError);
            continue;
          }

          // Incrementar o estoque
          const { error: updateError } = await supabase
            .from('products')
            .update({ stock: (product.stock || 0) + (item.quantity || 0) })
            .eq('id', item.productId)
            .eq('user_id', user.id);
          
          if (updateError) {
            console.error(`Erro ao atualizar estoque do produto ${item.productId}:`, updateError);
          }
        }
      }

      // 3. Excluir a venda
      const { error } = await supabase
        .from('sales')
        .delete()
        .eq('id', saleToDelete)
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      setIsDeleteModalOpen(false);
      setSaleToDelete(null);
    } catch (error: any) {
      console.error('Error deleting sale:', error);
      alert('Erro ao excluir venda: ' + (error.message || 'Verifique suas permissões.'));
    } finally {
      setIsDeleting(false);
    }
  };

  const getPaymentIcon = (method: string) => {
    switch (method) {
      case 'cash': return <Banknote className="w-4 h-4" />;
      case 'credit_card':
      case 'debit_card': return <CreditCard className="w-4 h-4" />;
      case 'pix': return <QrCode className="w-4 h-4" />;
      default: return <CreditCard className="w-4 h-4" />;
    }
  };

  const getPaymentLabel = (method: string) => {
    switch (method) {
      case 'cash': return 'Dinheiro';
      case 'credit_card': return 'Crédito';
      case 'debit_card': return 'Débito';
      case 'pix': return 'PIX';
      default: return method;
    }
  };

  const filteredSales = sales.filter(s => 
    s.payment_method.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.total.toString().includes(searchTerm)
  );

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Relatório de Vendas', 14, 22);
    
    doc.setFontSize(11);
    doc.text(`Período: ${formatDate(dateRange.start)} até ${formatDate(dateRange.end)}`, 14, 30);
    
    const tableColumn = ["Data", "Itens", "Método", "Total"];
    const tableRows: any[] = [];
    
    let totalPeriod = 0;

    filteredSales.forEach(sale => {
      const saleData = [
        formatDate(sale.created_at),
        sale.items.map((i: any) => `${i.quantity}x ${i.name}`).join(', '),
        getPaymentLabel(sale.payment_method),
        formatCurrency(sale.total)
      ];
      tableRows.push(saleData);
      totalPeriod += Number(sale.total);
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

    const finalY = (doc as any).lastAutoTable.finalY || 40;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Total do Período: ${formatCurrency(totalPeriod)}`, 14, finalY + 10);

    doc.save(`relatorio_vendas_${format(new Date(), 'dd-MM-yyyy')}.pdf`);
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
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {onNavigate && (
            <button 
              onClick={() => onNavigate('pos')}
              className="p-2 hover:bg-orange-100 text-orange-600 rounded-xl transition-all"
              title="Voltar ao PDV"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Histórico de Vendas</h1>
            <p className="text-gray-500">Visualize e gerencie todas as vendas realizadas.</p>
          </div>
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
            <button
              onClick={exportToPDF}
              className="ml-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold rounded-xl transition-colors flex items-center gap-2"
              title="Exportar para PDF"
            >
              <Printer className="w-4 h-4" />
              Exportar PDF
            </button>
          </div>
        </div>
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden">
        <div className="p-4 border-b border-orange-50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Buscar por valor ou método..." 
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
                <th className="px-6 py-4">Data</th>
                <th className="px-6 py-4">Itens</th>
                <th className="px-6 py-4">Pagamento</th>
                <th className="px-6 py-4">Total</th>
                <th className="px-6 py-4">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-50">
              {filteredSales.map((sale) => (
                <tr key={sale.id} className="hover:bg-orange-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span className="text-sm">{formatDate(sale.created_at)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      {sale.items.map((item: any, idx: number) => (
                        <p key={idx} className="text-xs text-gray-600">
                          {item.quantity}x {item.name}
                        </p>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-gray-700">
                      {getPaymentIcon(sale.payment_method)}
                      <span className="text-sm font-medium">{getPaymentLabel(sale.payment_method)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-bold text-orange-600">
                    {formatCurrency(sale.total)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleEdit(sale)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        title="Editar"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(sale.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Confirmação de Exclusão */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Excluir Venda?</h3>
              <p className="text-gray-500 text-sm mb-6">
                Tem certeza que deseja excluir este registro de venda? Os itens serão devolvidos ao estoque e o valor será estornado do caixa.
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

      {/* Modal de Edição */}
      {isEditModalOpen && saleToEdit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center gap-3 text-blue-600">
                <Edit className="w-6 h-6" />
                <h2 className="text-xl font-black uppercase tracking-tight">Editar Venda</h2>
              </div>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                disabled={isEditing}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Forma de Pagamento</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <button
                    onClick={() => setEditFormData({...editFormData, payment_method: 'cash'})}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                      editFormData.payment_method === 'cash' 
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700' 
                        : 'border-gray-200 hover:border-emerald-200 hover:bg-emerald-50 text-gray-500'
                    }`}
                  >
                    <Banknote className="w-6 h-6 mb-1" />
                    <span className="text-xs font-bold">Dinheiro</span>
                  </button>
                  <button
                    onClick={() => setEditFormData({...editFormData, payment_method: 'pix'})}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                      editFormData.payment_method === 'pix' 
                        ? 'border-teal-500 bg-teal-50 text-teal-700' 
                        : 'border-gray-200 hover:border-teal-200 hover:bg-teal-50 text-gray-500'
                    }`}
                  >
                    <QrCode className="w-6 h-6 mb-1" />
                    <span className="text-xs font-bold">PIX</span>
                  </button>
                  <button
                    onClick={() => setEditFormData({...editFormData, payment_method: 'debit_card'})}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                      editFormData.payment_method === 'debit_card' 
                        ? 'border-blue-500 bg-blue-50 text-blue-700' 
                        : 'border-gray-200 hover:border-blue-200 hover:bg-blue-50 text-gray-500'
                    }`}
                  >
                    <CreditCard className="w-6 h-6 mb-1" />
                    <span className="text-xs font-bold">Débito</span>
                  </button>
                  <button
                    onClick={() => setEditFormData({...editFormData, payment_method: 'credit_card'})}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                      editFormData.payment_method === 'credit_card' 
                        ? 'border-purple-500 bg-purple-50 text-purple-700' 
                        : 'border-gray-200 hover:border-purple-200 hover:bg-purple-50 text-gray-500'
                    }`}
                  >
                    <CreditCard className="w-6 h-6 mb-1" />
                    <span className="text-xs font-bold">Crédito</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Valor Total</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <DollarSign className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={editFormData.total}
                    onChange={e => setEditFormData({...editFormData, total: formatCurrencyInput(e.target.value)})}
                    className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent font-bold text-gray-900"
                    placeholder="R$ 0,00"
                    disabled={isEditing}
                  />
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="flex-1 py-3 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-100 transition-colors"
                disabled={isEditing}
              >
                Cancelar
              </button>
              <button 
                onClick={confirmEdit}
                disabled={isEditing || !editFormData.total}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isEditing ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  'Salvar Alterações'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
