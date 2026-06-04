-- ==============================================================================
-- DATABASE SCHEMA CHO ZALO KPI TRACKING (CHỐNG OVERLOAD IO DISK)
-- ==============================================================================

-- 1. BẢNG TỔNG HỢP (CONVERSATIONS)
-- Bảng này gom các tin nhắn liên tiếp (trong 5 phút) của khách hàng thành 1 phiên.
-- Chỉ dùng bảng này để query lên Dashboard, rất nhẹ và nhanh.
CREATE TABLE IF NOT EXISTS public.zalo_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id TEXT NOT NULL,                  -- ID nhóm Zalo hoặc người dùng (1-1)
    customer_uid TEXT NOT NULL,               -- ID khách hàng phàn nàn/nhắn tin
    customer_name TEXT,                       -- Tên khách hàng
    is_group BOOLEAN DEFAULT FALSE,           -- Đánh dấu đây là nhóm hay chat 1-1
    first_message_ts BIGINT NOT NULL,         -- Thời gian tin nhắn đầu (dùng tính SLA)
    last_message_ts BIGINT NOT NULL,          -- Thời gian tin nhắn cuối (dùng check 5 phút)
    message_count INT DEFAULT 1,              -- Số lượng tin nhắn khách gửi liên tiếp
    content_summary TEXT,                     -- Nội dung gộp của khách
    is_complaint BOOLEAN DEFAULT FALSE,       -- Có từ khóa khiếu nại không (có thể để AI/n8n update sau)
    
    -- KPI Tracking (Đã được xử lý bởi nhân viên chưa?)
    is_responded BOOLEAN DEFAULT FALSE,       
    responder_uid TEXT,                       
    response_ts BIGINT,                       
    response_time_ms BIGINT,                  
    response_content TEXT,                    -- Nội dung nhân viên đã trả lời
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index siêu quan trọng để chống quét full table (Disk IO)
CREATE INDEX IF NOT EXISTS idx_zalo_conv_search ON public.zalo_conversations(thread_id, customer_uid, is_responded, last_message_ts DESC);
CREATE INDEX IF NOT EXISTS idx_zalo_conv_dashboard ON public.zalo_conversations(first_message_ts DESC, is_responded);

-- 2. BẢNG LƯU TIN NHẮN RAW (MESSAGES)
-- Bảng này chỉ dùng để Insert từ n8n/Make, tự động nối với Conversation bằng Trigger.
CREATE TABLE IF NOT EXISTS public.zalo_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES public.zalo_conversations(id) ON DELETE CASCADE,
    thread_id TEXT NOT NULL,
    uid_from TEXT NOT NULL,
    sender_name TEXT,
    msg_type TEXT,                            -- 'webchat', 'photo', v.v...
    content TEXT,
    ts BIGINT NOT NULL,                       -- Timestamp từ Zalo
    is_staff BOOLEAN DEFAULT FALSE,           -- true nếu là nhân viên
    raw_data JSONB,                           -- Lắng đọng toàn bộ payload gốc
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zalo_msg_conv ON public.zalo_messages(conversation_id);


-- ==============================================================================
-- POSTGRESQL TRIGGER: LOGIC GOM NHÓM 5 PHÚT VÀ GHI NHẬN KPI TỰ ĐỘNG
-- ==============================================================================
-- Function này tự động chạy TRƯỚC KHI lưu tin nhắn vào zalo_messages
CREATE OR REPLACE FUNCTION public.process_zalo_message_kpi()
RETURNS TRIGGER AS $$
DECLARE
    v_conversation_id UUID;
    v_target_uid TEXT;
    v_is_group BOOLEAN;
BEGIN
    -- Xác định tin nhắn nhóm hay 1-1
    v_is_group := (NEW.raw_data->>'type' = '1');

    IF NEW.is_staff = true THEN
        -- TÌNH HUỐNG 1: NHÂN VIÊN TRẢ LỜI
        -- Lấy UID của khách hàng được Quote hoặc Tag (Phương án 1: Kỷ luật)
        v_target_uid := COALESCE(
            NEW.raw_data->'data'->'quote'->>'ownerId', 
            NEW.raw_data->'data'->'mentions'->0->>'uid'
        );
        
        IF v_target_uid IS NOT NULL THEN
            -- Cập nhật trạng thái "Đã phản hồi" cho phiên hội thoại đang MỞ của khách này
            UPDATE public.zalo_conversations
            SET is_responded = true,
                responder_uid = NEW.uid_from,
                response_ts = NEW.ts,
                response_time_ms = NEW.ts - first_message_ts,
                response_content = NEW.content
            WHERE thread_id = NEW.thread_id
              AND customer_uid = v_target_uid
              AND is_responded = false
            RETURNING id INTO v_conversation_id;
        END IF;

    ELSE
        -- TÌNH HUỐNG 2: KHÁCH HÀNG NHẮN TIN
        -- Tìm xem khách hàng này có phiên hội thoại nào ĐANG MỞ trong vòng 5 phút (300,000 ms) qua không
        SELECT id INTO v_conversation_id
        FROM public.zalo_conversations
        WHERE thread_id = NEW.thread_id
          AND customer_uid = NEW.uid_from
          AND is_responded = false
          AND (NEW.ts - last_message_ts) <= 300000
        ORDER BY last_message_ts DESC
        LIMIT 1;

        IF FOUND THEN
            -- Có hội thoại trong 5 phút -> Gom vào (Update thời gian & nội dung)
            UPDATE public.zalo_conversations
            SET last_message_ts = NEW.ts,
                message_count = message_count + 1,
                content_summary = content_summary || E'\n' || NEW.content
            WHERE id = v_conversation_id;
        ELSE
            -- Quá 5 phút hoặc chưa có hội thoại nào -> Tạo phiên mới
            INSERT INTO public.zalo_conversations (
                thread_id, customer_uid, customer_name, is_group,
                first_message_ts, last_message_ts, content_summary, message_count
            ) VALUES (
                NEW.thread_id, NEW.uid_from, NEW.sender_name, v_is_group,
                NEW.ts, NEW.ts, NEW.content, 1
            ) RETURNING id INTO v_conversation_id;
        END IF;
    END IF;

    -- Gắn ID của hội thoại vào bản ghi tin nhắn gốc trước khi lưu
    NEW.conversation_id := v_conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Gắn Trigger vào bảng zalo_messages
DROP TRIGGER IF EXISTS trigger_zalo_kpi_process ON public.zalo_messages;
CREATE TRIGGER trigger_zalo_kpi_process
    BEFORE INSERT ON public.zalo_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.process_zalo_message_kpi();

-- ==============================================================================
-- DỌN DẸP TỰ ĐỘNG (GIỮ DB NHẸ)
-- Khuyến nghị: Xóa tin nhắn raw (zalo_messages) cũ hơn 3 tháng (chỉ chạy bằng tay hoặc cron)
-- DELETE FROM public.zalo_messages WHERE created_at < NOW() - INTERVAL '3 months';
-- ==============================================================================
