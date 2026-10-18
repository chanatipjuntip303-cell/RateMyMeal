import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Default Supabase Configuration (from .env if provided)
export const DEFAULT_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const DEFAULT_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export interface Meal {
  id?: string;
  dish_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  health_score: number;
  roast_comment: string;
  created_at?: string;
}

// 1-Click SQL Script to create meals table on personal Supabase project
export const SUPABASE_MEALS_SQL = `-- 1. สร้างตารางเก็บข้อมูลมื้ออาหาร Rate My Meal
CREATE TABLE IF NOT EXISTS meals (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  dish_name TEXT NOT NULL,
  calories INTEGER NOT NULL,
  protein NUMERIC NOT NULL,
  carbs NUMERIC NOT NULL,
  fat NUMERIC NOT NULL,
  health_score INTEGER NOT NULL,
  roast_comment TEXT NOT NULL
);

-- 2. เปิดใช้งาน Row Level Security (RLS)
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;

-- 3. นโยบายอนุญาตให้แอพของคุณอ่านและบันทึกข้อมูล
DROP POLICY IF EXISTS "Allow public all on meals" ON meals;
CREATE POLICY "Allow public all on meals" ON meals FOR ALL USING (true) WITH CHECK (true);`;

export const createSupabaseClient = (
  url?: string | null,
  anonKey?: string | null
): SupabaseClient | null => {
  const targetUrl = (url || '').trim();
  const targetKey = (anonKey || '').trim();
  if (!targetUrl || !targetKey) return null;
  try {
    return createClient(targetUrl, targetKey);
  } catch (err) {
    console.warn('Failed to create Supabase client:', err);
    return null;
  }
};

// Fallback client for backward compatibility
export const supabase = DEFAULT_SUPABASE_URL && DEFAULT_SUPABASE_ANON_KEY
  ? createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY)
  : (null as unknown as SupabaseClient);

