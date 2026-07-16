import { describe, it, expect, vi, beforeEach } from 'vitest';

let rpcResult = { data: null, error: null };
const rpcCalls = [];

vi.mock('./supabase', () => ({
  supabase: { rpc: (fn, args) => { rpcCalls.push({ fn, args }); return Promise.resolve(rpcResult); } },
}));

const { cancelPhieu } = await import('./cancelDoc');

beforeEach(() => { rpcResult = { data: null, error: null }; rpcCalls.length = 0; });

describe('cancelPhieu', () => {
  it('gọi RPC huy_phieu với đúng tham số và trả kết quả', async () => {
    rpcResult = { data: { ok: true, order_code: 'PNK-1', reversed_lines: 3 }, error: null };
    const res = await cancelPhieu('PNK-1', 'user A', 'nhập nhầm');
    expect(rpcCalls[0].fn).toBe('huy_phieu');
    expect(rpcCalls[0].args).toEqual({ p_order_code: 'PNK-1', p_user: 'user A', p_reason: 'nhập nhầm' });
    expect(res.ok).toBe(true);
    expect(res.reversed_lines).toBe(3);
  });

  it('thiếu lý do → ném lỗi ngay, không gọi RPC', async () => {
    await expect(cancelPhieu('PNK-1', 'u', '  ')).rejects.toThrow(/lý do/i);
    expect(rpcCalls).toHaveLength(0);
  });

  it('RPC trả lỗi nghiệp vụ (chặn) → ném lỗi mang message từ DB', async () => {
    rpcResult = { data: null, error: { message: 'Không thể hủy: mã X tại vị trí Y chỉ còn 2, cần 5 để đảo (hàng đã được dùng tiếp).' } };
    await expect(cancelPhieu('PNK-1', 'u', 'lý do')).rejects.toThrow(/chỉ còn 2/);
  });

  it('hàm chưa tồn tại trên DB (chưa chạy SQL) → lỗi hướng dẫn chạy SQL', async () => {
    rpcResult = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.huy_phieu' } };
    await expect(cancelPhieu('PNK-1', 'u', 'lý do')).rejects.toThrow(/create_huy_phieu\.sql/);
  });
});
