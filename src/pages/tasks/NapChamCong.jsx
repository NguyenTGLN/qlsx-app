import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase, fetchAllRows } from '../../lib/supabase';
import { docDongChamCong, noiTenNhanVien } from '../../lib/chamCongExcel';
import { soSanhDiemChuyenCan } from '../../lib/chamCongPreview';
import { X, Upload, AlertTriangle, Check, Loader2 } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Nạp chấm công từ tệp Excel của máy chấm công. Bốn bước MỘT CHIỀU:
//   chọn tệp → nối tên lạ (nếu có) → xem trước → xác nhận ghi.
//
// Màn hình này thay cho việc phải mở terminal chạy script rồi dán SQL vào Supabase.
// Phần đọc tệp và phần dựng bảng điểm đều là HÀM THUẦN ở src/lib (chamCongExcel.js,
// chamCongPreview.js) và đã có test — tệp này chỉ nối chúng lại với màn hình.
//
// BƯỚC XEM TRƯỚC LÀ LÝ DO TỒN TẠI CỦA MÀN HÌNH, không phải trang trí: chấm công là căn
// cứ của 2 chỉ tiêu chuyên cần, nạp nhầm một tệp là điểm của 13 người đổi mà không ai
// thấy. Nên mọi nhánh dưới đây thà DỪNG và nói rõ còn hơn hiện một con số có thể sai.
//
// Ghi bằng MỘT lệnh rpc('nap_cham_cong'): PostgREST không mở được transaction, gọi
// delete rồi insert thành hai lệnh mà rớt mạng giữa chừng là cả kỳ trống rỗng và điểm
// chuyên cần 13 người về 0. Hàm trong CSDL thì Postgres tự bọc transaction.
// ─────────────────────────────────────────────────────────────────────────────

const SHEET = 'CHI TIẾT THEO NGÀY';

// Số dòng cảnh báo dạng chữ hiện tối đa. Một tệp hỏng cả cột ra hàng trăm dòng gần giống
// nhau; cắt bớt để phần quan trọng (khối cảnh báo theo cột ở trên) không bị chôn.
const MAX_CANH_BAO = 8;

// 'YYYY-MM-DD' → 'DD/MM'. Cùng lối hiển thị với ChamCongTab.jsx.
function ngayGon(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? `${m[3]}/${m[2]}` : String(s || '—');
}

// Điểm → chữ. `null` nghĩa là CHƯA CHẤM (không có căn cứ), KHÔNG phải 0 điểm — hiện 0 ở
// đây là nói với chủ app rằng người đó đang mất sạch điểm, trong khi thật ra chưa chấm.
const so1 = v => (v == null ? '—' : String(Math.round(Number(v) * 10) / 10));

// Một dòng mô tả cho MỘT cột đã quét. Tách `macDinh` (số liệu thật đã mất — số đang SAI)
// khỏi `phucHoi` (đọc lại được, số vẫn đúng, chỉ đáng ngờ về định dạng): gộp chung sẽ che
// mất khác biệt "phải sửa ngay" và "chỉ nên liếc qua".
function moTaCot(ten, bo) {
  const soLoi = bo.macDinh + bo.phucHoi;
  if (!soLoi) return `Cột ${ten}: ${bo.tong} ô, đọc được hết.`;
  const phan = [];
  if (bo.macDinh) {
    phan.push(ten === 'Tăng ca'
      ? `${bo.macDinh} ô không đọc được → nạp thành “không có số liệu”`
      : `${bo.macDinh} ô không đọc được → nạp thành 0 phút, SỐ THẬT ĐÃ MẤT`);
  }
  if (bo.phucHoi) {
    phan.push(`${bo.phucHoi} ô dạng h:mm đọc lại được (số vẫn đúng, nên xem lại cột nguồn)`);
  }
  return `Cột ${ten}: ${soLoi}/${bo.tong} ô có vấn đề — ${phan.join('; ')}.`;
}

