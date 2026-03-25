export interface Product {
  id?: string;
  name: string;
  description: string;
  price: number;
  cost: number;
  stock: number;
  category: string;
  categoryId?: string;
  barcode?: string;
  createdAt: any;
}

export interface ServiceOrder {
  id?: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  cep?: string;
  address?: string;
  device: string;
  problem: string;
  status: 'pending' | 'in-progress' | 'completed' | 'delivered' | 'cancelled';
  totalValue: number;
  partsUsed: string[];
  observations?: string;
  createdAt: any;
  updatedAt: any;
}

export interface SaleItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
}

export interface Sale {
  id?: string;
  items: SaleItem[];
  total: number;
  paymentMethod: 'cash' | 'credit_card' | 'debit_card' | 'pix';
  createdAt: any;
}

export interface Category {
  id?: string;
  name: string;
  description?: string;
  createdAt?: any;
}

export interface Customer {
  id?: string;
  name: string;
  email?: string;
  phone: string;
  cep?: string;
  document?: string;
  address?: string;
  address_number?: string;
  createdAt?: any;
}

export interface Supplier {
  id?: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  category?: string;
  createdAt?: any;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'employee';
}
