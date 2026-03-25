-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,
  document TEXT,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  barcode TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Add category_id if it doesn't exist (for existing tables)
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='category_id') THEN
    ALTER TABLE products ADD COLUMN category_id UUID REFERENCES categories(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='barcode') THEN
    ALTER TABLE products ADD COLUMN barcode TEXT;
  END IF;
END $$;

-- Create service_orders table
CREATE TABLE IF NOT EXISTS service_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  device TEXT NOT NULL,
  problem TEXT NOT NULL,
  total_value DECIMAL(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  parts_used JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Add customer_id if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_orders' AND column_name='customer_id') THEN
    ALTER TABLE service_orders ADD COLUMN customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_orders' AND column_name='cep') THEN
    ALTER TABLE service_orders ADD COLUMN cep TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_orders' AND column_name='address') THEN
    ALTER TABLE service_orders ADD COLUMN address TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_orders' AND column_name='observations') THEN
    ALTER TABLE service_orders ADD COLUMN observations TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='cep') THEN
    ALTER TABLE customers ADD COLUMN cep TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='address_number') THEN
    ALTER TABLE customers ADD COLUMN address_number TEXT;
  END IF;
END $$;

-- Create sales table
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Enable RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create policies safely
DO $$ 
BEGIN
  -- Categories
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can perform all actions on categories') THEN
    CREATE POLICY "Authenticated users can perform all actions on categories" ON categories FOR ALL TO authenticated USING (true);
  END IF;
  -- Customers
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can perform all actions on customers') THEN
    CREATE POLICY "Authenticated users can perform all actions on customers" ON customers FOR ALL TO authenticated USING (true);
  END IF;
  -- Suppliers
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can perform all actions on suppliers') THEN
    CREATE POLICY "Authenticated users can perform all actions on suppliers" ON suppliers FOR ALL TO authenticated USING (true);
  END IF;
  -- Products
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can perform all actions on products') THEN
    CREATE POLICY "Authenticated users can perform all actions on products" ON products FOR ALL TO authenticated USING (true);
  END IF;
  -- Service Orders
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can perform all actions on service_orders') THEN
    CREATE POLICY "Authenticated users can perform all actions on service_orders" ON service_orders FOR ALL TO authenticated USING (true);
  END IF;
  -- Sales
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can perform all actions on sales') THEN
    CREATE POLICY "Authenticated users can perform all actions on sales" ON sales FOR ALL TO authenticated USING (true);
  END IF;
  -- Profiles
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can perform all actions on profiles') THEN
    CREATE POLICY "Authenticated users can perform all actions on profiles" ON profiles FOR ALL TO authenticated USING (true);
  END IF;
END $$;

-- Enable Realtime for all tables
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'categories') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE categories;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'products') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE products;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'service_orders') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE service_orders;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'customers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE customers;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'suppliers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE suppliers;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'sales') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sales;
  END IF;
END $$;

-- Function to handle updated_at
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS set_updated_at_categories ON categories;
CREATE TRIGGER set_updated_at_categories BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_customers ON customers;
CREATE TRIGGER set_updated_at_customers BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_suppliers ON suppliers;
CREATE TRIGGER set_updated_at_suppliers BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_products ON products;
CREATE TRIGGER set_updated_at_products BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_service_orders ON service_orders;
CREATE TRIGGER set_updated_at_service_orders BEFORE UPDATE ON service_orders FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