// Cột mất số liệu thì hai chỉ tiêu chuyên cần tính trên số bịa. Nói thẳng hậu quả chứ
// không chỉ nói "có lỗi".
function hauQuaMatCot(ten) {
  if (ten === 'Đi muộn') return 'điểm chuyên cần dưới đây đang tính như thể KHÔNG AI đi muộn';
  if (ten === 'Về sớm') return 'điểm chuyên cần dưới đây đang tính như thể KHÔNG AI về sớm';
  return 'toàn bộ tăng ca của kỳ này sẽ nạp thành “không có số liệu”';
}

export default function NapChamCong({ users = [], onXong, onDong }) {
  const [buoc, setBuoc] = useState('chon');       // chon | noiTen | xemTruoc | dangGhi | xong
  const [loi, setLoi] = useState('');
  const [dangXuLy, setDangXuLy] = useState(false); // đọc tệp / tải dữ liệu so sánh
  const [ketQua, setKetQua] = useState(null);      // kết quả docDongChamCong
  const [nhanVien, setNhanVien] = useState([]);    // nhan_vien: id, name, ten_cham_cong
  const [chuaBiet, setChuaBiet] = useState([]);    // tên trong Excel chưa nối được
  const [ganCho, setGanCho] = useState({});        // tenExcel → nhan_vien_id
  const [dongDaNoi, setDongDaNoi] = useState([]);
  const [canhBaoNoi, setCanhBaoNoi] = useState([]); // cảnh báo KHÔNG chặn của bước nối tên
  const [bangDiem, setBangDiem] = useState([]);
  const [soXoaDuKien, setSoXoaDuKien] = useState(0);
  const [ketThuc, setKetThuc] = useState(null);    // { so_xoa, so_nap } thật do RPC trả về

  const dangGhi = buoc === 'dangGhi';

  // Danh sách nhân viên tải RIÊNG một hàm vì bước nối tên phải tải lại sau khi ghi.
  // fetchAllRows trả { data, error } và KHÔNG ném — bỏ qua `error` ở đây là biến một lỗi
  // mạng thành "bảng nhân viên rỗng", và khi đó MỌI tên trong tệp đều thành "chưa biết là ai".
  async function taiNhanVien() {
    const { data, error } = await fetchAllRows(() =>
      supabase.from('nhan_vien').select('id, name, ten_cham_cong').order('id'));
    if (error) {
      throw new Error('Không đọc được danh sách nhân viên: ' + (error.message || String(error)));
    }
    return data || [];
  }

  // ── Bước 1: chọn tệp ───────────────────────────────────────────────────────
  async function chonTep(e) {
    const f = e.target.files?.[0];
    // Xoá value NGAY (trước mọi await): sửa lại tệp Excel rồi chọn đúng tên tệp đó lần
    // nữa sẽ không phát onChange nếu value không đổi — người dùng bấm mà màn hình đứng im.
    e.target.value = '';
    if (!f) return;
    setLoi(''); setKetQua(null); setBangDiem([]); setChuaBiet([]); setGanCho({});
    setDangXuLy(true);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[SHEET];
      if (!ws) {
        throw new Error(
          `Không thấy sheet "${SHEET}" trong tệp. Sheet đang có: ${wb.SheetNames.join(', ') || '(không có sheet nào)'}.`
          + ' Xuất lại đúng bản “chi tiết theo ngày” từ máy chấm công rồi thử lại.');
      }
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });

      // docDongChamCong / noiTenNhanVien ném lỗi ĐÃ CÓ SẴN câu hướng dẫn phải làm gì
      // (sửa ô nào, xuất lại thế nào). Bọc lại thành "Có lỗi xảy ra" là vứt đi đúng phần
      // hữu ích nhất, nên ở đây hiện NGUYÊN VĂN.
      const kq = docDongChamCong(raw);
      const dsNv = await taiNhanVien();
      setNhanVien(dsNv);

      const noi = noiTenNhanVien(kq.dong, dsNv);
      setKetQua(kq);
      setDongDaNoi(noi.dongDaNoi);
      setCanhBaoNoi(noi.canhBao || []);
      if (noi.tenChuaBiet.length) { setChuaBiet(noi.tenChuaBiet); setBuoc('noiTen'); return; }
      await dungXemTruoc(kq, noi.dongDaNoi);
    } catch (err) {
      setLoi(err?.message || String(err));
    } finally {
      setDangXuLy(false);
    }
  }

  // ── Bước 2: nối tên lạ ─────────────────────────────────────────────────────
  // Ghi ánh xạ vừa chọn xuống nhan_vien.ten_cham_cong để LẦN SAU app tự nhận, rồi nối lại
  // từ đầu bằng chính dữ liệu vừa ghi (không tự suy trong bộ nhớ) — có ghi được thật hay
  // không phải do DB trả lời, không phải do màn hình đoán.
  async function luuGanTen() {
    setLoi('');
    setDangXuLy(true);
    try {
      const cap = Object.entries(ganCho).filter(([, id]) => id);
      const thieu = chuaBiet.filter(t => !ganCho[t]);
      if (thieu.length) throw new Error(`Chưa chọn ai cho: ${thieu.join(', ')}.`);

      // Hai tên Excel cùng trỏ về một người: lệnh sau đè ten_cham_cong của lệnh trước, một
      // tên vẫn lạc và ánh xạ SAI đã kịp nằm lại trong DB cho các tháng sau. Chặn trước khi ghi.
      const dungHai = cap.map(([, id]) => id)
        .filter((id, i, ds) => ds.indexOf(id) !== i);
      if (dungHai.length) {
        const ten = [...new Set(dungHai)]
          .map(id => nhanVien.find(nv => nv.id === id)?.name || id).join(', ');
        throw new Error(`Đang gán nhiều tên trong tệp cho cùng một người (${ten}). Mỗi người chỉ có một họ tên chấm công.`);
      }

      for (const [ten, nvId] of cap) {
        // `.select()` là BẮT BUỘC: PostgREST coi "RLS lọc hết dòng" là thành công (HTTP 204,
        // error = null). Không kiểm mảng trả về thì người không phải ADMIN bấm Lưu, màn hình
        // chạy tiếp như thường, mà DB không đổi gì.
        const { data, error } = await supabase
          .from('nhan_vien').update({ ten_cham_cong: ten }).eq('id', nvId).select();
        if (error) throw new Error(`Không lưu được họ tên chấm công cho "${ten}": ${error.message || String(error)}`);
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error(
            `Không lưu được họ tên chấm công cho "${ten}" — tài khoản của bạn không có quyền `
            + 'sửa nhân viên (chỉ Admin). Dữ liệu chưa thay đổi.');
        }
      }

      const dsNv = await taiNhanVien();
      setNhanVien(dsNv);
      const noi = noiTenNhanVien(ketQua.dong, dsNv);
      if (noi.tenChuaBiet.length) {
        // Còn tên lạc sau khi đã ghi: dừng hẳn. Nạp tiếp là những dòng đó mất người nhận.
        setChuaBiet(noi.tenChuaBiet);
        throw new Error(`Vẫn còn tên chưa nối được: ${noi.tenChuaBiet.join(', ')}. Chọn lại rồi lưu tiếp.`);
      }
      setDongDaNoi(noi.dongDaNoi);
      setCanhBaoNoi(noi.canhBao || []);
      await dungXemTruoc(ketQua, noi.dongDaNoi);
    } catch (err) {
      setLoi(err?.message || String(err));
    } finally {
      setDangXuLy(false);
    }
  }

  // ── Bước 3: dựng bảng xem trước ────────────────────────────────────────────
  async function dungXemTruoc(kq, dsDong) {
    const [ccCu, ctRows, ngoaiLe] = await Promise.all([
      fetchAllRows(() => supabase.from('cham_cong').select('*').eq('ky', kq.ky).order('id')),
      fetchAllRows(() => supabase.from('kpi_chi_tieu').select('*').eq('ky', kq.ky).order('id')),
      fetchAllRows(() => supabase.from('chuyen_can_ngoai_le').select('*').eq('ky', kq.ky).order('id')),
    ]);

    // fetchAllRows TRẢ { data, error } chứ KHÔNG ném. Bỏ qua `error` thì một lỗi tải thành
    // mảng rỗng, và bảng xem trước hiện "trước = đủ điểm" cho cả 13 người — đúng loại số sai
    // âm thầm mà màn hình này sinh ra để chặn. Nêu rõ BẢNG NÀO hỏng để còn biết đường sửa.
    const hong = [
      ccCu.error && `chấm công đang có (cham_cong): ${ccCu.error.message || ccCu.error}`,
      ctRows.error && `chỉ tiêu KPI (kpi_chi_tieu): ${ctRows.error.message || ctRows.error}`,
      ngoaiLe.error && `ngày đặc biệt (chuyen_can_ngoai_le): ${ngoaiLe.error.message || ngoaiLe.error}`,
    ].filter(Boolean);
    if (hong.length) {
      throw new Error(
        'Không đọc được dữ liệu hiện tại nên KHÔNG dựng được bảng so sánh — dừng lại để không '
        + `đưa ra con số sai. ${hong.join('; ')}`);
    }

    // Hình dạng dòng chấm công MỚI phải giống hệt dòng trong DB (tên cột của bảng cham_cong):
    // luật KPI đọc thẳng di_muon_phut / ve_som_phut / nghi / ngay, đặt tên khác là luật đọc
    // ra undefined và mọi người đều "đủ điểm".
    const chamCongMoi = dsDong.map(d => ({
      ky: kq.ky, nhan_vien_id: d.nhanVienId, ngay: d.ngay,
      di_muon_phut: d.diMuon, ve_som_phut: d.veSom, nghi: d.nghi,
    }));

    setSoXoaDuKien((ccCu.data || []).length);
    setBangDiem(soSanhDiemChuyenCan({
      ky: kq.ky, ctRows: ctRows.data || [], users,
      chamCongCu: ccCu.data || [], chamCongMoi, ngoaiLe: ngoaiLe.data || [],
    }));
    setBuoc('xemTruoc');
  }

  // ── Bước 4: ghi ────────────────────────────────────────────────────────────
  async function ghi() {
    setLoi(''); setBuoc('dangGhi');
    try {
      // Chốt chặn cuối: dòng không biết là ai mà vẫn gửi thì RPC ném lỗi khoá ngoại — bắt ở
      // đây để câu thông báo nói được TÊN nào đang lạc thay vì một lỗi Postgres.
      const lac = dongDaNoi.filter(d => !d.nhanVienId);
      if (lac.length) {
        const ten = [...new Set(lac.map(d => d.tenExcel))].join(', ');
        throw new Error(`Còn ${lac.length} dòng chưa biết là ai (${ten}) — dừng lại để không ghi nhầm người.`);
      }

      // ĐÚNG 11 cột mà jsonb_to_recordset trong hàm nap_cham_cong khai báo. `nghiText` và
      // `tenExcel` KHÔNG nằm trong danh sách đó nên không gửi.
      const p_dong = dongDaNoi.map(d => ({
        nhan_vien_id: d.nhanVienId, ngay: d.ngay, thu: d.thu,
        gio_in_sang: d.inSang, gio_in_chieu: d.inChieu, gio_out: d.out,
        tang_ca_phut: d.tangCa, di_muon_phut: d.diMuon, ve_som_phut: d.veSom,
        nghi: d.nghi, nghi_van: d.nghiVan,
      }));

      const { data, error } = await supabase.rpc('nap_cham_cong', { p_ky: ketQua.ky, p_dong });
      if (error) throw error;
      // Hàm TỪ CHỐI bằng cách trả { loi } — HTTP vẫn 200, `error` vẫn null. Không kiểm nhánh
      // này thì mọi lần bị từ chối (không phải ADMIN, kỳ sai, payload rỗng) đều hiện ra như
      // "nạp xong", và chủ app tin là chấm công đã vào.
      if (data?.loi) throw new Error(data.loi);
      if (data?.so_nap == null) {
        throw new Error('Hàm nạp không trả về số dòng đã nạp — chưa rõ đã ghi được gì, kiểm lại tab Chấm công trước khi nạp lần nữa.');
      }
      setKetThuc(data);
      setBuoc('xong');
      // PHẢI kèm kỳ vừa nạp. Kỳ ở đây suy từ NỘI DUNG tệp Excel, còn tab Chấm công có ô chọn
      // tháng riêng — hai thứ độc lập. Gọi onXong() tay không thì tab chỉ tải lại đúng tháng
      // đang chọn: nạp tệp tháng 8 trong khi ô đang để tháng 7 là màn hình không đổi gì, chủ
      // app tưởng nạp hỏng rồi bấm nạp lại. `ketQua.ky` chính là `p_ky` vừa gửi cho RPC ngay
      // phía trên, và RPC đã nhận nên nó chắc chắn đúng dạng 'YYYY-MM' mà tab chờ.
      onXong?.(ketQua.ky);
    } catch (err) {
      // Quay lại bước xem trước để bấm lại được: hàm nạp hoặc ăn cả hoặc không đổi gì, nên
      // nạp lại sau khi sửa là an toàn.
      setLoi(err?.message || String(err));
      setBuoc('xemTruoc');
    }
  }

  const soNguoi = new Set(dongDaNoi.map(d => d.nhanVienId)).size;
  const lechNgayCuoi = !!ketQua && ketQua.ngayCuoiTep && ketQua.ngayCuoiTep !== ketQua.denNgay;
  const cotDaQuet = Object.entries(ketQua?.canhBaoCot || {}).filter(([, b]) => b && b.tong > 0);
  const cotMatHan = cotDaQuet.filter(([, b]) => b.macDinh > 0 && b.macDinh === b.tong);
  // Gộp cảnh báo dạng chữ của CẢ HAI module: phần đọc tệp (dòng giờ ra bất thường, tóm tắt
  // cột kèm ví dụ) và phần nối tên (trùng ten_cham_cong nhưng không thuộc tệp này).
  const canhBaoChu = [...(ketQua?.canhBao || []), ...canhBaoNoi];

  return (
    <div onClick={() => { if (!dangGhi) onDong?.(); }} style={nen}>
      <div onClick={e => e.stopPropagation()} style={hop}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', flex: 1 }}>Nạp chấm công từ Excel</div>
          <button onClick={onDong} disabled={dangGhi} style={nutPhu} aria-label="Đóng"><X size={14} /></button>
        </div>

        {loi && <div style={khungLoi}><AlertTriangle size={14} style={{ flexShrink: 0 }} /> <span>{loi}</span></div>}

        {buoc === 'chon' && (
          <div>
            <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: 10 }}>
              Chọn tệp Excel xuất từ máy chấm công (sheet “{SHEET}”). App tự nhận ra kỳ và tự bỏ
              những ngày chưa ai đi làm — không phải gõ tay tháng nào.
            </div>
            <input
              type="file" accept=".xlsx,.xls" onChange={chonTep} disabled={dangXuLy}
              style={{ fontSize: '0.8rem' }}
            />
            {dangXuLy && (
              <div style={{ ...dongCho, marginTop: 10 }}>
                <Loader2 size={14} className="spin" /> Đang đọc tệp và tải dữ liệu để so sánh…
              </div>
            )}
          </div>
        )}

        {buoc === 'noiTen' && (
          <div>
            {/* Nói thẳng cái giá của một lần chọn nhầm, vì lựa chọn ở đây là VĨNH VIỄN đối với
                người dùng: nó được ghi xuống nhan_vien.ten_cham_cong và mọi lần nạp sau đều
                dùng lại. KHÔNG được hứa "sửa ở màn hình X": rà cả src/ thì không màn hình nào
                đọc hay sửa cột ten_cham_cong — chỉ mỗi màn hình này ghi vào nó, và chỉ ghi cho
                người CHƯA có. Chỉ đường sai còn tệ hơn không chỉ đường. */}
            <div style={{ fontSize: '0.8rem', color: '#b45309', marginBottom: 10 }}>
              Có {chuaBiet.length} họ tên trong tệp mà app chưa biết là ai. Chọn giúp — app ghi lại
              vào hồ sơ nhân viên nên lần sau tự nhận, và <b>các tháng sau cũng dùng lại đúng lựa
              chọn này</b>. Chọn nhầm thì chấm công của người này chạy sang người kia đều đặn hằng
              tháng mà không có cảnh báo nào, và <b>app hiện chưa có màn hình nào sửa lại được</b> —
              phải nhờ quản trị sửa thẳng trong cơ sở dữ liệu. Soát kỹ ngay bây giờ là rẻ nhất.
            </div>
            {chuaBiet.map(ten => (
              <div key={ten} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 140, fontSize: '0.82rem', fontWeight: 600 }}>{ten}</div>
                <select
                  value={ganCho[ten] || ''}
                  onChange={e => setGanCho({ ...ganCho, [ten]: e.target.value })}
                  style={{ ...oInput, width: 200 }}
                >
                  <option value="">— chọn nhân viên —</option>
                  {/* Chỉ người CHƯA có ten_cham_cong: người đã có mà chọn lại là đổi ánh xạ cũ
                      của họ, tức tháng sau chấm công của người đó nhảy sang tên mới. */}
                  {nhanVien.filter(nv => !nv.ten_cham_cong).map(nv => (
                    <option key={nv.id} value={nv.id}>{nv.name} ({nv.id})</option>
                  ))}
                </select>
              </div>
            ))}
            {nhanVien.filter(nv => !nv.ten_cham_cong).length === 0 && (
              <div style={khungCanhBao}>
                Mọi nhân viên trong hệ thống đều đã có họ tên chấm công, nên không còn ai để chọn.
                Nghĩa là tệp có tên của người chưa được tạo hồ sơ nhân viên, hoặc một hồ sơ đang ghi
                sai họ tên chấm công. Trường hợp sau phải nhờ quản trị sửa thẳng trong cơ sở dữ liệu
                — app chưa có màn hình nào sửa được họ tên chấm công — rồi nạp lại.
              </div>
            )}
            <button
              onClick={luuGanTen}
              disabled={dangXuLy || chuaBiet.some(t => !ganCho[t])}
              style={{ ...nutChinh, marginTop: 10, opacity: chuaBiet.some(t => !ganCho[t]) ? 0.5 : 1 }}
            >
              {dangXuLy ? <><Loader2 size={13} className="spin" /> Đang lưu…</> : 'Lưu và xem trước'}
            </button>
          </div>
        )}

        {(buoc === 'xemTruoc' || dangGhi) && ketQua && (
          <div>
            {/* ── Tổng quan ─────────────────────────────────────────────────── */}
            <div style={khungTin}>
              <b>Kỳ {ketQua.ky}</b> · {dongDaNoi.length} dòng · {soNguoi} người
              · đến hết ngày {ngayGon(ketQua.denNgay)}
              {ketQua.boQuaNgaySau > 0 && <> · bỏ {ketQua.boQuaNgaySau} dòng của ngày sau ngày cắt</>}
              <div style={{ marginTop: 4 }}>
                Sẽ <b>xoá {soXoaDuKien} dòng</b> đang có của kỳ này rồi <b>nạp {dongDaNoi.length} dòng</b> mới.
              </div>
            </div>

            {/* denNgay (ngày cắt) khác ngayCuoiTep (ngày cuối có trong tệp) là dấu hiệu phải
                có người nhìn: hoặc tệp xuất giữa tháng (bình thường), hoặc một lượt quét
                nhầm ngày đã kéo ngày cắt đi chỗ khác. Không suy luận nào tự phân biệt được
                hai thứ đó từ chính dữ liệu, nên phải lộ ra cho người quyết. */}
            {lechNgayCuoi && (
              <div style={khungChuY}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  <b>Cắt ở {ngayGon(ketQua.denNgay)} nhưng tệp có dữ liệu tới {ngayGon(ketQua.ngayCuoiTep)}</b>
                  {ketQua.boQuaNgaySau > 0 && <> — {ketQua.boQuaNgaySau} dòng sau ngày cắt sẽ KHÔNG được nạp</>}.
                  Những ngày đó không ai quét vân tay. Đúng nếu tệp xuất giữa tháng; nếu tháng đã
                  hết thì kiểm lại xem có ai quét nhầm ngày (kéo ngày cắt lệch đi) hoặc máy sót dữ
                  liệu mấy ngày cuối không.
                </span>
              </div>
            )}

            {/* ── Cảnh báo ──────────────────────────────────────────────────── */}
            {cotMatHan.map(([ten, bo]) => (
              <div key={ten} style={khungNguyHiem}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  <b>Cột {ten}: cả {bo.tong}/{bo.tong} ô đều không đọc được.</b> Số thật của cột
                  này đã mất hẳn — {hauQuaMatCot(ten)}. Sửa lại cột đó trong tệp Excel rồi nạp lại.
                </span>
              </div>
            ))}

            {cotDaQuet.length > 0 && (
              <div style={khungCot}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Chất lượng dữ liệu từng cột</div>
                {cotDaQuet.map(([ten, bo]) => (
                  <div key={ten} style={{ color: bo.macDinh ? '#b91c1c' : bo.phucHoi ? '#b45309' : '#64748b' }}>
                    {moTaCot(ten, bo)}
                  </div>
                ))}
              </div>
            )}

            {canhBaoChu.length > 0 && (
              <div style={khungCanhBao}>
                <b>{canhBaoChu.length} ghi chú khi đọc tệp:</b>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {canhBaoChu.slice(0, MAX_CANH_BAO).map((c, i) => <li key={i}>{c}</li>)}
                  {canhBaoChu.length > MAX_CANH_BAO && (
                    <li>…và {canhBaoChu.length - MAX_CANH_BAO} dòng nữa</li>
                  )}
                </ul>
              </div>
            )}

            {/* ── Bảng điểm chuyên cần trước / sau ──────────────────────────── */}
            <div style={{ fontWeight: 700, fontSize: '0.82rem', margin: '12px 0 6px' }}>
              Điểm chuyên cần cá nhân sẽ đổi thế nào
            </div>

            {bangDiem.length === 0 ? (
              <div style={khungCanhBao}>
                Kỳ {ketQua.ky} chưa có chỉ tiêu “chuyên cần cá nhân” nào trong KPI nên chưa có điểm
                để so sánh. Nạp vẫn được — điểm sẽ tự tính khi kỳ KPI đó được lập.
              </div>
            ) : (
              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th style={th}>Nhân viên</th>
                      <th style={{ ...th, textAlign: 'center' }}>Trước</th>
                      <th style={{ ...th, textAlign: 'center' }}>Sau</th>
                      <th style={{ ...th, textAlign: 'center' }}>Chênh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bangDiem.map(d => {
                      // `=== true` chứ không phải truthy: trường này do lib tính, thiếu trường
                      // thì coi như KHÔNG chốt tay và bảng vẫn chạy đúng phần còn lại.
                      const chot = d.daChotTay === true;
                      // Chênh chỉ có nghĩa khi cả hai đầu đều có điểm. `null` = chưa chấm,
                      // trừ null thành 0 là bịa ra một mức thay đổi không có thật.
                      const lech = (chot || d.diemTruoc == null || d.diemSau == null)
                        ? null : d.diemSau - d.diemTruoc;
                      const mau = lech == null || lech === 0 ? '#64748b' : lech > 0 ? '#047857' : '#b91c1c';
                      return (
                        <tr key={d.nhanVienId} style={chot ? { background: '#f8fafc' } : undefined}>
                          <td style={{ ...td, color: chot ? '#94a3b8' : '#0f172a' }}>
                            {d.ten}
                            {chot && (
                              <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                                đã chốt tay bởi {d.nguoiChot || 'người khác'} — nạp lại không đổi điểm này
                              </div>
                            )}
                          </td>
                          <td style={{ ...td, textAlign: 'center', color: chot ? '#94a3b8' : '#0f172a' }}>
                            {so1(d.diemTruoc)}
                          </td>
                          <td style={{
                            ...td, textAlign: 'center', fontWeight: chot ? 400 : 700,
                            color: chot ? '#94a3b8' : mau,
                          }}>
                            {so1(d.diemSau)}
                          </td>
                          <td style={{ ...td, textAlign: 'center', color: mau, fontWeight: 700 }}>
                            {chot ? '' : lech == null ? '—' : lech > 0 ? `▲ +${so1(lech)}` : lech < 0 ? `▼ ${so1(lech)}` : '±0'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 4 }}>
              Chuyên cần BỘ PHẬN (một điểm chung cho cả nhóm) cũng đổi theo lần nạp này, nhưng
              không phải điểm của từng người nên không xếp trong bảng trên.
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button onClick={ghi} disabled={dangGhi} style={{ ...nutChinh, opacity: dangGhi ? 0.6 : 1 }}>
                {dangGhi
                  ? <><Loader2 size={13} className="spin" /> Đang ghi…</>
                  : <><Upload size={13} /> Xác nhận nạp</>}
              </button>
              <button onClick={onDong} disabled={dangGhi} style={nutPhu}>Huỷ</button>
            </div>
            {dangGhi && (
              <div style={{ ...dongCho, marginTop: 8 }}>
                Đang xoá {soXoaDuKien} dòng cũ và nạp {dongDaNoi.length} dòng mới trong cùng một
                lượt — với vài trăm dòng có thể mất mấy giây. Đừng đóng cửa sổ.
              </div>
            )}
          </div>
        )}

        {buoc === 'xong' && ketThuc && (
          <div style={khungXong}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
              <Check size={16} /> Đã nạp xong kỳ {ketQua?.ky}
            </div>
            <div>Xoá {ketThuc.so_xoa} dòng cũ, nạp {ketThuc.so_nap} dòng mới.</div>
            <button onClick={onDong} style={{ ...nutChinh, marginTop: 6 }}>Đóng</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Style — cùng nếp inline object cuối tệp như KpiBangChung.jsx
// ─────────────────────────────────────────────────────────────────────────────

const nen = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 60,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
};
const hop = {
  background: '#fff', borderRadius: 12, padding: '1rem 1.1rem',
  width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto',
};
const oInput = {
  padding: '0.4rem 0.5rem', borderRadius: 8, border: '1px solid #e2e8f0',
  fontSize: '0.8rem', boxSizing: 'border-box', background: '#fff', maxWidth: '100%',
};
const nutChinh = {
  padding: '0.45rem 0.8rem', borderRadius: 8, border: 'none', background: '#2563eb',
  color: '#fff', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
};
const nutPhu = {
  padding: '0.45rem 0.8rem', borderRadius: 8, border: '1px solid #e2e8f0',
  background: '#fff', fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap',
};
const khungLoi = {
  padding: '0.5rem 0.7rem', borderRadius: 8, background: '#fef2f2', color: '#b91c1c',
  fontSize: '0.78rem', marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 6,
};
const khungTin = {
  padding: '0.5rem 0.7rem', borderRadius: 8, background: '#eff6ff', color: '#1d4ed8',
  fontSize: '0.78rem',
};
const khungChuY = {
  padding: '0.5rem 0.7rem', borderRadius: 8, background: '#fff7ed', color: '#9a3412',
  border: '1px solid #fdba74', fontSize: '0.78rem', marginTop: 8,
  display: 'flex', alignItems: 'flex-start', gap: 6,
};
const khungNguyHiem = {
  padding: '0.5rem 0.7rem', borderRadius: 8, background: '#fef2f2', color: '#b91c1c',
  border: '1px solid #fca5a5', fontSize: '0.78rem', marginTop: 8,
  display: 'flex', alignItems: 'flex-start', gap: 6,
};
const khungCot = {
  padding: '0.5rem 0.7rem', borderRadius: 8, background: '#f8fafc',
  border: '1px solid #e2e8f0', fontSize: '0.74rem', marginTop: 8, lineHeight: 1.5,
};
const khungCanhBao = {
  padding: '0.5rem 0.7rem', borderRadius: 8, background: '#fffbeb', color: '#b45309',
  fontSize: '0.75rem', marginTop: 8,
};
const khungXong = {
  padding: '0.6rem 0.7rem', borderRadius: 8, background: '#f0fdf4', color: '#047857',
  fontSize: '0.82rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
};
const dongCho = {
  display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: '#64748b',
};
const th = {
  padding: '0.4rem 0.5rem', borderBottom: '1px solid #e2e8f0', textAlign: 'left',
  fontSize: '0.72rem', color: '#64748b', background: '#f8fafc', position: 'sticky', top: 0,
};
const td = { padding: '0.35rem 0.5rem', borderBottom: '1px solid #f1f5f9' };
