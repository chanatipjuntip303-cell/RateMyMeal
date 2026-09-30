import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

// Supabase Configuration
// Replace with your Supabase credentials or use environment variables
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://pjagguyhbbwqhqfewshs.supabase.co';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_yCfvRQ6qWhC0LDhjBI3okw_GRoh7Bfn';

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
