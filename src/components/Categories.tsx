// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  LayoutDashboard,
  X,
  RefreshCw
} from 'lucide-react';
import { supabase } from '../supabase';
import { Category } from '../types';

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    console.log('Categories.tsx: Estado "categories" atualizado. Total:', categories.length);
    console.log('Categories.tsx: Lista atual:', categories.map(c => c.name).join(', '));
  }, [categories]);

  useEffect(() => {
    console.log('Categories.tsx: Componente montado. Iniciando busca inicial e Realtime...');
    fetchCategories();

    const channel = supabase
      .channel('categories_realtime_v2')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'categories' 
      }, (payload) => {
        console.log('Categories.tsx: MUDANÇA REALTIME DETECTADA!', payload);
        fetchCategories();
      })
      .subscribe((status) => {
        console.log('Categories.tsx: Status da inscrição Realtime (Categorias):', status);
      });

    return () => {
      console.log('Categories.tsx: Desinscrevendo do Realtime (Categorias)');
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      console.log('Categories.tsx: Chamando fetchCategories()...');
      const { data, error, count } = await supabase
        .from('categories')
        .select('*', { count: 'exact' })
        .order('name');
      
      if (error) throw error;
      console.log(`Categories.tsx: Busca concluída. Encontradas ${data?.length || 0} categorias.`);
      console.log('Categories.tsx: Nomes das categorias encontradas:', data?.map(c => c.name).join(', '));
      setCategories(data || []);
    } catch (error) {
      console.error('Categories.tsx: Erro ao buscar categorias:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchCategories();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCategory) {
        const { error } = await supabase
          .from('categories')
          .update({
            ...formData,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingCategory.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('categories')
          .insert({
            ...formData
          });
        if (error) throw error;
      }
      
      await fetchCategories();
      setIsModalOpen(false);
      setEditingCategory(null);
      setFormData({ name: '', description: '' });
    } catch (error) {
      console.error("Erro ao salvar categoria:", error);
    }
  };

  const handleDelete = async (id: string) => {
    setCategoryToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!categoryToDelete) return;
    
    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', categoryToDelete);
      
      if (error) throw error;
      
      await fetchCategories();
      setIsDeleteModalOpen(false);
      setCategoryToDelete(null);
    } catch (error) {
      console.error('Error deleting category:', error);
      alert('Erro ao excluir categoria. Verifique se existem produtos vinculados a ela.');
      setIsDeleteModalOpen(false);
    }
  };

  const filteredCategories = categories.filter(c => {
    const matches = c.name.toLowerCase().includes(searchTerm.toLowerCase());
    if (searchTerm && matches) {
      console.log(`Categories.tsx: Categoria "${c.name}" corresponde à busca "${searchTerm}"`);
    }
    return matches;
  });

  if (isLoading && categories.length === 0) {
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
          <h1 className="text-2xl font-bold text-gray-900">Categorias</h1>
          <p className="text-gray-500">Total: {categories.length} categorias cadastradas.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchCategories}
            disabled={isLoading}
            className="p-3 bg-white border border-orange-100 text-orange-600 rounded-xl hover:bg-orange-50 transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline font-semibold">Atualizar</span>
          </button>
          <button 
            onClick={() => {
              setEditingCategory(null);
              setFormData({ name: '', description: '' });
              setIsModalOpen(true);
            }}
            className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 shadow-lg shadow-orange-200 transition-all"
          >
            <Plus className="w-5 h-5" />
            Nova Categoria
          </button>
        </div>
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden max-w-2xl">
        <div className="p-4 border-b border-orange-50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Buscar categoria..." 
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
                <th className="px-6 py-4 whitespace-nowrap">Nome</th>
                <th className="px-6 py-4 whitespace-nowrap">Descrição</th>
                <th className="px-6 py-4 whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-50">
              {filteredCategories.map((category) => (
                <tr key={category.id} className="hover:bg-orange-50/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="bg-orange-100 p-2 rounded-lg shrink-0">
                        <LayoutDashboard className="w-5 h-5 text-orange-600" />
                      </div>
                      <span className="font-semibold text-gray-900 truncate max-w-[150px]">{category.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                    <span className="truncate block max-w-[200px]">
                      {category.description || 'Sem descrição'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          setEditingCategory(category);
                          setFormData({
                            name: category.name,
                            description: category.description || ''
                          });
                          setIsModalOpen(true);
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(category.id!)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCategories.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-gray-400">
                    Nenhuma categoria encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-orange-100 flex justify-between items-center bg-orange-50">
              <h2 className="text-xl font-bold text-gray-900">
                {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Categoria</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição (Opcional)</label>
                <textarea 
                  className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  rows={3}
                />
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
                  className="flex-1 px-6 py-3 bg-orange-600 text-white font-semibold rounded-xl hover:bg-orange-700 shadow-lg shadow-orange-200 transition-all"
                >
                  Salvar Categoria
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
              <h3 className="text-xl font-bold text-gray-900">Excluir Categoria?</h3>
              <p className="text-gray-500">Esta ação não pode ser desfeita. A categoria será removida permanentemente.</p>
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
