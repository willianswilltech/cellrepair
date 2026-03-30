import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Trash2, 
  DollarSign, 
  Calendar, 
  Tag, 
  CheckCircle2, 
  AlertCircle,
  X,
  Edit2,
  Repeat,
  CreditCard,
  Banknote,
  QrCode
} from 'lucide-react';
import { supabase } from '../supabase';
import { formatCurrency, formatDate } from '../utils/format';

interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  due_date: string;
  status: 'pending' | 'paid';
  is_recurring: boolean;
  frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  payment_method?: 'cash' | 'pix' | 'debit_card' | 'credit_card';
  paid_at?: string;
  created_at: string;
}

export default function Expenses({ user, isActive = true }: { user: any, isActive?: boolean }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    category: '',
    due_date: new Date().toISOString().split('T')[0],
    status: 'pending' as 'pending' | 'paid',
    is_recurring: false,
    frequency: 'monthly' as 'daily' | 'weekly' | 'monthly' | 'yearly',
    payment_method: 'cash' as 'cash' | 'pix' | 'debit_card' | 'credit_card'
  });

  const categories = [
    'Aluguel',
    'Energia',
    'Água',
    'Internet',
    'Peças',
    'Ferramentas',
    'Marketing',
    'Outros'
  ];

  useEffect(() => {
    if (user?.id && isActive) {
      fetchExpenses();
      fetchActiveSession();
    }
  }, [user?.id, isActive]);

  const fetchActiveSession = async () => {
    try {
      const { data, error } = await supabase
        .from('cashier_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .maybeSingle();

      if (error) throw error;
      setActiveSession(data);
    } catch (error) {
      console.error('Error fetching active session:', error);
    }
  };

  const fetchExpenses = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('user_id', user.id)
        .order('due_date', { ascending: false });

      if (error) throw error;
      setExpenses(data || []);
    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Submitting expense form...', formData);
    
    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      alert('Por favor, insira um valor válido para a despesa.');
      return;
    }

    if (formData.status === 'paid' && !activeSession) {
      alert('⚠️ CAIXA FECHADO: Abra o caixa para registrar o pagamento desta despesa.');
      return;
    }

    setIsSaving(true);
    try {
      console.log('Saving expense...', { ...formData, amount });
      const payload: any = {
        description: formData.description,
        amount: amount,
        category: formData.category,
        due_date: formData.due_date,
        status: formData.status,
        is_recurring: formData.is_recurring,
        frequency: formData.is_recurring ? formData.frequency : null,
        payment_method: formData.payment_method,
        user_id: user.id,
        paid_at: formData.status === 'paid' ? new Date().toISOString() : null
      };

      if (editingExpense) {
        console.log('Updating existing expense...', editingExpense.id);
        const { error } = await supabase
          .from('expenses')
          .update(payload)
          .eq('id', editingExpense.id)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        console.log('Inserting new expense...');
        const { error } = await supabase
          .from('expenses')
          .insert([payload]);
        if (error) throw error;

        // If marked as paid on creation, record cashier movement
        if (formData.status === 'paid' && activeSession) {
          console.log('Recording cashier movement...');
          const { error: movementError } = await supabase
            .from('cashier_movements')
            .insert([{
              user_id: user.id,
              session_id: activeSession.id,
              type: 'sangria',
              amount: amount,
              description: `Pagamento de Despesa: ${formData.description}`,
              payment_method: formData.payment_method
            }]);
          if (movementError) console.error('Erro ao registrar movimento de caixa:', movementError);
        }
      }
      
      console.log('Expense saved successfully!');
      setIsModalOpen(false);
      setEditingExpense(null);
      resetForm();
      await fetchExpenses();
    } catch (error: any) {
      console.error('Erro ao salvar despesa:', error);
      alert('Erro ao salvar despesa: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      description: '',
      amount: '',
      category: '',
      due_date: new Date().toISOString().split('T')[0],
      status: 'pending',
      is_recurring: false,
      frequency: 'monthly',
      payment_method: 'cash'
    });
  };

  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setFormData({
      description: expense.description || '',
      amount: expense.amount.toString(),
      category: expense.category || '',
      due_date: expense.due_date,
      status: expense.status,
      is_recurring: expense.is_recurring,
      frequency: expense.frequency || 'monthly',
      payment_method: expense.payment_method || 'cash'
    });
    setIsModalOpen(true);
  };

  const toggleStatus = async (expense: Expense) => {
    try {
      const newStatus = expense.status === 'paid' ? 'pending' : 'paid';
      
      if (newStatus === 'paid') {
        if (!activeSession) {
          alert('⚠️ CAIXA FECHADO: Abra o caixa para registrar o pagamento da despesa.');
          return;
        }

        // Record cashier movement (sangria)
        const { error: movementError } = await supabase
          .from('cashier_movements')
          .insert([{
            user_id: user.id,
            session_id: activeSession.id,
            type: 'sangria',
            amount: expense.amount,
            description: `Pagamento de Despesa: ${expense.description}`,
            payment_method: expense.payment_method || 'cash'
          }]);
        
        if (movementError) throw movementError;

        // If recurring, create next expense
        if (expense.is_recurring) {
          const nextDueDate = new Date(expense.due_date);
          if (expense.frequency === 'monthly') nextDueDate.setMonth(nextDueDate.getMonth() + 1);
          else if (expense.frequency === 'weekly') nextDueDate.setDate(nextDueDate.getDate() + 7);
          else if (expense.frequency === 'daily') nextDueDate.setDate(nextDueDate.getDate() + 1);
          else if (expense.frequency === 'yearly') nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);

          await supabase.from('expenses').insert([{
            user_id: user.id,
            description: expense.description,
            amount: expense.amount,
            category: expense.category,
            due_date: nextDueDate.toISOString().split('T')[0],
            status: 'pending',
            is_recurring: true,
            frequency: expense.frequency,
            payment_method: expense.payment_method
          }]);
        }
      }

      const { error } = await supabase
        .from('expenses')
        .update({ 
          status: newStatus,
          paid_at: newStatus === 'paid' ? new Date().toISOString() : null
        })
        .eq('id', expense.id);

      if (error) throw error;
      fetchExpenses();
    } catch (error: any) {
      alert('Erro ao atualizar status: ' + error.message);
    }
  };

  const deleteExpense = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta despesa?')) return;
    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchExpenses();
    } catch (error: any) {
      alert('Erro ao excluir despesa: ' + error.message);
    }
  };

  const filteredExpenses = expenses.filter(e => 
    e.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPending = expenses
    .filter(e => e.status === 'pending')
    .reduce((acc, curr) => acc + curr.amount, 0);

  const totalPaid = expenses
    .filter(e => e.status === 'paid')
    .reduce((acc, curr) => acc + curr.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900">Gestão de Despesas</h1>
          <p className="text-gray-500 font-medium">Controle seus custos e saiba seu lucro real.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-orange-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-orange-700 transition-all shadow-lg shadow-orange-200"
        >
          <Plus className="w-5 h-5" />
          Nova Despesa
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-orange-100 shadow-sm">
          <div className="flex items-center gap-4 mb-2">
            <div className="bg-red-100 p-3 rounded-2xl">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <span className="text-gray-500 font-bold">Total Pendente</span>
          </div>
          <p className="text-3xl font-black text-red-600">{formatCurrency(totalPending)}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-orange-100 shadow-sm">
          <div className="flex items-center gap-4 mb-2">
            <div className="bg-green-100 p-3 rounded-2xl">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <span className="text-gray-500 font-bold">Total Pago</span>
          </div>
          <p className="text-3xl font-black text-green-600">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-orange-100 shadow-sm">
          <div className="flex items-center gap-4 mb-2">
            <div className="bg-orange-100 p-3 rounded-2xl">
              <DollarSign className="w-6 h-6 text-orange-600" />
            </div>
            <span className="text-gray-500 font-bold">Total Geral</span>
          </div>
          <p className="text-3xl font-black text-gray-900">{formatCurrency(totalPending + totalPaid)}</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-orange-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-orange-100">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Buscar despesa..." 
              className="w-full pl-10 pr-4 py-3 bg-orange-50/20 border border-orange-100 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-orange-50/50">
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Descrição</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Categoria</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Vencimento</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Valor</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-50">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500 mx-auto"></div>
                  </td>
                </tr>
              ) : filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500 font-medium">
                    Nenhuma despesa encontrada.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-orange-50/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-bold text-gray-900">{expense.description}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-bold">
                        {expense.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="w-4 h-4" />
                        {formatDate(expense.due_date)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-black text-gray-900">{formatCurrency(expense.amount)}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button 
                        onClick={() => toggleStatus(expense)}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                          expense.status === 'paid' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {expense.status === 'paid' ? 'Pago' : 'Pendente'}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                      <button 
                        onClick={() => handleEdit(expense)}
                        className="p-2 text-orange-600 hover:bg-orange-50 rounded-xl transition-all"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => deleteExpense(expense.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-black text-gray-900">{editingExpense ? 'Editar Despesa' : 'Nova Despesa'}</h3>
              <button onClick={() => { setIsModalOpen(false); setEditingExpense(null); resetForm(); }} className="p-2 hover:bg-gray-100 rounded-full transition-all">
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-bold text-gray-700">Descrição</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-4 py-3 bg-orange-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none"
                  value={formData.description || ''}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-bold text-gray-700">Valor</label>
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    className="w-full px-4 py-3 bg-orange-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.amount || ''}
                    onChange={e => setFormData({...formData, amount: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-bold text-gray-700">Vencimento</label>
                  <input 
                    required
                    type="date" 
                    className="w-full px-4 py-3 bg-orange-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.due_date || ''}
                    onChange={e => setFormData({...formData, due_date: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-bold text-gray-700">Categoria</label>
                  <select 
                    required
                    className="w-full px-4 py-3 bg-orange-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.category || ''}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                  >
                    <option value="">Selecione...</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-bold text-gray-700">Pagamento</label>
                  <select 
                    required
                    className="w-full px-4 py-3 bg-orange-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.payment_method || 'cash'}
                    onChange={e => setFormData({...formData, payment_method: e.target.value as any})}
                  >
                    <option value="cash">Dinheiro</option>
                    <option value="pix">PIX</option>
                    <option value="debit_card">Débito</option>
                    <option value="credit_card">Crédito</option>
                  </select>
                </div>
              </div>

              <div className="p-4 bg-orange-50 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Repeat className="w-5 h-5 text-orange-600" />
                    <label htmlFor="isRecurring" className="text-sm font-bold text-gray-700">Recorrente?</label>
                  </div>
                  <input 
                    type="checkbox" 
                    id="isRecurring"
                    className="w-5 h-5 rounded border-orange-200 text-orange-600 focus:ring-orange-500"
                    checked={formData.is_recurring}
                    onChange={e => setFormData({...formData, is_recurring: e.target.checked})}
                  />
                </div>

                {formData.is_recurring && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase">Frequência</label>
                    <select 
                      className="w-full px-4 py-2 bg-white border border-orange-100 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm"
                      value={formData.frequency || 'monthly'}
                      onChange={e => setFormData({...formData, frequency: e.target.value as any})}
                    >
                      <option value="daily">Diário</option>
                      <option value="weekly">Semanal</option>
                      <option value="monthly">Mensal</option>
                      <option value="yearly">Anual</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="isPaid"
                  className="w-5 h-5 rounded border-orange-200 text-orange-600 focus:ring-orange-500"
                  checked={formData.status === 'paid'}
                  onChange={e => setFormData({...formData, status: e.target.checked ? 'paid' : 'pending'})}
                />
                <label htmlFor="isPaid" className="text-sm font-bold text-gray-700">Já está pago?</label>
              </div>

              <button 
                type="submit"
                disabled={isSaving}
                className="w-full bg-orange-600 text-white font-black py-4 rounded-2xl hover:bg-orange-700 transition-all shadow-lg shadow-orange-200 disabled:opacity-50"
              >
                {isSaving ? 'Salvando...' : editingExpense ? 'Salvar Alterações' : 'Cadastrar Despesa'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
