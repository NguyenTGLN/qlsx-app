-- ==============================================================================
-- BẢN CẬP NHẬT: TỰ ĐỘNG BÓC TÁCH JSON RAW VÀ NHẶT MEDIA (ẢNH, VIDEO, FILE)
-- ==============================================================================

-- 1. Nới lỏng bảng zalo_messages để n8n chỉ cần truyền đúng trường raw_data
ALTER TABLE public.zalo_messages 
ALTER COLUMN thread_id DROP NOT NULL,
ALTER COLUMN uid_from DROP NOT NULL,
ALTER COLUMN ts DROP NOT NULL;

-- 2. Thêm cột media_data vào bảng zalo_conversations để lưu tài liệu khách gửi
ALTER TABLE public.zalo_conversations 
ADD COLUMN IF NOT EXISTS media_data JSONB DEFAULT '[]'::jsonb;

-- 3. Cập nhật lại Hàm Trigger thần thánh
CREATE OR REPLACE FUNCTION public.process_zalo_message_kpi()
RETURNS TRIGGER AS $$
DECLARE
    v_conversation_id UUID;
    v_target_uid TEXT;
    v_is_group BOOLEAN;
    v_conv_record RECORD;
    v_href TEXT;
    v_thumb TEXT;
    v_text TEXT;
