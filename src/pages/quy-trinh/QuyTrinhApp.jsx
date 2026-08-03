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
    setTab('soan_thao');
  };

  // Mọi thay đổi sơ đồ đi qua đây ⇒ hoàn tác là đẩy/rút ngăn xếp.
  const doiSoDo = (moi) => setLs(s => ({
    soDo: moi,
    truoc: [...s.truoc.slice(-39), s.soDo],
    sau: [],
  }));

  const hoanTac = () => setLs(s => s.truoc.length ? ({
    soDo: s.truoc[s.truoc.length - 1],
    truoc: s.truoc.slice(0, -1),
    sau: [...s.sau, s.soDo],
  }) : s);

  const lamLai = () => setLs(s => s.sau.length ? ({
    soDo: s.sau[s.sau.length - 1],
    truoc: [...s.truoc, s.soDo],
    sau: s.sau.slice(0, -1),
  }) : s);

  const chung = { user, isAdmin, mo, setMo, soDo, doiSoDo, hoanTac, lamLai,
    coHoanTac: ls.truoc.length > 0, coLamLai: ls.sau.length > 0,
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
