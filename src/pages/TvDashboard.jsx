import React, { useState, useEffect, useRef } from 'react';
import { Clock, AlertTriangle, MonitorPlay, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { memberUsers } from '../lib/taskAssignees';

const TvDashboard = () => {
  const [tasks, setTasks] = useState([]);
  const [started, setStarted] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isAlarming, setIsAlarming] = useState(false);
  const [alarmType, setAlarmType] = useState(() => localStorage.getItem('tv_alarm_type') || 'siren');
  const audioCtxRef = useRef(null);

  // Đóng AudioContext khi rời trang để tránh treo (trình duyệt giới hạn số instance)
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    };
  }, []);

  // Cập nhật giờ liên tục mỗi giây
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Lấy dữ liệu mỗi phút
  useEffect(() => {
    if (!started) return;
    
    const fetchTasks = async () => {
      // Việc nhóm: FK join chỉ ra được người đại diện, nên tự tra tên từ assignee_ids.
      // Bảng nhân viên chỉ ~16 dòng nên lấy kèm mỗi lần refresh không đáng kể.
      const [{ data }, { data: nvData }] = await Promise.all([
        supabase
          .from('cong_viec_duoc_giao')
          .select('id, title, assignee_id, assignee_ids, status, due_date')
          .neq('status', 'COMPLETED')
          .neq('status', 'CANCELLED')
          .order('due_date', { ascending: true })
          .limit(20),
        supabase.from('nhan_vien').select('id, name'),
      ]);

      if (data) {
        const uMap = new Map((nvData || []).map(u => [u.id, u]));
        setTasks(data.map(t => ({ ...t, memberNames: memberUsers(t, uMap).map(u => u.name) })));
      }
    };

    fetchTasks(); // Gọi ngay lần đầu
    const interval = setInterval(fetchTasks, 60000); // 1 phút / lần
    return () => clearInterval(interval);
  }, [started]);

  // Kiểm tra thời hạn và kích hoạt chuông mỗi 5 giây nếu cần
  useEffect(() => {
    if (!started || tasks.length === 0) return;

    let shouldAlarm = false;
    const now = new Date();

    tasks.forEach(task => {
      if (!task.due_date) return;
      const due = new Date(task.due_date);
      const diffMins = (due.getTime() - now.getTime()) / 60000;
      
      // Nếu công việc chưa hoàn thành và còn <= 15 phút hoặc đã quá hạn
      if (diffMins <= 15) {
        shouldAlarm = true;
      }
    });

    setIsAlarming(shouldAlarm);

    // Phát chuông báo động lặp lại (ví dụ mỗi 5 giây 1 lần nếu còn nguy hiểm)
    if (shouldAlarm && now.getSeconds() % 5 === 0) {
      playAlarm();
    }
  }, [currentTime, started, tasks]);

  // Hàm tạo tiếng còi bằng Web Audio API (không cần tải file)
  const playAlarm = (overrideType) => {
    try {
      const typeToPlay = overrideType || alarmType;
      if (!audioCtxRef.current) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      if (typeToPlay === 'siren') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.3);
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.6);
        gain.gain.setValueAtTime(0.3, ctx.currentTime); // Âm lượng vừa phải
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.6);
      } else if (typeToPlay === 'beep') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1000, ctx.currentTime);
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.setValueAtTime(0.01, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.5, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } else if (typeToPlay === 'bell') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // Nốt A5
        gain.gain.setValueAtTime(0.8, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 1.5);
      } else if (typeToPlay === 'police') {
        osc.type = 'square'; // Âm thanh gắt kiểu còi cảnh sát
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        for (let i = 0; i < 5; i++) {
          const startTime = ctx.currentTime + i * 0.4;
          osc.frequency.setValueAtTime(600, startTime);
          osc.frequency.exponentialRampToValueAtTime(1500, startTime + 0.2);
          osc.frequency.exponentialRampToValueAtTime(600, startTime + 0.4);
        }
        gain.gain.setValueAtTime(0.15, ctx.currentTime); 
        gain.gain.setValueAtTime(0.15, ctx.currentTime + 1.9);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 2.0);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 2.0);
      } else if (typeToPlay === 'firetruck') {
        osc.type = 'square';
        for (let i = 0; i < 2; i++) {
          osc.frequency.setValueAtTime(600, ctx.currentTime + i * 1.0);
          osc.frequency.setValueAtTime(600, ctx.currentTime + i * 1.0 + 0.49);
          osc.frequency.setValueAtTime(800, ctx.currentTime + i * 1.0 + 0.5);
          osc.frequency.setValueAtTime(800, ctx.currentTime + i * 1.0 + 0.99);
        }
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + 1.9);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 2.0);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 2.0);
      } else if (typeToPlay === 'drums') {
        osc.type = 'sine'; // Âm trầm
        for (let i = 0; i < 6; i++) {
          const t = ctx.currentTime + i * 0.3;
          osc.frequency.setValueAtTime(150, t);
          osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
          gain.gain.setValueAtTime(0.9, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        }
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 1.8);
      } else if (typeToPlay === 'thunder') {
        const bufferSize = ctx.sampleRate * 2; 
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1; // Tạo nhiễu trắng (White noise)
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, ctx.currentTime); // Sét nổ
        filter.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 1.5); // Sét rền
        noise.connect(filter);
        filter.connect(gain);
        
        gain.gain.setValueAtTime(0.01, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 0.1); // Nổ bùm
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.9); // Rền tắt dần
        noise.start(ctx.currentTime);
        // Không dùng osc cho tiếng sét
      } else if (typeToPlay === 'lion') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(45, ctx.currentTime); // Rất trầm
        osc.frequency.linearRampToValueAtTime(30, ctx.currentTime + 1.5);
        // Tạo hiệu ứng rung giọng (Tremolo)
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 12; // Rung 12 lần/s
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.5;
        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        lfo.start(ctx.currentTime);
        lfo.stop(ctx.currentTime + 1.5);

        gain.gain.setValueAtTime(0.01, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.8, ctx.currentTime + 0.3); // Gầm to lên
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 1.5);
      }
    } catch(e) { 
      console.error("Audio error:", e); 
    }
  };

  const handleStart = () => {
    setStarted(true);
    playAlarm(); // Kêu thử 1 tiếng để mở khóa Audio
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    const date = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
    return `${time} (${date})`;
  };

  const formatCountdown = (diffMins) => {
    const isOverdue = diffMins < 0;
    const absMins = Math.abs(diffMins);
    
    let text = '';
    if (absMins >= 1440) {
      const days = Math.floor(absMins / 1440);
      const remainingHours = Math.floor((absMins % 1440) / 60);
      text = remainingHours > 0 ? `${days} ngày ${remainingHours} tiếng` : `${days} ngày`;
    } else if (absMins >= 60) {
      const hours = Math.floor(absMins / 60);
      const remainingMins = Math.floor(absMins % 60);
      text = remainingMins > 0 ? `${hours} tiếng ${remainingMins} phút` : `${hours} tiếng`;
    } else {
      text = `${Math.ceil(absMins)} phút`;
    }
    
    return isOverdue ? `Quá hạn ${text}` : `Còn ${text}`;
  };

  if (!started) {
    return (
      <div style={styles.fullscreenCenter}>
        <div style={styles.startBox}>
          <MonitorPlay size={64} color="var(--primary-color)" />
          <h1 style={{ color: '#fff', fontSize: '2rem', margin: '1rem 0' }}>MÀN HÌNH THEO DÕI TIẾN ĐỘ</h1>
          <p style={{ color: '#94a3b8', fontSize: '1.2rem', marginBottom: '2rem' }}>
            Cần thao tác click 1 lần để trình duyệt cho phép tự động phát chuông báo động.
          </p>
          <button onClick={handleStart} style={styles.startBtn}>BẮT ĐẦU THEO DÕI (MỞ LOA)</button>
          <div style={{ marginTop: '2rem' }}>
            <label style={{ color: '#cbd5e1', marginRight: '1rem', fontSize: '1.2rem' }}>Chọn kiểu chuông:</label>
            <select 
              value={alarmType} 
              onChange={(e) => {
                const val = e.target.value;
                setAlarmType(val);
                localStorage.setItem('tv_alarm_type', val);
                setTimeout(() => playAlarm(val), 100);
              }}
              style={styles.selectBox}
            >
              <option value="siren">🚨 Còi hú (Cơ bản)</option>
              <option value="police">🚓 Còi Cảnh Sát (Rất mạnh)</option>
              <option value="firetruck">🚒 Còi Cứu Hỏa (Kéo dài)</option>
              <option value="drums">🥁 Trống Thúc Giục (Dồn dập)</option>
              <option value="thunder">⚡ Tiếng Sét Đánh (Rền vang)</option>
              <option value="lion">🦁 Sư Tử Gầm (Trầm)</option>
              <option value="beep">⚠️ Tiếng Bíp (Vừa)</option>
              <option value="bell">🔔 Tiếng Chuông (Nhẹ)</option>
            </select>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={isAlarming ? styles.bgAlarm : styles.bgNormal}>
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Activity size={40} color={isAlarming ? '#fff' : 'var(--primary-color)'} className={isAlarming ? 'spin' : ''} />
          <h1 style={{ margin: 0, fontSize: '2.5rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px' }}>
            TIẾN ĐỘ CÔNG VIỆC XƯỞNG
          </h1>
        </div>
        <div style={styles.clockBox}>
          <Clock size={32} />
          <span>{currentTime.toLocaleTimeString('vi-VN', { hour12: false })}</span>
        </div>
      </header>

      <main style={{ padding: '2rem', height: 'calc(100vh - 120px)', overflowY: 'hidden' }}>
        <div style={styles.grid}>
          {tasks.map(task => {
            const due = new Date(task.due_date);
            const diffMins = (due.getTime() - currentTime.getTime()) / 60000;
            const isDanger = diffMins <= 15;
            
            return (
              <div key={task.id} style={isDanger ? styles.cardDanger : styles.cardNormal}>
                {isDanger && (
                  <div style={styles.alertIcon}>
                     <AlertTriangle size={36} color="#fff" />
                  </div>
                )}
                <div style={{ flex: 1 }}>
                   <div style={styles.workerName}>{task.memberNames?.length ? task.memberNames.join(', ') : 'Chưa gán'}</div>
                   <div style={styles.taskTitle}>{task.title}</div>
                </div>
                <div style={styles.timeBox}>
                   <div style={{ fontSize: '1.2rem', color: isDanger ? '#ffe4e6' : '#bbf7d0' }}>Hạn chót</div>
                   <div style={styles.deadline}>{formatTime(task.due_date)}</div>
                   <div style={{
                       ...styles.countdown, 
                       color: isDanger ? '#fef08a' : '#dcfce3',
                       background: 'rgba(0,0,0,0.3)'
                   }}>
                      {formatCountdown(diffMins)}
                   </div>
                </div>
              </div>
            );
          })}
          
          {tasks.length === 0 && (
             <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '5rem', color: '#94a3b8', fontSize: '2rem' }}>
                🎉 Xưởng hiện tại không có công việc nào đang chờ.
             </div>
          )}
        </div>
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse-red {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); transform: scale(1); }
          50% { box-shadow: 0 0 0 20px rgba(239, 68, 68, 0); transform: scale(1.02); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); transform: scale(1); }
        }
        @keyframes bg-blink {
          0% { background-color: #0f172a; }
          50% { background-color: #854d0e; }
          100% { background-color: #0f172a; }
        }
      `}} />
    </div>
  );
};

const styles = {
  fullscreenCenter: { height: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  startBox: { textAlign: 'center', background: '#1e293b', padding: '4rem', borderRadius: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' },
  startBtn: { background: 'var(--primary-color)', color: '#fff', border: 'none', padding: '1.5rem 3rem', fontSize: '1.5rem', fontWeight: 'bold', borderRadius: '12px', cursor: 'pointer', textTransform: 'uppercase' },
  
  bgNormal: { height: '100vh', background: '#0f172a', color: '#f8fafc', transition: 'background-color 1s ease' },
  bgAlarm: { height: '100vh', color: '#f8fafc', animation: 'bg-blink 2s infinite' },
  
  selectBox: { padding: '0.75rem 1rem', fontSize: '1.2rem', borderRadius: '8px', background: '#334155', color: '#fff', border: '1px solid #475569', outline: 'none', cursor: 'pointer' },
  
  header: { padding: '1.5rem 2.5rem', borderBottom: '2px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 23, 42, 0.8)' },
  clockBox: { display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '2.5rem', fontWeight: 'bold', fontFamily: 'monospace' },
  
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(600px, 1fr))', gap: '1.5rem', alignContent: 'start', height: '100%' },
  
  cardNormal: { background: '#14532d', borderRadius: '16px', padding: '1.5rem 2rem', display: 'flex', alignItems: 'center', borderLeft: '8px solid #22c55e', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' },
  cardDanger: { background: '#991b1b', borderRadius: '16px', padding: '1.5rem 2rem', display: 'flex', alignItems: 'center', borderLeft: '8px solid #f87171', animation: 'pulse-red 1s infinite', boxShadow: '0 20px 25px -5px rgba(220, 38, 38, 0.4)' },
  
  alertIcon: { marginRight: '1.5rem' },
  // Việc nhóm nhiều tên: cho xuống dòng nhưng chặn ở 2 dòng, không để đẩy vỡ thẻ trên TV
  workerName: { fontSize: '1.8rem', fontWeight: 700, marginBottom: '0.5rem', color: '#f8fafc', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  taskTitle: { fontSize: '1.4rem', color: '#cbd5e1', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  
  timeBox: { textAlign: 'right', minWidth: '180px' },
  deadline: { fontSize: '1.8rem', fontWeight: 800, fontFamily: 'monospace', whiteSpace: 'nowrap' },
  countdown: { fontSize: '1.2rem', fontWeight: 700, color: '#fef08a', marginTop: '0.5rem', background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '8px', display: 'inline-block' }
};

export default TvDashboard;