BEGIN
    -- [GIAI ĐOẠN 1] BÓC TÁCH DỮ LIỆU TỪ RAW JSON
    -- 1. Lấy thông tin cơ bản
    NEW.thread_id := COALESCE(NEW.raw_data->>'threadId', NEW.raw_data->'data'->>'idTo');
    NEW.uid_from := NEW.raw_data->'data'->>'uidFrom';
    NEW.sender_name := NEW.raw_data->'data'->>'dName';
    NEW.msg_type := NEW.raw_data->'data'->>'msgType';
    
    -- Xử lý Timestamp (nếu có, đổi sang BIGINT)
    IF NEW.raw_data->'data'->>'ts' IS NOT NULL THEN
        NEW.ts := (NEW.raw_data->'data'->>'ts')::BIGINT;
    ELSE
        NEW.ts := (extract(epoch from now()) * 1000)::BIGINT;
    END IF;

    v_is_group := (NEW.raw_data->>'type' = '1');

    -- 2. Tự đối chiếu ID xem người nhắn có phải nhân viên không (có nằm trong bảng nhan_vien không)
    SELECT EXISTS(
        SELECT 1 FROM public.nhan_vien WHERE id::TEXT = NEW.uid_from
    ) INTO NEW.is_staff;

    -- 3. Nhặt các file đính kèm (Ảnh, Video, File, Voice)
    v_href := NEW.raw_data->'filter'->>'href';
    v_thumb := NEW.raw_data->'filter'->>'thumb';
    v_text := NEW.raw_data->'filter'->>'content';
    
    IF v_text IS NULL OR v_text = '' THEN
        v_text := NEW.raw_data->'data'->'content'->>'title';
    END IF;

    IF NEW.msg_type = 'chat.sticker.msg' THEN
        -- Bỏ qua sticker (Không quan tâm)
        NEW.content := '[Sticker]';
    ELSIF NEW.msg_type = 'chat.photo.msg' THEN
        NEW.content := COALESCE(v_text, '[Hình ảnh]');
    ELSIF NEW.msg_type = 'chat.video.msg' THEN
        NEW.content := COALESCE(v_text, '[Video]');
    ELSIF NEW.msg_type = 'chat.voice.msg' THEN
        NEW.content := '[Ghi âm]';
    ELSIF NEW.msg_type = 'chat.file.msg' THEN
        NEW.content := '[Tài liệu đính kèm]';
    ELSE
        NEW.content := COALESCE(v_text, '');
    END IF;

    -- [GIAI ĐOẠN 2] XỬ LÝ NGHIỆP VỤ KPI
    IF NEW.is_staff = true THEN
        -- Nếu là nhân viên, KIỂM TRA XEM CÓ QUOTE (TRẢ LỜI) KHÔNG
        v_target_uid := COALESCE(
            NEW.raw_data->'data'->'quote'->>'ownerId', 
            NEW.raw_data->'data'->'mentions'->0->>'uid'
        );
        
        IF v_target_uid IS NOT NULL THEN
            -- Nếu có quote, cập nhật KPI
            SELECT id, first_message_ts INTO v_conv_record
            FROM public.zalo_conversations
            WHERE thread_id = NEW.thread_id
              AND customer_uid = v_target_uid
            ORDER BY last_message_ts DESC
            LIMIT 1;

            IF v_conv_record.id IS NOT NULL THEN
                UPDATE public.zalo_conversations
                SET is_responded = true,
                    responder_uid = COALESCE(responder_uid, NEW.uid_from),
                    responder_name = COALESCE(responder_name, NEW.sender_name),
                    response_ts = COALESCE(response_ts, NEW.ts),
                    response_time_ms = COALESCE(response_time_ms, NEW.ts - v_conv_record.first_message_ts),
                    response_content = CASE 
                        WHEN response_content IS NULL OR response_content = '' THEN NEW.content
                        ELSE response_content || E'\n---\n' || NEW.content
                    END,
                    responses_data = responses_data || jsonb_build_array(jsonb_build_object(
                        'uid', NEW.uid_from,
                        'name', NEW.sender_name,
                        'content', NEW.content,
                        'ts', NEW.ts,
                        'href', v_href,    -- Nhân viên cũng có thể gửi ảnh
                        'thumb', v_thumb
                    ))
                WHERE id = v_conv_record.id
                RETURNING id INTO v_conversation_id;
            END IF;
        END IF;

    ELSE
        -- Nếu là khách hàng nhắn tin
        SELECT id INTO v_conversation_id
        FROM public.zalo_conversations
        WHERE thread_id = NEW.thread_id
          AND customer_uid = NEW.uid_from
          AND is_responded = false
          AND (NEW.ts - last_message_ts) <= 300000
        ORDER BY last_message_ts DESC
        LIMIT 1;

        IF FOUND THEN
            -- Gom tin nhắn vào hội thoại cũ
            UPDATE public.zalo_conversations
            SET last_message_ts = NEW.ts,
                message_count = message_count + 1,
                content_summary = CASE 
                    WHEN NEW.msg_type = 'chat.sticker.msg' THEN content_summary 
                    ELSE content_summary || E'\n' || NEW.content 
                END,
                -- Thêm media vào mảng nếu có
                media_data = CASE 
                    WHEN v_href IS NOT NULL AND NEW.msg_type != 'chat.sticker.msg' THEN 
                        media_data || jsonb_build_array(jsonb_build_object('type', NEW.msg_type, 'href', v_href, 'thumb', v_thumb))
                    ELSE media_data 
                END
            WHERE id = v_conversation_id;
        ELSE
            -- Tạo hội thoại mới
            INSERT INTO public.zalo_conversations (
                thread_id, customer_uid, customer_name, is_group,
                first_message_ts, last_message_ts, content_summary, message_count,
                media_data
            ) VALUES (
                NEW.thread_id, NEW.uid_from, NEW.sender_name, v_is_group,
                NEW.ts, NEW.ts, 
                CASE WHEN NEW.msg_type = 'chat.sticker.msg' THEN '' ELSE NEW.content END, 
                1,
                CASE 
                    WHEN v_href IS NOT NULL AND NEW.msg_type != 'chat.sticker.msg' THEN 
                        jsonb_build_array(jsonb_build_object('type', NEW.msg_type, 'href', v_href, 'thumb', v_thumb))
                    ELSE '[]'::jsonb 
                END
            ) RETURNING id INTO v_conversation_id;
        END IF;
    END IF;

    NEW.conversation_id := v_conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
