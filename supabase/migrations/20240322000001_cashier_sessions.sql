-- Create cashier_sessions table
CREATE TABLE IF NOT EXISTS cashier_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  opened_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  closed_at TIMESTAMP WITH TIME ZONE,
  initial_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  expected_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  actual_amount DECIMAL(10,2),
  difference DECIMAL(10,2),
  total_sales DECIMAL(10,2) DEFAULT 0,
  total_suprimentos DECIMAL(10,2) DEFAULT 0,
  total_sangrias DECIMAL(10,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create cashier_movements table
CREATE TABLE IF NOT EXISTS cashier_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES cashier_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'sangria' (withdrawal), 'suprimento' (supply)
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Enable RLS
ALTER TABLE cashier_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashier_movements ENABLE ROW LEVEL SECURITY;

-- Create policies
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can perform all actions on cashier_sessions') THEN
    CREATE POLICY "Authenticated users can perform all actions on cashier_sessions" ON cashier_sessions FOR ALL TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can perform all actions on cashier_movements') THEN
    CREATE POLICY "Authenticated users can perform all actions on cashier_movements" ON cashier_movements FOR ALL TO authenticated USING (true);
  END IF;
END $$;

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE cashier_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE cashier_movements;
