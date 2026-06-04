-- ==============================================================================
-- BẢN CẬP NHẬT: HỖ TRỢ NHIỀU NHÂN VIÊN CÙNG TRẢ LỜI & CẬP NHẬT CÂU TRẢ LỜI
-- ==============================================================================

-- 1. Thêm cột mới để lưu danh sách các câu trả lời dạng Mảng (JSONB)
ALTER TABLE public.zalo_conversations 
ADD COLUMN IF NOT EXISTS responder_name TEXT,
ADD COLUMN IF NOT EXISTS responses_data JSONB DEFAULT '[]'::jsonb;

-- 2. Đóng gói dữ liệu cũ (chuyển các câu trả lời hiện tại thành mảng để không mất dữ liệu)
UPDATE public.zalo_conversations
SET responses_data = jsonb_build_array(jsonb_build_object(
    'uid', responder_uid,
    'name', COALESCE(responder_name, 'Hệ thống'),
    'content', response_content,
    'ts', response_ts
))
WHERE is_responded = true 
  AND response_content IS NOT NULL 
  AND jsonb_array_length(responses_data) = 0;

-- 3. Cập nhật lại Hàm Trigger để GỘP câu trả lời thay vì bỏ qua
CREATE OR REPLACE FUNCTION public.process_zalo_message_kpi()
RETURNS TRIGGER AS $$
DECLARE
    v_conversation_id UUID;
    v_target_uid TEXT;
    v_is_group BOOLEAN;
    v_conv_record RECORD;
BEGIN
    v_is_group := (NEW.raw_data->>'type' = '1');

    IF NEW.is_staff = true THEN
        -- TÌNH HUỐNG 1: NHÂN VIÊN TRẢ LỜI
        v_target_uid := COALESCE(
            NEW.raw_data->'data'->'quote'->>'ownerId', 
            NEW.raw_data->'data'->'mentions'->0->>'uid'
        );
        
        IF v_target_uid IS NOT NULL THEN
            -- BỎ ĐIỀU KIỆN is_responded = false
            -- Tìm phiên hội thoại gần nhất của khách hàng này để nhét thêm câu trả lời
            SELECT id, first_message_ts INTO v_conv_record
            FROM public.zalo_conversations
            WHERE thread_id = NEW.thread_id
              AND customer_uid = v_target_uid
            ORDER BY last_message_ts DESC
            LIMIT 1;

            IF v_conv_record.id IS NOT NULL THEN
                UPDATE public.zalo_conversations
                SET is_responded = true,
                    -- Vẫn giữ tên người trả lời đầu tiên ở cột gốc
                    responder_uid = COALESCE(responder_uid, NEW.uid_from),
                    responder_name = COALESCE(responder_name, NEW.sender_name),
                    response_ts = COALESCE(response_ts, NEW.ts),
                    response_time_ms = COALESCE(response_time_ms, NEW.ts - v_conv_record.first_message_ts),
                    -- Gộp nội dung
                    response_content = CASE 
                        WHEN response_content IS NULL OR response_content = '' THEN NEW.content
                        ELSE response_content || E'\n---\n' || NEW.content
                    END,
                    -- Đẩy thêm dữ liệu vào mảng JSONB để hiển thị tách dòng trên UI
                    responses_data = responses_data || jsonb_build_array(jsonb_build_object(
                        'uid', NEW.uid_from,
                        'name', NEW.sender_name,
                        'content', NEW.content,
                        'ts', NEW.ts
                    ))
                WHERE id = v_conv_record.id
                RETURNING id INTO v_conversation_id;
            END IF;
        END IF;

    ELSE
        -- TÌNH HUỐNG 2: KHÁCH HÀNG NHẮN TIN
        SELECT id INTO v_conversation_id
        FROM public.zalo_conversations
        WHERE thread_id = NEW.thread_id
          AND customer_uid = NEW.uid_from
          AND is_responded = false
          AND (NEW.ts - last_message_ts) <= 300000
        ORDER BY last_message_ts DESC
        LIMIT 1;

        IF FOUND THEN
            UPDATE public.zalo_conversations
            SET last_message_ts = NEW.ts,
                message_count = message_count + 1,
                content_summary = content_summary || E'\n' || NEW.content
            WHERE id = v_conversation_id;
        ELSE
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
