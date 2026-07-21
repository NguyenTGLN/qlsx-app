import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import './index.css'
import App from './App.jsx'

// Phòng xa cùng nhóm lỗi với việc bỏ mũi tên spinner (xem index.css): lăn chuột ngang qua ô
// <input type="number"> đang focus làm một số trình duyệt (Firefox, Chrome bản cũ) tự tăng/giảm
// số — SL vừa gõ đổi âm thầm khi cuộn trang. Chrome hiện tại đã bỏ hành vi này, nên đây KHÔNG
// phải nguyên nhân sự cố rơi mã hàng; giữ lại để an toàn trên trình duyệt khác.
// Nhả focus khi cuộn là đủ chặn: trình duyệt chỉ đổi giá trị khi ô đang focus.
document.addEventListener('wheel', () => {
  const el = document.activeElement
  if (el && el.tagName === 'INPUT' && el.type === 'number') el.blur()
}, { passive: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
