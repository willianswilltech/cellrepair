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
  XCircle
} from 'lucide-react';
import { supabase } from '../supabase';
import { formatCurrency, formatDate } from '../utils/format';

export default function SalesHistory({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [isLoading, setIsLoading] = useState(true);
  const [sales, setSales] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [saleToDelete, setSaleToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
  }, []);

  const fetchSales = async () => {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100); // Limite para acelerar o carregamento
    
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
            .single();
          
          if (fetchError) {
            console.error(`Erro ao buscar produto ${item.productId}:`, fetchError);
            continue;
          }

          // Incrementar o estoque
          const { error: updateError } = await supabase
            .from('products')
            .update({ stock: (product.stock || 0) + (item.quantity || 0) })
            .eq('id', item.productId);
          
          if (updateError) {
            console.error(`Erro ao atualizar estoque do produto ${item.productId}:`, updateError);
          }
        }
      }

      // 3. Excluir a venda
      const { error } = await supabase
        .from('sales')
        .delete()
        .eq('id', saleToDelete);
      
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
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
                    <button 
                      onClick={() => handleDelete(sale.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
    </div>
  );
}
