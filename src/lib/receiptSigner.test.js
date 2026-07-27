import { describe, it, expect } from 'vitest';
import { resolveNguoiNhan, resolveHoTen, staffIdOf } from './receiptSigner';

describe('resolveHoTen — mã/tên nhân viên -> họ tên đầy đủ', () => {
  it('tra theo mã nhân viên', () => {
    expect(resolveHoTen('ntth')).toBe('Nguyễn Thị Thu Hà');
    expect(resolveHoTen('nvh')).toBe('Nguyễn Văn Hĩu');
    expect(resolveHoTen('admin')).toBe('Đỗ Hương Nguyên');
  });

  it('tra theo tên ngắn trong bảng nhân viên (không phân biệt dấu/hoa thường)', () => {
    expect(resolveHoTen('Hà')).toBe('Nguyễn Thị Thu Hà');
    expect(resolveHoTen('ha')).toBe('Nguyễn Thị Thu Hà');
    expect(resolveHoTen('Ngọc')).toBe('Nguyễn Bá Ngọc');
  });

  it('tra đủ họ tên cho mọi tài khoản đã khai báo', () => {
    expect(resolveHoTen('hangkt')).toBe('Nguyễn Thị Bách Hằng');
    expect(resolveHoTen('nva')).toBe('Nguyễn Thị Vân Anh');
    expect(resolveHoTen('nv8')).toBe('Lê Thị Duyên');
    expect(resolveHoTen('lvb')).toBe('Lê Văn Bích');
    expect(resolveHoTen('nxt')).toBe('Nguyễn Xuân Thiện');
    expect(resolveHoTen('vta')).toBe('Vương Tuấn Anh');
    expect(resolveHoTen('TGD')).toBe('Ninh Văn Giang');
  });

  it('tra được cả khi phiếu chỉ lưu tên gọi ngắn của bảng nhân viên', () => {
    expect(resolveHoTen('Hằng')).toBe('Nguyễn Thị Bách Hằng');
    expect(resolveHoTen('Vân Anh')).toBe('Nguyễn Thị Vân Anh');
    expect(resolveHoTen('Duyên')).toBe('Lê Thị Duyên');
    expect(resolveHoTen('Bích')).toBe('Lê Văn Bích');
    expect(resolveHoTen('Thiện')).toBe('Nguyễn Xuân Thiện');
    expect(resolveHoTen('Tuấn')).toBe('Vương Tuấn Anh');
    expect(resolveHoTen('Anh Giang')).toBe('Ninh Văn Giang');
  });

  it('tài khoản chưa khai họ tên đầy đủ: in tên gọi, KHÔNG in mã đăng nhập', () => {
    expect(resolveHoTen('ptt')).toBe('Thơ');
    expect(resolveHoTen('dvx')).toBe('Xuân');
  });

  it('không tra được thì giữ nguyên chuỗi gốc', () => {
    expect(resolveHoTen('Ai Đó')).toBe('Ai Đó');
  });

  it('rỗng thì trả về rỗng', () => {
    expect(resolveHoTen('')).toBe('');
    expect(resolveHoTen(null)).toBe('');
  });
});

describe('staffIdOf — mã người lập ghi vào created_by của phiếu', () => {
  it('lấy mã tài khoản đang đăng nhập', () => {
    expect(staffIdOf({ id: 'ntth', name: 'Hà' })).toBe('ntth');
  });

  it('thiếu mã thì lấy tên', () => {
    expect(staffIdOf({ name: 'Hà' })).toBe('Hà');
  });

  it('chưa đăng nhập -> chuỗi rỗng, KHÔNG bịa "Nhân viên"', () => {
    expect(staffIdOf(null)).toBe('');
    expect(staffIdOf({})).toBe('');
  });
});

describe('resolveNguoiNhan — người nhận in trên phiếu xuất', () => {
  it('tài khoản thường: người nhận là chính người lập, ghi đủ họ tên', () => {
    expect(resolveNguoiNhan('nbn')).toBe('Nguyễn Bá Ngọc');
    expect(resolveNguoiNhan('nttd')).toBe('Nguyễn Thị Thùy Dương');
  });

  it('tài khoản Hà -> người nhận là Nguyễn Văn Hĩu', () => {
    expect(resolveNguoiNhan('ntth')).toBe('Nguyễn Văn Hĩu');
    expect(resolveNguoiNhan('Hà')).toBe('Nguyễn Văn Hĩu');
  });

  it('tài khoản admin -> người nhận là Nguyễn Văn Hĩu', () => {
    expect(resolveNguoiNhan('admin')).toBe('Nguyễn Văn Hĩu');
    expect(resolveNguoiNhan('Nguyên')).toBe('Nguyễn Văn Hĩu');
  });

  it('phiếu cũ chưa ghi nhận người lập -> để trống cho ký tay', () => {
    expect(resolveNguoiNhan('Nhân viên')).toBe('');
    expect(resolveNguoiNhan('')).toBe('');
    expect(resolveNguoiNhan(undefined)).toBe('');
  });
});
