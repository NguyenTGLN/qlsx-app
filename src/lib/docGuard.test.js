import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock supabase client ──────────────────────────────────────────
// Cho phép mỗi test điều khiển kết quả INSERT (chiếm token) và SELECT (tra mã cũ).
let insertResult = { error: null };
let selectResult = { data: null };
const calls = { insert: [], delete: [], update: [] };

vi.mock('./supabase', () => {
  const makeChain = (table) => ({
    insert: (row) => { calls.insert.push({ table, row }); return Promise.resolve(insertResult); },
    delete: () => ({ eq: (col, val) => { calls.delete.push({ table, col, val }); return Promise.resolve({ error: null }); } }),
    update: (row) => ({ eq: (col, val) => { calls.update.push({ table, row, col, val }); return Promise.resolve({ error: null }); } }),
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(selectResult) }) }),
  });
  return { supabase: { from: (table) => makeChain(table) } };
});

const { newDocToken, claimDocToken, releaseDocToken, setDocTokenOrderCode } = await import('./docGuard');

beforeEach(() => {
  insertResult = { error: null };
  selectResult = { data: null };
  calls.insert = []; calls.delete = []; calls.update = [];
});

describe('newDocToken', () => {
  it('sinh token khác nhau mỗi lần', () => {
    const a = newDocToken();
    const b = newDocToken();
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });
});

describe('claimDocToken', () => {
  it('lần đầu (insert thành công) → ok:true', async () => {
    insertResult = { error: null };
    const res = await claimDocToken('tok-1', { orderCode: 'PNK-1', kind: 'import' });
    expect(res.ok).toBe(true);
    expect(calls.insert).toHaveLength(1);
    expect(calls.insert[0].row.batch_token).toBe('tok-1');
  });

  it('token đã dùng (lỗi 23505) → ok:false, duplicate, kèm mã cũ', async () => {
    insertResult = { error: { code: '23505', message: 'duplicate key' } };
    selectResult = { data: { order_code: 'PNK-99' } };
    const res = await claimDocToken('tok-dup');
    expect(res.ok).toBe(false);
    expect(res.duplicate).toBe(true);
    expect(res.orderCode).toBe('PNK-99');
  });

  it('bảng chưa tạo (42P01) → fail-open ok:true, guardUnavailable', async () => {
    insertResult = { error: { code: '42P01', message: 'relation "print_doc_guard" does not exist' } };
    const res = await claimDocToken('tok-x');
    expect(res.ok).toBe(true);
    expect(res.guardUnavailable).toBe(true);
  });

  it('bảng chưa vào schema cache (PGRST205) → fail-open', async () => {
    insertResult = { error: { code: 'PGRST205', message: "Could not find the table 'public.print_doc_guard' in the schema cache" } };
    const res = await claimDocToken('tok-y');
    expect(res.ok).toBe(true);
    expect(res.guardUnavailable).toBe(true);
  });

  it('lỗi mạng/DB khác → ném lỗi (fail-closed)', async () => {
    insertResult = { error: { code: '08006', message: 'connection failure' } };
    await expect(claimDocToken('tok-z')).rejects.toThrow('connection failure');
  });

  it('thiếu token → ném lỗi', async () => {
    await expect(claimDocToken('')).rejects.toThrow(/batch_token/);
  });
});

describe('releaseDocToken', () => {
  it('xóa đúng token', async () => {
    await releaseDocToken('tok-rel');
    expect(calls.delete).toHaveLength(1);
    expect(calls.delete[0].val).toBe('tok-rel');
  });

  it('token rỗng → không gọi DB', async () => {
    await releaseDocToken('');
    expect(calls.delete).toHaveLength(0);
  });
});

describe('setDocTokenOrderCode', () => {
  it('cập nhật order_code cho token', async () => {
    await setDocTokenOrderCode('tok-u', 'PNK-7');
    expect(calls.update).toHaveLength(1);
    expect(calls.update[0].row.order_code).toBe('PNK-7');
    expect(calls.update[0].val).toBe('tok-u');
  });

  it('thiếu token hoặc mã → bỏ qua', async () => {
    await setDocTokenOrderCode('', 'PNK-7');
    await setDocTokenOrderCode('tok', '');
    expect(calls.update).toHaveLength(0);
  });
});
