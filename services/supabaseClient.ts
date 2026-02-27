
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Please check your environment variables.');
} else {
  console.log('Supabase initialized with URL:', supabaseUrl);
}

// Only create the client if we have a valid URL to avoid "Invalid supabaseUrl" error
export const supabase = createClient(
  supabaseUrl || 'https://placeholder-url.supabase.co', 
  supabaseAnonKey || 'placeholder-key'
);
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 调试日志：检查变量是否加载（不会泄露完整密钥）
console.log('Supabase URL 状态:', supabaseUrl ? '已加载' : '缺失');
console.log('Supabase Key 状态:', supabaseAnonKey ? '已加载' : '缺失');

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder'
);
