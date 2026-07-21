-- Module KPI — phân hệ Công việc.
-- Mỗi kỳ (tháng) mỗi nhân viên một bộ dòng chỉ tiêu riêng. Sang kỳ mới = copy bộ kỳ
-- trước (xem sql/rpc_tao_ky_kpi.sql) → kỳ cũ bất biến, tra soát lịch sử được.

create table if not exists kpi_chi_tieu (
  id               uuid primary key default gen_random_uuid(),
  ky               text not null,                        -- '2026-06'
  cap_do           text not null default 'CA_NHAN',      -- 'CA_NHAN' | 'BO_PHAN'
  nhan_vien_id     text references nhan_vien(id) on delete cascade,
  lien_ket_bo_phan text,                                 -- khoá nhóm chấm chung
  nhom             text,
  thu_tu           int not null default 0,
  ten              text not null,
  mo_ta            text,
  chi_tieu         numeric,                              -- null = dòng thưởng ngoài trọng số
  trong_so         numeric not null default 0,
  cach_cham        text not null default 'NHAT_KY',      -- 'NHAT_KY' | 'THU_CONG' | 'TU_DONG'
  diem_tu_cham     numeric,
  diem_chot        numeric,
  chot_boi         text,
  chot_luc         timestamptz,
  created_at       timestamptz default now(),
  constraint kpi_chi_tieu_cap_do_hop_le check (
    (cap_do = 'CA_NHAN' and nhan_vien_id is not null) or
    (cap_do = 'BO_PHAN' and nhan_vien_id is null and lien_ket_bo_phan is not null)
  )
);

-- Nhật ký CÓ DẤU: âm = trừ, dương = cộng. Mọi biến động điểm đều có bằng chứng ở đây.
-- Cột nguon/ref_id là chỗ cắm cho chấm tự động (Phase 2): job phát hiện vi phạm chỉ
-- cần chèn 1 dòng, không phải sửa engine hay giao diện.
create table if not exists kpi_nhat_ky (
  id          uuid primary key default gen_random_uuid(),
  chi_tieu_id uuid not null references kpi_chi_tieu(id) on delete cascade,
  ngay        date not null,
  so_diem     numeric not null,
  ly_do       text not null,
  dinh_kem    jsonb,
  nguoi_ghi   text,
  nguon       text not null default 'TAY',               -- 'TAY' | 'TU_DONG'
  ref_id      text,                                      -- id bản ghi gốc khi nguon='TU_DONG'
  created_at  timestamptz default now()
);

create index if not exists kpi_chi_tieu_ky_nv on kpi_chi_tieu(ky, nhan_vien_id);
create index if not exists kpi_chi_tieu_ky_bp on kpi_chi_tieu(ky, lien_ket_bo_phan);
create index if not exists kpi_nhat_ky_ct     on kpi_nhat_ky(chi_tieu_id);

-- Chống chấm tự động chèn trùng khi job chạy lại: 1 chỉ tiêu + 1 nguồn gốc = 1 dòng.
create unique index if not exists kpi_nhat_ky_tu_dong_uniq
  on kpi_nhat_ky(chi_tieu_id, ref_id) where nguon = 'TU_DONG';

-- RLS: điểm công khai toàn bộ (quyết định nghiệp vụ) → mọi user đăng nhập đọc được.
-- Ghi thì gate ở tầng app theo cap của tab (permRegistry), giống các bảng khác trong app.
alter table kpi_chi_tieu enable row level security;
alter table kpi_nhat_ky  enable row level security;

drop policy if exists kpi_chi_tieu_all on kpi_chi_tieu;
create policy kpi_chi_tieu_all on kpi_chi_tieu for all
  to authenticated using (true) with check (true);

drop policy if exists kpi_nhat_ky_all on kpi_nhat_ky;
create policy kpi_nhat_ky_all on kpi_nhat_ky for all
  to authenticated using (true) with check (true);
