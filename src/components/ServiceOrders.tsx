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
  Trash2,
  Banknote,
  CreditCard,
  QrCode,
  MessageCircle,
  Printer,
  ShieldCheck,
  UserCheck,
  Camera as CameraIcon,
  X,
  LayoutGrid,
  List,
  FileText
} from 'lucide-react';
import { supabase } from '../supabase';
import { ServiceOrder, Customer } from '../types';
import { formatCurrency, formatDate, formatCurrencyInput, parseCurrencyInput } from '../utils/format';
import { fetchAddressByCep } from '../utils/cep';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

export default function ServiceOrders({ user, isActive = true }: { user: any, isActive?: boolean }) {
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);
  const [deliveringOrder, setDeliveringOrder] = useState<ServiceOrder | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'cash' | 'credit_card' | 'debit_card' | 'pix'>('cash');
  const [printAfterSave, setPrintAfterSave] = useState(false);
  const [printWarrantyAfterDelivery, setPrintWarrantyAfterDelivery] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

  const [editingOrder, setEditingOrder] = useState<ServiceOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
        setIsDeleteModalOpen(false);
        setIsDeliveryModalOpen(false);
        setEditingOrder(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isModalOpen || isDeleteModalOpen || isDeliveryModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isModalOpen, isDeleteModalOpen, isDeliveryModalOpen]);

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
    status: 'pending' as const,
    warrantyPeriod: '90 dias',
    technicianId: '',
    technicianName: '',
    partsUsed: [] as any[]
  });

  // Auto-calculate total value when parts change
  useEffect(() => {
    const partsTotal = formData.partsUsed.reduce((acc, part) => acc + (part.price * part.quantity), 0);
    setFormData(prev => ({ ...prev, totalValue: partsTotal }));
  }, [formData.partsUsed]);

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
      await Promise.all([fetchOrders(), fetchCustomers(), fetchTechnicians(), fetchProducts(), fetchProfile()]);
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
      .on('postgres_changes', { event: '*', table: 'products' }, () => {
        fetchProducts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', user.id)
      .order('name');
    if (error) console.error('Erro ao buscar produtos:', error);
    else setProducts(data || []);
  };

  const fetchProfile = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (error) console.error('Erro ao buscar perfil:', error);
    else setProfile(data);
  };

  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from('service_orders')
      .select('*')
      .eq('user_id', user.id)
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
        partsUsed: o.parts_used || [],
        observations: o.observations,
        warrantyPeriod: o.warranty_period,
        technicianId: o.technician_id,
        technicianName: o.technician_name,
        commissionValue: o.commission_value,
        entryPhotos: o.entry_photos,
        exitPhotos: o.exit_photos,
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
      .eq('user_id', user.id)
      .order('name');
    
    if (error) {
      console.error('Error fetching customers:', error);
    } else {
      setCustomers(data || []);
    }
  };

  const fetchTechnicians = async () => {
    const { data, error } = await supabase
      .from('technicians')
      .select('*')
      .eq('user_id', user.id)
      .order('name');
    
    if (error) {
      console.error('Error fetching technicians:', error);
    } else {
      setTechnicians(data || []);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const selectedTech = technicians.find(t => t.id === formData.technicianId);
      const commissionValue = selectedTech ? (formData.totalValue * (selectedTech.commission_percentage / 100)) : 0;

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
        status: formData.status,
        warranty_period: formData.warrantyPeriod,
        technician_id: formData.technicianId || null,
        technician_name: selectedTech?.name || '',
        commission_value: commissionValue,
        parts_used: formData.partsUsed
      };

      let createdOrder = null;

      if (editingOrder) {
        // Calculate difference in parts to update stock
        const oldParts = editingOrder.partsUsed || [];
        const newParts = formData.partsUsed || [];

        for (const newPart of newParts) {
          const oldPart = oldParts.find((p: any) => p.productId === newPart.productId);
          const oldQuantity = oldPart ? oldPart.quantity : 0;
          const diff = newPart.quantity - oldQuantity;
          
          if (diff !== 0) {
            const product = products.find(p => p.id === newPart.productId);
            if (product) {
              await supabase
                .from('products')
                .update({ stock: product.stock - diff })
                .eq('id', product.id)
                .eq('user_id', user.id);
            }
          }
        }

        for (const oldPart of oldParts) {
          const newPart = newParts.find((p: any) => p.productId === oldPart.productId);
          if (!newPart) {
            // Part was removed, add back to stock
            const product = products.find(p => p.id === oldPart.productId);
            if (product) {
              await supabase
                .from('products')
                .update({ stock: product.stock + oldPart.quantity })
                .eq('id', product.id)
                .eq('user_id', user.id);
            }
          }
        }

        const { error: submitError } = await supabase
          .from('service_orders')
          .update({
            ...payload,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingOrder.id)
          .eq('user_id', user.id);
        if (submitError) throw submitError;
      } else {
        // Deduct stock for new order
        for (const part of formData.partsUsed) {
          const product = products.find(p => p.id === part.productId);
          if (product) {
            await supabase
              .from('products')
              .update({ stock: product.stock - part.quantity })
              .eq('id', product.id)
              .eq('user_id', user.id);
          }
        }

        const { data: newOrder, error: submitError } = await supabase
          .from('service_orders')
          .insert({
            ...payload,
            user_id: user.id
          })
          .select()
          .single();
        if (submitError) throw submitError;
        createdOrder = newOrder;
      }

      await fetchOrders();
      await fetchProducts(); // Refresh products stock
      setIsModalOpen(false);
      
      // If we need to print after save
      if (!editingOrder && printAfterSave && createdOrder) {
        printEntryTerm({
          id: createdOrder.id,
          customerId: createdOrder.customer_id,
          customerName: createdOrder.customer_name,
          customerPhone: createdOrder.customer_phone,
          cep: createdOrder.cep,
          address: createdOrder.address,
          device: createdOrder.device,
          problem: createdOrder.problem,
          status: createdOrder.status,
          totalValue: createdOrder.total_value,
          partsUsed: createdOrder.parts_used,
          observations: createdOrder.observations,
          createdAt: createdOrder.created_at,
          updatedAt: createdOrder.updated_at,
          warrantyPeriod: createdOrder.warranty_period,
          technicianId: createdOrder.technician_id,
          technicianName: createdOrder.technician_name
        });
      }

      setPrintAfterSave(false);
      setEditingOrder(null);
      setFormData({ 
        customerId: '', 
        customerName: '', 
        customerPhone: '', 
        cep: '', 
        address: '', 
        device: '', 
        problem: '', 
        observations: '', 
        totalValue: 0, 
        status: 'pending',
        warrantyPeriod: '90 dias',
        technicianId: '',
        technicianName: '',
        partsUsed: []
      });
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
      const order = orders.find(o => o.id === orderToDelete);
      if (order && order.partsUsed) {
        for (const part of order.partsUsed) {
          const product = products.find(p => p.id === part.productId);
          if (product) {
            await supabase
              .from('products')
              .update({ stock: product.stock + part.quantity })
              .eq('id', product.id)
              .eq('user_id', user.id);
          }
        }
      }

      const { error: deleteError } = await supabase
        .from('service_orders')
        .delete()
        .eq('id', orderToDelete)
        .eq('user_id', user.id);
      
      if (deleteError) throw deleteError;
      
      console.log('OS excluída com sucesso');
      await fetchOrders();
      await fetchProducts(); // Refresh products stock
      setIsDeleteModalOpen(false);
      setOrderToDelete(null);
    } catch (err: any) {
      console.error('Erro ao excluir OS:', err);
      alert('Erro ao excluir OS: ' + (err.message || 'Verifique suas permissões.'));
      setIsDeleteModalOpen(false);
    }
  };

  const updateStatus = async (id: string, newStatus: ServiceOrder['status'], paymentMethod?: string) => {
    try {
      const updateData = {
        status: newStatus,
        updated_at: new Date().toISOString()
      };

      if (paymentMethod) {
        updateData.payment_method = paymentMethod;
      }

      const { error } = await supabase
        .from('service_orders')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      await fetchOrders();
      // Feedback visual opcional
      if (newStatus === 'delivered') {
        if (printWarrantyAfterDelivery && deliveringOrder) {
          printWarrantyTerm(deliveringOrder);
        }
        setIsDeliveryModalOpen(false);
        setDeliveringOrder(null);
        setTimeout(() => {
          alert("Ordem de Serviço entregue e finalizada com sucesso!");
        }, 500);
      }
    } catch (error: any) {
      console.error('Error updating status:', error);
      alert('Erro ao atualizar status: ' + (error.message || 'Verifique suas permissões.'));
    }
  };

  const handleDeliverClick = (order: ServiceOrder) => {
    setDeliveringOrder(order);
    setIsDeliveryModalOpen(true);
  };

  const confirmDelivery = async () => {
    if (!deliveringOrder) return;
    await updateStatus(deliveringOrder.id!, 'delivered', selectedPaymentMethod);
  };

  const notifyWhatsApp = (order: ServiceOrder, type: 'budget' | 'ready' | 'delivered' = 'ready') => {
    let message = '';
    const storeName = profile?.store_name || 'CellRepair';
    
    if (type === 'budget') {
      message = `Olá ${order.customerName}, o orçamento do seu ${order.device} ficou em ${formatCurrency(order.totalValue)}. Podemos aprovar o serviço? - ${storeName}`;
    } else if (type === 'ready') {
      message = `Olá ${order.customerName}, seu aparelho ${order.device} já está pronto na ${storeName}! Valor total: ${formatCurrency(order.totalValue)}. Garantia de ${order.warrantyPeriod || '90 dias'}. Pode vir retirar quando quiser!`;
    } else if (type === 'delivered') {
      message = `Olá ${order.customerName}, obrigado por escolher a ${storeName}! Seu aparelho ${order.device} foi entregue. Qualquer dúvida, estamos à disposição. Garantia: ${order.warrantyPeriod || '90 dias'}.`;
    }
    
    const phone = order.customerPhone.replace(/\D/g, '');
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const printReceipt = (order: ServiceOrder) => {
    const doc = new jsPDF({
      unit: 'mm',
      format: [80, 200] // Aumentado para caber mais dados
    });

    const storeName = profile?.store_name || 'CELLREPAIR PRO';
    const storeCnpj = profile?.cnpj || '';
    const storePhone = profile?.phone || '';
    const storeAddress = profile?.address || '';

    doc.setFontSize(12);
    doc.text(storeName.toUpperCase(), 40, 10, { align: 'center' });
    doc.setFontSize(8);
    if (storeCnpj) doc.text(`CNPJ: ${storeCnpj}`, 40, 15, { align: 'center' });
    if (storePhone) doc.text(`Tel: ${storePhone}`, 40, 20, { align: 'center' });
    if (storeAddress) {
      const splitAddress = doc.splitTextToSize(storeAddress, 70);
      doc.text(splitAddress, 40, 25, { align: 'center' });
    }
    
    const startY = storeAddress ? 35 : 25;
    doc.text('Comprovante de Serviço', 40, startY, { align: 'center' });
    doc.text('------------------------------------------', 40, startY + 5, { align: 'center' });
    
    let currentY = startY + 10;
    doc.text(`OS: ${order.id?.substring(0, 8)}`, 5, currentY);
    currentY += 5;
    doc.text(`Data: ${formatDate(order.createdAt!)}`, 5, currentY);
    currentY += 5;
    doc.text(`Cliente: ${order.customerName}`, 5, currentY);
    currentY += 5;
    doc.text(`Aparelho: ${order.device}`, 5, currentY);
    currentY += 5;
    doc.text(`Defeito: ${order.problem}`, 5, currentY);
    currentY += 5;
    doc.text(`Garantia: ${order.warrantyPeriod || '90 dias'}`, 5, currentY);
    currentY += 5;
    doc.text(`Técnico: ${order.technicianName || 'N/A'}`, 5, currentY);
    
    currentY += 5;
    doc.text('------------------------------------------', 40, currentY, { align: 'center' });
    currentY += 5;
    doc.setFontSize(10);
    doc.text(`TOTAL: ${formatCurrency(order.totalValue)}`, 5, currentY);
    doc.setFontSize(8);
    currentY += 5;
    doc.text('------------------------------------------', 40, currentY, { align: 'center' });
    currentY += 5;
    doc.text('Obrigado pela preferência!', 40, currentY, { align: 'center' });

    doc.save(`OS_${order.id?.substring(0, 8)}.pdf`);
  };

  const printWarrantyTerm = (order: ServiceOrder) => {
    const doc = new jsPDF();
    const storeName = profile?.store_name || 'CELLREPAIR PRO';
    const storeCnpj = profile?.cnpj || '';
    const storePhone = profile?.phone || '';
    const storeAddress = profile?.address || '';

    doc.setFontSize(18);
    doc.text('TERMO DE GARANTIA', 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.text(`Empresa: ${storeName}`, 14, 35);
    if (storeCnpj) doc.text(`CNPJ: ${storeCnpj}`, 14, 40);
    if (storePhone) doc.text(`Telefone: ${storePhone}`, 14, 45);
    if (storeAddress) doc.text(`Endereço: ${storeAddress}`, 14, 50);

    doc.text(`OS Nº: ${order.id?.substring(0, 8)}`, 140, 35);
    doc.text(`Data de Entrega: ${formatDate(new Date())}`, 140, 40);

    doc.setLineWidth(0.5);
    doc.line(14, 55, 196, 55);

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text('DADOS DO CLIENTE', 14, 65);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Nome: ${order.customerName}`, 14, 72);
    doc.text(`Telefone: ${order.customerPhone}`, 14, 77);

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text('DADOS DO EQUIPAMENTO E SERVIÇO', 14, 90);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Aparelho: ${order.device}`, 14, 97);
    doc.text(`Defeito Relatado: ${order.problem}`, 14, 102);
    
    let currentY = 107;
    if (order.partsUsed && Array.isArray(order.partsUsed) && order.partsUsed.length > 0) {
      doc.text('Peças Substituídas / Serviços Realizados:', 14, currentY);
      currentY += 5;
      order.partsUsed.forEach((part: any) => {
        const name = typeof part === 'string' ? part : (part.name || 'Peça/Serviço');
        const qty = typeof part === 'string' ? 1 : (part.quantity || 1);
        doc.text(`- ${name} (Qtd: ${qty})`, 14, currentY);
        currentY += 5;
      });
    }

    currentY += 5;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text('CONDIÇÕES DA GARANTIA', 14, currentY);
    currentY += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    
    const terms = [
      `1. PRAZO: A garantia cobre exclusivamente os serviços realizados e as peças substituídas descritas nesta Ordem de Serviço, pelo período de ${order.warrantyPeriod || '90 dias'} a partir da data de entrega.`,
      "",
      "2. A GARANTIA NÃO COBRE:",
      "   - Danos causados por mau uso, quedas, choques físicos, torções ou pressão na tela/aparelho.",
      "   - Contato com líquidos, umidade ou oxidação (mesmo em aparelhos classificados como resistentes a água).",
      "   - Danos causados por picos de energia, raios ou uso de carregadores não originais/inadequados.",
      "   - Atualizações de software malsucedidas, jailbreak, root, vírus ou aplicativos de terceiros.",
      "   - Intervenção, abertura ou tentativa de reparo por terceiros ou pelo próprio cliente.",
      "   - Rompimento, rasura ou violação do selo de garantia da loja.",
      "",
      "3. TELAS E DISPLAYS: A garantia cobre apenas perda de sensibilidade do touch ou falhas na imagem que NÃO sejam decorrentes de quebra, trinca, riscos profundos ou vazamento de cristal líquido (manchas escuras/listras) causados por impacto ou pressão.",
      "",
      "4. BATERIAS: A garantia cobre defeitos de fabricação. Não cobre desgaste natural ou vícios causados por mau uso (ex: deixar descarregar totalmente com frequência, uso contínuo durante o carregamento).",
      "",
      "5. ACIONAMENTO: Para acionar a garantia, é OBRIGATÓRIA a apresentação deste termo impresso e do aparelho com o selo de garantia intacto.",
      "",
      "6. PRAZO DE RESOLUÇÃO: O prazo máximo para resolução de problemas em garantia é de até 30 dias, conforme o Código de Defesa do Consumidor (Art. 18)."
    ];

    terms.forEach(term => {
      const splitTerm = doc.splitTextToSize(term, 180);
      
      // Check if we need a new page
      if (currentY + (splitTerm.length * 5) > 270) {
        doc.addPage();
        currentY = 20;
      }
      
      doc.text(splitTerm, 14, currentY);
      currentY += (splitTerm.length * 5);
    });

    currentY += 30;
    if (currentY > 280) {
      doc.addPage();
      currentY = 40;
    }

    doc.setLineWidth(0.5);
    doc.line(30, currentY, 90, currentY);
    doc.text('Assinatura do Cliente', 60, currentY + 5, { align: 'center' });
    
    doc.line(120, currentY, 180, currentY);
    doc.text('Assinatura da Loja', 150, currentY + 5, { align: 'center' });

    doc.setFontSize(8);
    doc.text('Declaro que recebi o equipamento testado e em perfeito funcionamento referente aos serviços contratados,', 105, currentY + 15, { align: 'center' });
    doc.text('e que li e concordo com os termos de garantia descritos acima.', 105, currentY + 20, { align: 'center' });

    doc.save(`Garantia_OS_${order.id?.substring(0, 8)}.pdf`);
  };

  const printEntryTerm = (order: ServiceOrder) => {
    const doc = new jsPDF();
    const storeName = profile?.store_name || 'CELLREPAIR PRO';
    const storeCnpj = profile?.cnpj || '';
    const storePhone = profile?.phone || '';
    const storeAddress = profile?.address || '';

    doc.setFontSize(18);
    doc.text('TERMO DE ENTRADA DE EQUIPAMENTO', 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.text(`Empresa: ${storeName}`, 14, 35);
    if (storeCnpj) doc.text(`CNPJ: ${storeCnpj}`, 14, 40);
    if (storePhone) doc.text(`Telefone: ${storePhone}`, 14, 45);
    if (storeAddress) doc.text(`Endereço: ${storeAddress}`, 14, 50);

    doc.text(`OS Nº: ${order.id?.substring(0, 8)}`, 140, 35);
    doc.text(`Data: ${formatDate(order.createdAt!)}`, 140, 40);

    doc.setLineWidth(0.5);
    doc.line(14, 55, 196, 55);

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text('DADOS DO CLIENTE', 14, 65);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Nome: ${order.customerName}`, 14, 72);
    doc.text(`Telefone: ${order.customerPhone}`, 14, 77);
    if (order.address) doc.text(`Endereço: ${order.address}`, 14, 82);

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text('DADOS DO EQUIPAMENTO', 14, 95);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Aparelho: ${order.device}`, 14, 102);
    doc.text(`Defeito Relatado: ${order.problem}`, 14, 107);
    
    let currentY = 112;
    if (order.observations) {
      const splitObs = doc.splitTextToSize(`Observações: ${order.observations}`, 180);
      doc.text(splitObs, 14, currentY);
      currentY += (splitObs.length * 5);
    }
    currentY += 5;

    // CHECKLIST SECTION
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text('CHECKLIST DE ENTRADA', 14, currentY);
    currentY += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    const checklistItems = [
      "Tela/Vidro", "Touch Screen", "Câmera Frontal", "Câmera Traseira",
      "Microfone", "Alto-falante", "Conector de Carga", "Botões (Power/Vol)",
      "Wi-Fi/Bluetooth", "Biometria/Face ID", "Bateria", "Sensores"
    ];

    const col1X = 14;
    const col2X = 105;
    let checkY = currentY;

    checklistItems.forEach((item, index) => {
      const x = index % 2 === 0 ? col1X : col2X;
      if (index % 2 === 0 && index > 0) checkY += 6;
      
      doc.rect(x, checkY - 3, 3, 3);
      doc.text("OK", x + 4, checkY);
      
      doc.rect(x + 12, checkY - 3, 3, 3);
      doc.text("Falha", x + 16, checkY);
      
      doc.rect(x + 28, checkY - 3, 3, 3);
      doc.text("N/A", x + 32, checkY);
      
      doc.text(item, x + 42, checkY);
    });

    currentY = checkY + 10;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text('TERMOS E CONDIÇÕES', 14, currentY);
    currentY += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    
    const terms = [
      "1. O cliente declara estar ciente e de acordo com as condições do equipamento descritas acima.",
      "2. O orçamento tem validade de 5 dias úteis.",
      "3. Equipamentos não retirados em até 90 dias após a comunicação de conclusão ou reprovação do orçamento poderão ser vendidos ou descartados para custear despesas de armazenamento, conforme art. 1.275 do Código Civil.",
      "4. A garantia cobre apenas os serviços realizados e peças substituídas, não cobrindo mau uso, quedas, contato com líquidos ou intervenção de terceiros.",
      `5. Prazo de garantia para este serviço: ${order.warrantyPeriod || '90 dias'}.`,
      "6. A assistência não se responsabiliza por dados armazenados no aparelho. É responsabilidade do cliente realizar backup prévio."
    ];

    terms.forEach(term => {
      const splitTerm = doc.splitTextToSize(term, 180);
      doc.text(splitTerm, 14, currentY);
      currentY += (splitTerm.length * 5);
    });

    currentY += 30;
    if (currentY > 280) {
      doc.addPage();
      currentY = 40;
    }

    doc.setLineWidth(0.5);
    doc.line(30, currentY, 90, currentY);
    doc.text('Assinatura do Cliente', 60, currentY + 5, { align: 'center' });

    doc.line(120, currentY, 180, currentY);
    doc.text('Assinatura da Empresa', 150, currentY + 5, { align: 'center' });

    doc.save(`Termo_OS_${order.id?.substring(0, 8)}.pdf`);
  };

  useEffect(() => {
    if (isActive) {
      fetchOrders();
      fetchCustomers();
      fetchTechnicians();
      fetchProducts();
    }
  }, [isActive]);

  // Keyboard shortcuts for delivery modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isDeliveryModalOpen) return;

      switch (e.key) {
        case 'F1':
          e.preventDefault();
          setSelectedPaymentMethod('cash');
          break;
        case 'F2':
          e.preventDefault();
          setSelectedPaymentMethod('credit_card');
          break;
        case 'F3':
          e.preventDefault();
          setSelectedPaymentMethod('debit_card');
          break;
        case 'F4':
          e.preventDefault();
          setSelectedPaymentMethod('pix');
          break;
        case 'F10':
          e.preventDefault();
          confirmDelivery();
          break;
        case 'Escape':
          e.preventDefault();
          setIsDeliveryModalOpen(false);
          setDeliveringOrder(null);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDeliveryModalOpen, selectedPaymentMethod, deliveringOrder]);

  const getRowBackground = (status: ServiceOrder['status']) => {
    switch (status) {
      case 'pending': return 'bg-yellow-50 hover:bg-yellow-100 border-l-4 border-l-yellow-500';
      case 'in-progress': return 'bg-blue-50 hover:bg-blue-100 border-l-4 border-l-blue-500';
      case 'completed': return 'bg-green-50 hover:bg-green-100 border-l-4 border-l-green-500';
      case 'delivered': return 'bg-purple-50 hover:bg-purple-100 border-l-4 border-l-purple-500';
      case 'cancelled': return 'bg-red-50 hover:bg-red-100 border-l-4 border-l-red-500';
      default: return 'bg-white hover:bg-gray-50 border-l-4 border-l-gray-200';
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

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Relatório de Ordens de Serviço', 14, 22);
    
    doc.setFontSize(11);
    doc.text(`Data de Emissão: ${formatDate(new Date().toISOString())}`, 14, 30);
    
    const tableColumn = ["Cliente", "Aparelho", "Status", "Total"];
    const tableRows: any[] = [];
    
    let totalValue = 0;

    filteredOrders.forEach(order => {
      const getStatusLabel = (status: string) => {
        switch (status) {
          case 'pending': return 'Pendente';
          case 'in-progress': return 'Em Reparo';
          case 'completed': return 'Pronto';
          case 'delivered': return 'Entregue';
          case 'cancelled': return 'Cancelado';
          default: return status;
        }
      };

      const orderData = [
        order.customerName,
        order.device,
        getStatusLabel(order.status),
        formatCurrency(order.totalValue)
      ];
      tableRows.push(orderData);
      totalValue += Number(order.totalValue);
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
    doc.text(`Total em OS: ${formatCurrency(totalValue)}`, 14, finalY + 10);

    doc.save(`relatorio_os_${format(new Date(), 'dd-MM-yyyy')}.pdf`);
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
          <h1 className="text-2xl font-bold text-gray-900">Ordens de Serviço</h1>
          <p className="text-gray-500">Acompanhe e gerencie os reparos dos clientes.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}
              title="Visualização em Lista"
            >
              <List className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'kanban' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}
              title="Visualização Kanban"
            >
              <LayoutGrid className="w-5 h-5" />
            </button>
          </div>
          <button
            onClick={exportToPDF}
            className="px-4 py-3 bg-white border border-orange-200 hover:bg-orange-50 text-orange-600 rounded-xl font-semibold flex items-center gap-2 transition-all"
            title="Exportar para PDF"
          >
            <Printer className="w-5 h-5" />
            Exportar PDF
          </button>
          <button 
            onClick={() => {
              setEditingOrder(null);
              setFormData({ 
                customerId: '', 
                customerName: '', 
                customerPhone: '', 
                cep: '', 
                address: '', 
                device: '', 
                problem: '', 
                observations: '', 
                totalValue: 0, 
                status: 'pending',
                warrantyPeriod: '90 dias',
                technicianId: '',
                technicianName: '',
                partsUsed: []
              });
              setIsModalOpen(true);
            }}
            className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 shadow-lg shadow-orange-200 transition-all"
          >
            <Plus className="w-5 h-5" />
            Nova OS
          </button>
        </div>
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

      {viewMode === 'list' ? (
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

          <div className="divide-y divide-gray-100">
            {filteredOrders.map((order) => (
              <div key={order.id} className={`p-6 transition-colors ${getRowBackground(order.status)}`}>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="bg-white/60 p-3 rounded-2xl shadow-sm">
                      <Smartphone className="w-6 h-6 text-gray-700" />
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
                            customerName: order.customerName || '',
                            customerPhone: order.customerPhone || '',
                            cep: order.cep || '',
                            address: order.address || '',
                            device: order.device || '',
                            problem: order.problem || '',
                            observations: order.observations || '',
                            totalValue: order.totalValue || 0,
                            status: order.status || 'pending',
                            warrantyPeriod: order.warrantyPeriod || '90 dias',
                            technicianId: order.technicianId || '',
                            technicianName: order.technicianName || '',
                            partsUsed: order.partsUsed || []
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
                        onClick={() => handleDeliverClick(order)}
                        className="p-2 text-purple-600 hover:bg-purple-50 rounded-xl transition-all"
                        title="Entregar ao Cliente"
                      >
                        <Truck className="w-5 h-5" />
                      </button>
                      <div className="relative group">
                        <button 
                          className="p-2 text-green-600 hover:bg-green-50 rounded-xl transition-all flex items-center gap-1"
                          title="Notificar WhatsApp"
                        >
                          <MessageCircle className="w-5 h-5" />
                        </button>
                        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 overflow-hidden">
                          <button 
                            onClick={() => notifyWhatsApp(order, 'budget')}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600"
                          >
                            Enviar Orçamento
                          </button>
                          <button 
                            onClick={() => notifyWhatsApp(order, 'ready')}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600"
                          >
                            Avisar que está Pronto
                          </button>
                          <button 
                            onClick={() => notifyWhatsApp(order, 'delivered')}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600"
                          >
                            Agradecer (Entregue)
                          </button>
                        </div>
                      </div>
                      <div className="relative group">
                        <button 
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all flex items-center gap-1"
                          title="Imprimir"
                        >
                          <Printer className="w-5 h-5" />
                        </button>
                        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 overflow-hidden">
                          <button 
                            onClick={() => printEntryTerm(order)}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 flex items-center gap-2"
                          >
                            <FileText className="w-4 h-4" /> Termo de Entrada
                          </button>
                          <button 
                            onClick={() => printWarrantyTerm(order)}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 flex items-center gap-2"
                          >
                            <FileText className="w-4 h-4" /> Termo de Garantia
                          </button>
                          <button 
                            onClick={() => printReceipt(order)}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 flex items-center gap-2"
                          >
                            <Printer className="w-4 h-4" /> Recibo (Térmica)
                          </button>
                        </div>
                      </div>
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
      ) : (
        <div className="flex flex-col">
          <div className="mb-4 relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Buscar por cliente ou aparelho..." 
              className="w-full pl-10 pr-4 py-2 bg-white border border-orange-100 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 items-start">
            {['pending', 'in-progress', 'completed'].map((status) => (
              <div key={status} className="bg-gray-50 rounded-2xl p-4 min-w-[300px] max-w-[300px] border border-gray-200 flex-shrink-0">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-700 flex items-center gap-2">
                    {status === 'pending' && <AlertCircle className="w-5 h-5 text-yellow-500" />}
                    {status === 'in-progress' && <Clock className="w-5 h-5 text-blue-500" />}
                    {status === 'completed' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                    {status === 'pending' ? 'Pendentes' : status === 'in-progress' ? 'Em Reparo' : 'Prontos'}
                  </h3>
                  <span className="bg-white px-2 py-1 rounded-lg text-xs font-bold text-gray-500 shadow-sm">
                    {filteredOrders.filter(o => o.status === status).length}
                  </span>
                </div>
                <div className="space-y-3">
                  {filteredOrders.filter(o => o.status === status).map(order => (
                    <div key={order.id} className={`p-4 rounded-xl shadow-sm hover:shadow-md transition-all ${getRowBackground(order.status)}`}>
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-gray-900 text-sm">{order.customerName}</h4>
                        <span className="text-xs font-bold text-orange-600">{formatCurrency(order.totalValue)}</span>
                      </div>
                      <p className="text-xs text-gray-600 mb-2 flex items-center gap-1">
                        <Smartphone className="w-3 h-3" /> {order.device}
                      </p>
                      <p className="text-xs text-gray-500 mb-3 line-clamp-2">
                        {order.problem}
                      </p>
                      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                        <span className="text-[10px] text-gray-400">{formatDate(order.createdAt)}</span>
                        <div className="flex gap-1">
                          <button 
                            onClick={() => {
                              setEditingOrder(order);
                              setFormData({
                                customerId: order.customerId || '',
                                customerName: order.customerName || '',
                                customerPhone: order.customerPhone || '',
                                cep: order.cep || '',
                                address: order.address || '',
                                device: order.device || '',
                                problem: order.problem || '',
                                observations: order.observations || '',
                                totalValue: order.totalValue || 0,
                                status: order.status || 'pending',
                                warrantyPeriod: order.warrantyPeriod || '90 dias',
                                technicianId: order.technicianId || '',
                                technicianName: order.technicianName || '',
                                partsUsed: order.partsUsed || []
                              });
                              setIsModalOpen(true);
                            }}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Editar OS"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {status === 'pending' && (
                            <button 
                              onClick={() => updateStatus(order.id!, 'in-progress')}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                              title="Iniciar Reparo"
                            >
                              <Clock className="w-4 h-4" />
                            </button>
                          )}
                          {status === 'in-progress' && (
                            <button 
                              onClick={() => updateStatus(order.id!, 'completed')}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-all"
                              title="Marcar como Pronto"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                          {status === 'completed' && (
                            <button 
                              onClick={() => handleDeliverClick(order)}
                              className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-all"
                              title="Entregar ao Cliente"
                            >
                              <Truck className="w-4 h-4" />
                            </button>
                          )}
                          <div className="relative group">
                            <button 
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-all flex items-center gap-1"
                              title="Imprimir"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <div className="absolute right-0 bottom-full mb-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 overflow-hidden">
                              <button 
                                onClick={() => printEntryTerm(order)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 flex items-center gap-2"
                              >
                                <FileText className="w-4 h-4" /> Termo de Entrada
                              </button>
                              <button 
                                onClick={() => printWarrantyTerm(order)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 flex items-center gap-2"
                              >
                                <FileText className="w-4 h-4" /> Termo de Garantia
                              </button>
                              <button 
                                onClick={() => printReceipt(order)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 flex items-center gap-2"
                              >
                                <Printer className="w-4 h-4" /> Recibo (Térmica)
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredOrders.filter(o => o.status === status).length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      Nenhuma OS nesta coluna
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                    value={formData.customerId || ''}
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
                    value={formData.customerName || ''}
                    onChange={e => setFormData({...formData, customerName: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                  <input 
                    required
                    type="text" 
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.customerPhone || ''}
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
                    value={formData.cep || ''}
                    onChange={e => handleCepChange(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Endereço</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.address || ''}
                    onChange={e => setFormData({...formData, address: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Aparelho</label>
                  <input 
                    required
                    type="text" 
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.device || ''}
                    onChange={e => setFormData({...formData, device: e.target.value})}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Problema Relatado</label>
                  <textarea 
                    required
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.problem || ''}
                    onChange={e => setFormData({...formData, problem: e.target.value})}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                  <textarea 
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.observations || ''}
                    onChange={e => setFormData({...formData, observations: e.target.value})}
                    rows={3}
                    placeholder="Informações adicionais sobre o reparo..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-orange-600" />
                    Garantia
                  </label>
                  <select 
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.warrantyPeriod || '90 dias'}
                    onChange={e => setFormData({...formData, warrantyPeriod: e.target.value})}
                  >
                    <option value="Sem garantia">Sem garantia</option>
                    <option value="30 dias">30 dias</option>
                    <option value="90 dias">90 dias</option>
                    <option value="180 dias">180 dias</option>
                    <option value="1 ano">1 ano</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-orange-600" />
                    Técnico
                  </label>
                  <select 
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.technicianId || ''}
                    onChange={e => setFormData({...formData, technicianId: e.target.value})}
                  >
                    <option value="">Selecione um técnico...</option>
                    {technicians.map(tech => (
                      <option key={tech.id} value={tech.id}>{tech.name} ({tech.commission_percentage}%)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valor Total (Estimado)</label>
                  <input 
                    readOnly
                    type="text" 
                    className="w-full px-4 py-2 bg-gray-100 border-none rounded-xl outline-none font-black text-gray-600 cursor-not-allowed"
                    value={formatCurrency(formData.totalValue)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select 
                    className="w-full px-4 py-2 bg-orange-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={formData.status || 'pending'}
                    onChange={e => setFormData({...formData, status: e.target.value as any})}
                  >
                    <option value="pending">Pendente</option>
                    <option value="in-progress">Em Reparo</option>
                    <option value="completed">Pronto</option>
                    <option value="delivered">Entregue</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </div>

                <div className="col-span-2 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 uppercase tracking-tight">Produtos / Peças Utilizadas</label>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">O custo das peças será descontado no lucro do Dashboard</p>
                    </div>
                    <div className="relative group">
                      <select 
                        className="px-4 py-2 bg-orange-100 text-orange-700 text-xs font-bold rounded-xl outline-none cursor-pointer hover:bg-orange-200 transition-all"
                        onChange={(e) => {
                          const product = products.find(p => p.id === e.target.value);
                          if (product) {
                            const exists = formData.partsUsed.find(p => p.productId === product.id);
                            if (!exists) {
                              setFormData({
                                ...formData,
                                partsUsed: [...formData.partsUsed, { 
                                  productId: product.id, 
                                  name: product.name, 
                                  quantity: 1, 
                                  price: product.price,
                                  cost: product.cost 
                                }]
                              });
                            }
                          }
                          e.target.value = "";
                        }}
                      >
                        <option value="">+ Adicionar Peça...</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name} (R$ {p.price})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    {formData.partsUsed.length === 0 ? (
                      <p className="text-xs text-gray-400 italic text-center py-4 border-2 border-dashed border-orange-50 rounded-2xl">Nenhuma peça adicionada ainda.</p>
                    ) : (
                      formData.partsUsed.map((part, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-orange-50 rounded-xl border border-orange-100">
                          <div className="flex-1">
                            <p className="text-sm font-bold text-gray-900">{part.name}</p>
                            <p className="text-[10px] text-gray-500 uppercase font-bold">Custo: {formatCurrency(part.cost)} | Venda: {formatCurrency(part.price)}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 bg-white rounded-lg border border-orange-100 px-2 py-1">
                              <button 
                                type="button"
                                onClick={() => {
                                  const newParts = [...formData.partsUsed];
                                  newParts[index].quantity = Math.max(1, newParts[index].quantity - 1);
                                  setFormData({...formData, partsUsed: newParts});
                                }}
                                className="text-orange-600 hover:bg-orange-50 rounded p-0.5"
                              >
                                <X className="w-3 h-3 rotate-45" />
                              </button>
                              <span className="text-xs font-bold w-4 text-center">{part.quantity}</span>
                              <button 
                                type="button"
                                onClick={() => {
                                  const newParts = [...formData.partsUsed];
                                  newParts[index].quantity += 1;
                                  setFormData({...formData, partsUsed: newParts});
                                }}
                                className="text-orange-600 hover:bg-orange-50 rounded p-0.5"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <button 
                              type="button"
                              onClick={() => {
                                const newParts = formData.partsUsed.filter((_, i) => i !== index);
                                setFormData({...formData, partsUsed: newParts});
                              }}
                              className="text-red-500 hover:bg-red-50 rounded-xl p-2 transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
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
                {!editingOrder && (
                  <button 
                    type="submit"
                    disabled={isSaving}
                    onClick={() => setPrintAfterSave(true)}
                    className="flex-1 px-6 py-3 bg-orange-100 text-orange-700 font-semibold rounded-xl hover:bg-orange-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSaving ? 'Salvando...' : <><Printer className="w-5 h-5" /> Salvar e Imprimir</>}
                  </button>
                )}
                <button 
                  type="submit"
                  disabled={isSaving}
                  onClick={() => setPrintAfterSave(false)}
                  className="flex-1 px-6 py-3 bg-orange-600 text-white font-semibold rounded-xl hover:bg-orange-700 shadow-lg shadow-orange-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

      {/* Modal de Entrega / Pagamento */}
      {isDeliveryModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-6">
            <div className="text-center space-y-2">
              <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                <Truck className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Entregar Aparelho</h3>
              <p className="text-gray-500">Selecione a forma de pagamento para finalizar a OS de <span className="font-bold text-gray-900">{deliveringOrder?.customerName}</span>.</p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-orange-50 rounded-2xl flex justify-between items-center">
                <span className="text-gray-600 font-medium">Valor a Receber:</span>
                <span className="text-2xl font-black text-orange-600">{formatCurrency(deliveringOrder?.totalValue || 0)}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'cash', label: 'Dinheiro', icon: Banknote, key: 'F1' },
                  { id: 'credit_card', label: 'Crédito', icon: CreditCard, key: 'F2' },
                  { id: 'debit_card', label: 'Débito', icon: CreditCard, key: 'F3' },
                  { id: 'pix', label: 'PIX', icon: QrCode, key: 'F4' },
                ].map((method) => (
                  <button
                    key={method.id}
                    onClick={() => setSelectedPaymentMethod(method.id as any)}
                    className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                      selectedPaymentMethod === method.id 
                        ? 'bg-orange-600 text-white border-orange-600 shadow-lg' 
                        : 'bg-white text-gray-600 border-orange-100 hover:border-orange-300'
                    }`}
                  >
                    <method.icon className="w-6 h-6" />
                    <div className="text-center">
                      <span className="text-sm font-bold block">{method.label}</span>
                      <span className={`text-[10px] font-medium ${selectedPaymentMethod === method.id ? 'text-orange-100' : 'text-gray-400'}`}>
                        Atalho: {method.key}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 px-1">
              <input
                type="checkbox"
                id="printWarranty"
                checked={printWarrantyAfterDelivery}
                onChange={(e) => setPrintWarrantyAfterDelivery(e.target.checked)}
                className="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500"
              />
              <label htmlFor="printWarranty" className="text-sm text-gray-700 cursor-pointer">
                Imprimir Termo de Garantia após confirmar
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => {
                  setIsDeliveryModalOpen(false);
                  setDeliveringOrder(null);
                }}
                className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all flex flex-col items-center"
              >
                <span>Cancelar</span>
                <span className="text-[10px] text-gray-400 font-normal">Atalho: Esc</span>
              </button>
              <button 
                onClick={confirmDelivery}
                className="flex-1 px-4 py-3 bg-orange-600 text-white font-semibold rounded-xl hover:bg-orange-700 shadow-lg shadow-orange-200 transition-all flex flex-col items-center"
              >
                <span>Confirmar Entrega</span>
                <span className="text-[10px] text-orange-100 font-normal">Atalho: F10</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
