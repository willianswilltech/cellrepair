// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  AlertTriangle,
  Package,
  Filter,
  Camera,
  X
} from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { supabase } from '../supabase';
import { Product, Category } from '../types';
import { formatCurrency } from '../utils/format';

export default function Inventory({ user }: { user: any }) {
  const [isLoading, setIsLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = React.useRef<Html5QrcodeScanner | null>(null);
  
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
    name: '',
    description: '',
    price: 0,
    cost: 0,
    stock: 0,
    category: '',
    categoryId: '',
    barcode: ''
  });

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([fetchProducts(), fetchCategories()]);
      setIsLoading(false);
    };
    init();

    // Subscribe to products changes
    const productsChannel = supabase
      .channel('products_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        fetchProducts();
      })
      .subscribe();

    // Subscribe to categories changes
    const categoriesChannel = supabase
      .channel('categories_changes_inventory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
        console.log('Inventory.tsx: Mudança em categorias detectada via Realtime');
        fetchCategories();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(productsChannel);
      supabase.removeChannel(categoriesChannel);
      if (scannerRef.current) {
        scannerRef.current.clear();
      }
    };
  }, []);

  useEffect(() => {
    if (isScanning) {
      const scanner = new Html5QrcodeScanner(
        "inventory-reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
      );
      
      scanner.render((decodedText) => {
        setFormData(prev => ({ ...prev, barcode: decodedText }));
        setIsScanning(false);
        try {
          scanner.clear();
        } catch (e) {
          console.error("Erro ao limpar scanner:", e);
        }
      }, (error) => {
        // console.warn(error);
      });

      scannerRef.current = scanner;
    } else {
      if (scannerRef.current) {
        try {
          scannerRef.current.clear();
        } catch (e) {
          console.error("Erro ao limpar scanner:", e);
        }
        scannerRef.current = null;
      }
    }
    
    return () => {
      if (scannerRef.current) {
        try {
          scannerRef.current.clear();
        } catch (e) {
          // ignore
        }
      }
    };
  }, [isScanning]);

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', user.id)
      .order('name')
      .limit(200);
    
    if (error) {
      console.error('Error fetching products:', error);
    } else {
      const mappedProducts = (data || []).map((p: any) => ({
        ...p,
        categoryId: p.category_id
      }));
      setProducts(mappedProducts);
    }
  };

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .order('name');
    
    if (error) {
      console.error('Inventory.tsx: Erro ao buscar categorias:', error);
    } else {
      console.log('Inventory.tsx: Categorias buscadas:', data?.length || 0);
      setCategories(data || []);
    }
  };

  const handleNumericChange = (field: string, value: string, isInteger: boolean = false) => {
    // Remove non-numeric characters except decimal point
    let cleaned = value.replace(isInteger ? /[^\d]/g : /[^\d.]/g, '');
    
    // Ensure only one decimal point
    if (!isInteger) {
      const parts = cleaned.split('.');
      if (parts.length > 2) {
        cleaned = parts[0] + '.' + parts.slice(1).join('');
      }
    }

    // Remove leading zeros unless it's "0." or just "0"
    if (cleaned.length > 1 && cleaned.startsWith('0') && cleaned[1] !== '.') {
      cleaned = cleaned.replace(/^0+/, '');
    }
    
    // If empty, default to 0 for the state but empty for the input display
    const numValue = cleaned === '' ? 0 : (isInteger ? parseInt(cleaned) : parseFloat(cleaned));
    
    setFormData({
      ...formData,
      [field]: isNaN(numValue) ? 0 : numValue
    });
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return null;
    
    console.log('Inventory.tsx: Tentando criar nova categoria:', newCategoryName.trim());
    try {
      // Primeiro verifica se já existe uma categoria com esse nome (case insensitive)
      const { data: existing } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', user.id)
        .ilike('name', newCategoryName.trim())
        .maybeSingle();

      if (existing) {
        console.log('Inventory.tsx: Categoria já existe:', existing);
        setFormData({
          ...formData,
          categoryId: existing.id,
          category: existing.name
        });
        setIsAddingCategory(false);
        setNewCategoryName('');
        return existing;
      }

      const { data, error } = await supabase
        .from('categories')
        .insert([{ 
          name: newCategoryName.trim(),
          user_id: user.id
        }])
        .select()
        .single();
        
      if (error) {
        console.error('Inventory.tsx: Erro ao inserir categoria:', error);
        throw error;
      }
      
      console.log('Inventory.tsx: Categoria criada com sucesso no banco:', data);
      
      // Atualiza a lista local de categorias
      await fetchCategories();
      
      setFormData({
        ...formData,
        categoryId: data.id,
        category: data.name
      });
      setIsAddingCategory(false);
      setNewCategoryName('');
      
      return data;
    } catch (error) {
      console.error("Inventory.tsx: Erro ao adicionar categoria:", error);
      alert('Erro ao adicionar categoria. Tente novamente.');
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      let currentCategoryId = formData.categoryId;
      let currentCategoryName = formData.category;

      // Se estiver no modo de adicionar categoria e tiver texto, cria a categoria primeiro
      if (isAddingCategory && newCategoryName.trim()) {
        const newCat = await handleAddCategory();
        if (newCat) {
          currentCategoryId = newCat.id;
          currentCategoryName = newCat.name;
        } else {
          throw new Error("Não foi possível criar a nova categoria.");
        }
      }

      if (!currentCategoryName) {
        throw new Error("Por favor, selecione ou crie uma categoria.");
      }

      const payload = {
        name: formData.name,
        description: formData.description,
        price: formData.price,
        cost: formData.cost,
        stock: formData.stock,
        category: currentCategoryName,
        category_id: currentCategoryId || null,
        barcode: formData.barcode,
        user_id: user.id
      };

      if (editingProduct) {
        const { error: submitError } = await supabase
          .from('products')
          .update({
            ...payload,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingProduct.id);
        if (submitError) throw submitError;
      } else {
        const { error: submitError } = await supabase
          .from('products')
          .insert([payload]);
        if (submitError) throw submitError;
      }
      
      await fetchProducts();
      setIsModalOpen(false);
      setEditingProduct(null);
      setFormData({ name: '', description: '', price: 0, cost: 0, stock: 0, category: '', categoryId: '', barcode: '' });
    } catch (err: any) {
      console.error("Erro ao salvar produto:", err);
      setError(err.message || "Ocorreu um erro ao salvar o produto. Verifique os dados e tente novamente.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    console.log('Tentando excluir produto ID:', id);
    if (!id) {
      alert('Erro: ID do produto não encontrado.');
      return;
    }
    setProductToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!productToDelete) return;
    
    try {
      const { error: deleteError } = await supabase
        .from('products')
        .delete()
        .eq('id', productToDelete)
        .eq('user_id', user.id);
      
      if (deleteError) {
        console.error('Erro retornado pelo Supabase:', deleteError);
        if (deleteError.code === '23503') {
          throw new Error('Este produto não pode ser excluído porque está vinculado a vendas ou ordens de serviço existentes.');
        }
        throw deleteError;
      }
      
      console.log('Produto excluído com sucesso');
      await fetchProducts();
      setIsDeleteModalOpen(false);
      setProductToDelete(null);
    } catch (err: any) {
      console.error('Erro ao excluir produto:', err);
      alert('Não foi possível excluir: ' + (err.message || 'Verifique se o produto possui vendas vinculadas.'));
      setIsDeleteModalOpen(false);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
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
          <h1 className="text-2xl font-bold text-gray-900">Estoque</h1>
          <p className="text-gray-500">Gerencie seus produtos e peças de reposição.</p>
        </div>
        <button 
          onClick={() => {
            setEditingProduct(null);
            setFormData({ name: '', description: '', price: 0, cost: 0, stock: 0, category: '', categoryId: '', barcode: '' });
            setIsModalOpen(true);
          }}
          className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 shadow-lg shadow-orange-200 transition-all"
        >
          <Plus className="w-5 h-5" />
          Novo Produto
        </button>
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden">
        <div className="p-4 border-b border-orange-50 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Buscar por nome ou categoria..." 
              className="w-full pl-10 pr-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-orange-50 rounded-xl transition-all">
            <Filter className="w-5 h-5" />
            Filtros
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-orange-50 text-orange-900 text-sm font-semibold">
              <tr>
                <th className="px-6 py-4 whitespace-nowrap">Produto</th>
                <th className="px-6 py-4 whitespace-nowrap">Categoria</th>
                <th className="px-6 py-4 whitespace-nowrap">Preço</th>
                <th className="px-6 py-4 whitespace-nowrap">Estoque</th>
                <th className="px-6 py-4 whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-50">
              {filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-orange-50/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="bg-orange-100 p-2 rounded-lg shrink-0">
                        <Package className="w-5 h-5 text-orange-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate max-w-[150px]">{product.name}</p>
                        <p className="text-xs text-gray-500 truncate max-w-[150px]">{product.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                      {product.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                    {formatCurrency(product.price)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${product.stock <= 5 ? 'text-red-600' : 'text-gray-900'}`}>
                        {product.stock} un
                      </span>
                      {product.stock <= 5 && <AlertTriangle className="w-4 h-4 text-red-500" />}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          setEditingProduct(product);
                          setFormData({
                            name: product.name,
                            description: product.description,
                            price: product.price,
                            cost: product.cost,
                            stock: product.stock,
                            category: product.category,
                            categoryId: product.categoryId || '',
                            barcode: product.barcode || ''
                          });
                          setIsModalOpen(true);
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(product.id!)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
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

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-orange-100 flex justify-between items-center bg-orange-50 shrink-0">
              <h2 className="text-xl font-bold text-gray-900">
                {editingProduct ? 'Editar Produto' : 'Novo Produto'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              {error && (
                <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Produto</label>
                  <input 
                    required
                    type="text" 
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Código de Barras</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      className="flex-1 px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                      value={formData.barcode}
                      onChange={e => setFormData({...formData, barcode: e.target.value})}
                      placeholder="Escaneie ou digite o código de barras"
                    />
                    <button 
                      type="button"
                      onClick={() => setIsScanning(!isScanning)}
                      className={`p-2 rounded-xl transition-all flex items-center justify-center ${
                        isScanning 
                          ? 'bg-red-100 text-red-600 border border-red-200' 
                          : 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                      }`}
                      title={isScanning ? "Fechar Leitor" : "Escanear com Câmera"}
                    >
                      {isScanning ? <X className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                {isScanning && (
                  <div className="sm:col-span-2 bg-white p-2 rounded-xl border border-orange-100 shadow-inner overflow-hidden relative">
                    <div id="inventory-reader" className="w-full"></div>
                    <p className="text-center text-[10px] text-gray-500 mt-2">
                      Aponte a câmera para o código de barras.
                    </p>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                  <textarea 
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preço de Venda</label>
                  <input 
                    required
                    type="text" 
                    inputMode="decimal"
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.price === 0 ? '' : formData.price}
                    onChange={e => handleNumericChange('price', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preço de Custo</label>
                  <input 
                    required
                    type="text" 
                    inputMode="decimal"
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.cost === 0 ? '' : formData.cost}
                    onChange={e => handleNumericChange('cost', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estoque Inicial</label>
                  <input 
                    required
                    type="text" 
                    inputMode="numeric"
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.stock === 0 ? '' : formData.stock}
                    onChange={e => handleNumericChange('stock', e.target.value, true)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                  {!isAddingCategory ? (
                    <div className="flex gap-2">
                      <select 
                        required
                        className="flex-1 min-w-0 px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm"
                        value={formData.categoryId}
                        onChange={e => {
                          const cat = categories.find(c => c.id === e.target.value);
                          if (cat) {
                            setFormData({
                              ...formData,
                              categoryId: cat.id,
                              category: cat.name
                            });
                          } else {
                            setFormData({
                              ...formData,
                              categoryId: '',
                              category: ''
                            });
                          }
                        }}
                      >
                        <option value="">Selecionar</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                      <button 
                        type="button"
                        onClick={() => setIsAddingCategory(true)}
                        className="p-2 bg-orange-100 text-orange-600 rounded-xl hover:bg-orange-200 transition-all shrink-0"
                        title="Nova Categoria"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <input 
                        autoFocus
                        type="text" 
                        placeholder="Nome"
                        className="flex-1 min-w-0 px-3 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm"
                        value={newCategoryName}
                        onChange={e => setNewCategoryName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCategory();
                          }
                          if (e.key === 'Escape') {
                            setIsAddingCategory(false);
                            setNewCategoryName('');
                          }
                        }}
                      />
                      <button 
                        type="button"
                        onClick={handleAddCategory}
                        className="px-2 py-2 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-all text-[10px] font-bold shrink-0"
                      >
                        OK
                      </button>
                      <button 
                        type="button"
                        onClick={() => {
                          setIsAddingCategory(false);
                          setNewCategoryName('');
                        }}
                        className="px-2 py-2 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-all text-[10px] font-bold shrink-0"
                      >
                        X
                      </button>
                    </div>
                  )}
                </div>
                <div className="sm:col-span-2 hidden">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Código de Barras / QR Code</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.barcode}
                    onChange={e => setFormData({...formData, barcode: e.target.value})}
                    placeholder="Escaneie ou digite o código"
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
                  {isSaving ? 'Salvando...' : 'Salvar Produto'}
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
              <h3 className="text-xl font-bold text-gray-900">Excluir Produto?</h3>
              <p className="text-gray-500">Esta ação não pode ser desfeita. O produto será removido permanentemente.</p>
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

function X({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
    </svg>
  );
}
