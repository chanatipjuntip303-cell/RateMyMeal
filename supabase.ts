import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

// Supabase Configuration
// Reads from EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

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

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
