import React, { useState, useEffect, useCallback } from 'react';
import { GitBranch } from 'lucide-react';
import ModuleShell, { TabButton } from '../../components/ModuleShell';
import { useTabPerm, useAuth } from '../../lib/AuthContext';
import * as api from '../../lib/quyTrinhApi';
import DanhMucTab from './DanhMucTab';
import SoanThaoTab from './SoanThaoTab';
import ThongTinTab from './ThongTinTab';
import DienGiaiTab from './DienGiaiTab';
import XemTruocTab from './XemTruocTab';

const MAU = '#ea580c';   // accent riêng của phân hệ, chưa phân hệ nào dùng

const TABS = [
  { id: 'danh_muc',  nhan: 'Danh mục quy trình' },
  { id: 'soan_thao', nhan: 'Trình vẽ lưu đồ' },
  { id: 'thong_tin', nhan: 'Thông tin tài liệu' },
  { id: 'dien_giai', nhan: 'Bảng diễn giải' },
  { id: 'xem_truoc', nhan: 'Xem trước & Xuất' },
];

export default function QuyTrinhApp() {
  const { user, isAdmin } = useAuth();
  const pDanhMuc = useTabPerm('quy_trinh', 'danh_muc');
  const pSoanThao = useTabPerm('quy_trinh', 'soan_thao');

  const [tab, setTab] = useState('danh_muc');
  const [loading, setLoading] = useState(true);
  const [ds, setDs] = useState([]);
  const [mo, setMo] = useState(null);        // { quyTrinh, phienBan, dsPhienBan }

  // Sơ đồ + hai ngăn xếp giữ CHUNG một state: mỗi lần đổi là một hàm cập nhật
  // duy nhất, nên giữ Ctrl+Z cho phím tự lặp cũng không làm lệch ngăn xếp.
  // Tách ba useState thì hai lần gọi trong cùng một batch React sẽ đọc phải giá
  // trị cũ, mất một bước và nhân đôi một bước khác.
  const [ls, setLs] = useState({ soDo: null, truoc: [], sau: [] });
  const soDo = ls.soDo;

  // Màn hình có thay đổi CHƯA ghi xuống máy chủ hay không.
  //
  // Vì sao phải có cờ này: Ban hành và Trả lại gọi lamMoiMo() — nạp lại phiên
  // bản TỪ DB. RPC ban hành cũng đóng dấu vào bản ĐÃ LƯU. Nên nếu Admin nhìn
  // lưu đồ trên màn hình, thấy đúng, rồi bấm Ban hành trong khi còn thay đổi
  // chưa lưu, thì TÀI LIỆU ĐƯỢC BAN HÀNH KHÁC VỚI TÀI LIỆU HỌ VỪA DUYỆT — và
  // không có gì báo cho họ biết. Với tài liệu ISO đem in và đem đi đánh giá,
  // đó là kiểu hỏng nặng nhất của phân hệ này.
  //
  // Cờ nằm ở ĐÂY chứ không ở từng tab, vì có hai đường sửa khác nhau: tab Trình
  // vẽ và tab Diễn giải sửa sơ đồ qua doiSoDo, còn tab Thông tin sửa tai_lieu
  // qua setMo. Mỗi tab giữ cờ riêng thì tab này không thấy tab kia bẩn.
  const [chuaLuu, setChuaLuu] = useState(false);
  const danhDauDaLuu = useCallback(() => setChuaLuu(false), []);
  const danhDauChuaLuu = useCallback(() => setChuaLuu(true), []);

  const nap = useCallback(async () => {
    setLoading(true);
    try { setDs(await api.dsQuyTrinh()); }
    catch (e) { alert(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { nap(); }, [nap]);

  const moQuyTrinh = async (qt) => {
    const dsPb = await api.taiPhienBan(qt.id);
    const pb = api.banDangLam(dsPb);
    setMo({ quyTrinh: qt, phienBan: pb, dsPhienBan: dsPb });
    setLs({ soDo: pb?.so_do || null, truoc: [], sau: [] });
    setChuaLuu(false);          // vừa nạp từ DB ⇒ màn hình khớp máy chủ
    setTab('soan_thao');
  };

  // Mọi thay đổi sơ đồ đi qua đây ⇒ hoàn tác là đẩy/rút ngăn xếp.
  const doiSoDo = (moi) => {
    setChuaLuu(true);
    setLs(s => ({
      soDo: moi,
      truoc: [...s.truoc.slice(-39), s.soDo],
      sau: [],
    }));
  };

  // Hoàn tác/làm lại cũng tính là CHƯA LƯU. Hoàn tác đúng về bản đã lưu thì cờ
  // này báo thừa, nhưng đó là chiều sai an toàn: báo thừa chỉ tốn một cú bấm
  // Lưu nháp, còn báo thiếu là ban hành nhầm tài liệu.
  // Kiểm độ dài ngăn xếp Ở NGOÀI: updater của setLs phải thuần, gọi setState
  // lồng trong đó sẽ chạy hai lần ở StrictMode.
  const hoanTac = () => {
    if (ls.truoc.length) setChuaLuu(true);
    setLs(s => s.truoc.length ? ({
      soDo: s.truoc[s.truoc.length - 1],
      truoc: s.truoc.slice(0, -1),
      sau: [...s.sau, s.soDo],
    }) : s);
  };

  const lamLai = () => {
    if (ls.sau.length) setChuaLuu(true);
    setLs(s => s.sau.length ? ({
      soDo: s.sau[s.sau.length - 1],
      truoc: [...s.truoc, s.soDo],
      sau: s.sau.slice(0, -1),
    }) : s);
  };

  const chung = { user, isAdmin, mo, setMo, soDo, doiSoDo, hoanTac, lamLai,
    coHoanTac: ls.truoc.length > 0, coLamLai: ls.sau.length > 0,
    chuaLuu, danhDauDaLuu, danhDauChuaLuu,
    pDanhMuc, pSoanThao, napLai: nap, mau: MAU };

  return (
    <ModuleShell
      title="Quy Trình" icon={GitBranch} color={MAU}
      loading={loading} onRefresh={nap}
      tabs={TABS.map(t => (
        <TabButton key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}
          label={t.nhan} color={MAU} />
      ))}
    >
      {tab === 'danh_muc'  && <DanhMucTab  {...chung} ds={ds} onMo={moQuyTrinh} />}
      {tab === 'soan_thao' && <SoanThaoTab {...chung} />}
      {tab === 'thong_tin' && <ThongTinTab {...chung} />}
      {tab === 'dien_giai' && <DienGiaiTab {...chung} />}
      {tab === 'xem_truoc' && <XemTruocTab {...chung} />}
    </ModuleShell>
  );
}
