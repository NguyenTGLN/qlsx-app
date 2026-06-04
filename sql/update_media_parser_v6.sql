-- ==============================================================================
-- BẢN CẬP NHẬT 6: FIX LỖI "RECORD IS NOT ASSIGNED YET" TRONG POSTGRESQL
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.process_zalo_message_kpi()
RETURNS TRIGGER AS $$
DECLARE
    v_conversation_id UUID;
    v_target_uid TEXT;
    v_is_group BOOLEAN;
    
    -- Thay thế RECORD bằng các biến cụ thể để tránh lỗi
    v_conv_id UUID := NULL;
    v_conv_ts BIGINT := NULL;
    
    v_href TEXT;
    v_thumb TEXT;
    v_text TEXT;
    v_is_target_a_responder BOOLEAN;
BEGIN
    -- [GIAI ĐOẠN 1] BÓC TÁCH DỮ LIỆU TỪ RAW JSON
    NEW.thread_id := COALESCE(NEW.raw_data->>'threadId', NEW.raw_data->'data'->>'idTo');
    NEW.uid_from := COALESCE(NEW.raw_data->'data'->>'uidFrom', NEW.raw_data->'data'->>'fromuid');
    NEW.sender_name := COALESCE(NEW.raw_data->'data'->>'dName', NEW.raw_data->'data'->>'source_name');
    NEW.msg_type := COALESCE(NEW.raw_data->'data'->>'msgType', NEW.raw_data->'filter'->>'msgType', '');
    
    IF NEW.raw_data->'data'->>'ts' IS NOT NULL THEN
        NEW.ts := (NEW.raw_data->'data'->>'ts')::BIGINT;
    ELSE
        NEW.ts := (extract(epoch from now()) * 1000)::BIGINT;
    END IF;

    v_is_group := (NEW.raw_data->>'type' = '1');

    -- Bóc tách link file/ảnh
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
        IF v_href IS NOT NULL THEN
            IF v_thumb IS NOT NULL THEN NEW.content := COALESCE(v_text, '[Hình ảnh/Video]');
            ELSE NEW.content := COALESCE(v_text, '[Tài liệu đính kèm]'); END IF;
        ELSE NEW.content := COALESCE(v_text, ''); END IF;
    END IF;

    -- [GIAI ĐOẠN 2] NHẬN DIỆN NHÂN VIÊN VÀ XỬ LÝ KPI
    
    -- Trích xuất ID của người bị Quote (Người được trả lời)
    v_target_uid := COALESCE(
        NEW.raw_data->'data'->'quote'->>'ownerId', 
        NEW.raw_data->'data'->'quote'->>'uidFrom',
        NEW.raw_data->'quote'->>'ownerId',
        NEW.raw_data->'data'->'mentions'->0->>'uid'
    );

    v_is_target_a_responder := false;
    IF v_target_uid IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.zalo_conversations
            WHERE thread_id = NEW.thread_id
              AND (responder_uid = v_target_uid OR 
                  (responses_data IS NOT NULL AND responses_data @> jsonb_build_array(jsonb_build_object('uid', v_target_uid))))
        ) INTO v_is_target_a_responder;
    END IF;
    
    -- TÌM KIẾM HỘI THOẠI KHÁCH HÀNG
    IF v_target_uid IS NOT NULL AND v_target_uid != NEW.uid_from AND v_is_target_a_responder = false THEN
        SELECT id, first_message_ts INTO v_conv_id, v_conv_ts
        FROM public.zalo_conversations
        WHERE thread_id = NEW.thread_id
          AND customer_uid = v_target_uid
          AND (NEW.ts - last_message_ts) <= 259200000 -- Tối đa 3 ngày
        ORDER BY last_message_ts DESC
        LIMIT 1;
    END IF;

    -- NẾU TÌM THẤY HỘI THOẠI -> ĐÂY LÀ NHÂN VIÊN TRẢ LỜI KHÁCH HÀNG
    IF v_conv_id IS NOT NULL THEN
        NEW.is_staff := true;
        
        UPDATE public.zalo_conversations
        SET is_responded = true,
            responder_uid = COALESCE(responder_uid, NEW.uid_from),
            responder_name = COALESCE(responder_name, NEW.sender_name),
            response_ts = COALESCE(response_ts, NEW.ts),
            response_time_ms = COALESCE(response_time_ms, NEW.ts - v_conv_ts),
            response_content = CASE 
                WHEN response_content IS NULL OR response_content = '' THEN NEW.content
                ELSE response_content || E'\n---\n' || NEW.content
            END,
            responses_data = COALESCE(responses_data, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                'uid', NEW.uid_from,
                'name', NEW.sender_name,
                'content', NEW.content,
                'ts', NEW.ts,
                'href', v_href,
                'thumb', v_thumb
            ))
        WHERE id = v_conv_id
        RETURNING id INTO v_conversation_id;

    -- NẾU KHÔNG TÌM THẤY -> LÀ TIN NHẮN TẠO YÊU CẦU MỚI
    ELSE
        NEW.is_staff := false;

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
                        COALESCE(media_data, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('type', NEW.msg_type, 'href', v_href, 'thumb', v_thumb))
                    ELSE COALESCE(media_data, '[]'::jsonb) 
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
