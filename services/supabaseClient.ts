import { createClient } from '@supabase/supabase-js';

// 在 Vite 中，生产环境必须使用 import.meta.env 获取 VITE_ 开头的变量
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 调试日志：检查变量是否加载（在浏览器控制台查看）
console.log('Supabase URL 加载状态:', supabaseUrl ? '✅ 已加载' : '❌ 缺失');
console.log('Supabase Key 加载状态:', supabaseAnonKey ? '✅ 已加载' : '❌ 缺失');

// 创建客户端
export const supabase = createClient(
  supabaseUrl || 'https://placeholder-url.supabase.co', 
  supabaseAnonKey || 'placeholder-key'
);
