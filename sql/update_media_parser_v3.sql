-- ==============================================================================
-- BẢN CẬP NHẬT: SỬA LỖI KHÔNG NHẬN DIỆN ĐƯỢC LOẠI TIN NHẮN (msgType) CỦA ZALO
-- ==============================================================================

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
    NEW.uid_from := COALESCE(NEW.raw_data->'data'->>'uidFrom', NEW.raw_data->'data'->>'fromuid');
    NEW.sender_name := COALESCE(NEW.raw_data->'data'->>'dName', NEW.raw_data->'data'->>'source_name');
    
    -- Lấy msgType an toàn từ nhiều nguồn, nếu không có thì để rỗng
    NEW.msg_type := COALESCE(NEW.raw_data->'data'->>'msgType', NEW.raw_data->'filter'->>'msgType', '');
    
    IF NEW.raw_data->'data'->>'ts' IS NOT NULL THEN
        NEW.ts := (NEW.raw_data->'data'->>'ts')::BIGINT;
    ELSE
        NEW.ts := (extract(epoch from now()) * 1000)::BIGINT;
    END IF;

    v_is_group := (NEW.raw_data->>'type' = '1');

    SELECT EXISTS(
        SELECT 1 FROM public.nhan_vien WHERE id::TEXT = NEW.uid_from
    ) INTO NEW.is_staff;

    -- 3. Nhặt các file đính kèm (Xử lý triệt để trường hợp chuỗi rỗng của Zalo bằng NULLIF)
    v_href := NULLIF(COALESCE(NEW.raw_data->'filter'->>'href', NEW.raw_data->'data'->'content'->>'href', NEW.raw_data->'data'->'content'->>'url'), '');
    v_thumb := NULLIF(COALESCE(NEW.raw_data->'filter'->>'thumb', NEW.raw_data->'data'->'content'->>'thumb'), '');
    v_text := NULLIF(COALESCE(NEW.raw_data->'filter'->>'content', NEW.raw_data->'data'->'content'->>'title', NEW.raw_data->'data'->'content'->>'description'), '');

    IF NEW.msg_type LIKE '%sticker%' THEN
        NEW.content := '[Sticker]';
    ELSIF NEW.msg_type LIKE '%photo%' OR NEW.msg_type LIKE '%image%' OR NEW.msg_type LIKE '%picture%' THEN
        NEW.content := COALESCE(v_text, '[Hình ảnh]');
    ELSIF NEW.msg_type LIKE '%video%' THEN
        NEW.content := COALESCE(v_text, '[Video]');
    ELSIF NEW.msg_type LIKE '%voice%' THEN
        NEW.content := '[Ghi âm]';
    ELSIF NEW.msg_type LIKE '%file%' OR NEW.msg_type LIKE '%link%' THEN
        NEW.content := COALESCE(v_text, '[Tài liệu đính kèm]');
    ELSE
        -- Nếu Zalo gửi một loại tin nhắn lạ hoắc nhưng có chứa link media
        IF v_href IS NOT NULL THEN
            IF v_thumb IS NOT NULL THEN
                NEW.content := COALESCE(v_text, '[Hình ảnh/Video]');
            ELSE
                NEW.content := COALESCE(v_text, '[Tài liệu đính kèm]');
            END IF;
        ELSE
            NEW.content := COALESCE(v_text, '');
        END IF;
    END IF;

    -- [GIAI ĐOẠN 2] XỬ LÝ NGHIỆP VỤ KPI
    IF NEW.is_staff = true THEN
        v_target_uid := COALESCE(
            NEW.raw_data->'data'->'quote'->>'ownerId', 
            NEW.raw_data->'data'->'mentions'->0->>'uid'
        );
        
        IF v_target_uid IS NOT NULL THEN
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
                        'href', v_href,
                        'thumb', v_thumb
                    ))
                WHERE id = v_conv_record.id
                RETURNING id INTO v_conversation_id;
            END IF;
        END IF;

    ELSE
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
                content_summary = CASE 
                    WHEN NEW.msg_type LIKE '%sticker%' THEN content_summary 
                    ELSE content_summary || E'\n' || NEW.content 
                END,
                media_data = CASE 
                    WHEN v_href IS NOT NULL AND NEW.msg_type NOT LIKE '%sticker%' THEN 
                        media_data || jsonb_build_array(jsonb_build_object('type', NEW.msg_type, 'href', v_href, 'thumb', v_thumb))
                    ELSE media_data 
                END
            WHERE id = v_conversation_id;
        ELSE
            INSERT INTO public.zalo_conversations (
                thread_id, customer_uid, customer_name, is_group,
                first_message_ts, last_message_ts, content_summary, message_count,
                media_data
            ) VALUES (
                NEW.thread_id, NEW.uid_from, NEW.sender_name, v_is_group,
                NEW.ts, NEW.ts, 
                CASE WHEN NEW.msg_type LIKE '%sticker%' THEN '' ELSE NEW.content END, 
                1,
                CASE 
                    WHEN v_href IS NOT NULL AND NEW.msg_type NOT LIKE '%sticker%' THEN 
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
