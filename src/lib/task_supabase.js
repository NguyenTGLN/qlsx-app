// Trước đây file này tạo một Supabase client riêng (taskDb) trùng 100% cấu hình với
// src/lib/supabase.js → 2 instance cùng project (cảnh báo "Multiple GoTrueClient",
// lãng phí, sửa customFetch phải sửa 2 nơi). Đã gộp về 1 client duy nhất.
// Giữ named export `taskDb` để các module Warranty/CSKH không phải đổi import.
import { supabase } from './supabase';

export const taskDb = supabase;
