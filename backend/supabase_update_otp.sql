-- Exécutez ce code dans l'éditeur SQL de votre tableau de bord Supabase

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS reset_otp text,
ADD COLUMN IF NOT EXISTS reset_otp_expires_at timestamptz;
