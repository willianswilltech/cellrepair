-- Add payment_method and user_id to cashier_movements if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashier_movements' AND column_name='payment_method') THEN
    ALTER TABLE cashier_movements ADD COLUMN payment_method TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashier_movements' AND column_name='user_id') THEN
    ALTER TABLE cashier_movements ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashier_sessions' AND column_name='user_id') THEN
    ALTER TABLE cashier_sessions ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
