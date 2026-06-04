-- ==============================================================================
-- BẢN CẬP NHẬT 12: FIX LỖI THREAD_ID TRONG CHAT 1-1 LÀM TÁCH HỘI THOẠI
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.process_zalo_message_kpi()
RETURNS TRIGGER AS $$
DECLARE
    v_conversation_id UUID;
    v_target_uid TEXT;
    v_is_group BOOLEAN;
    
    v_conv_id UUID := NULL;
    v_conv_ts BIGINT := NULL;
    v_is_responded BOOLEAN := false;
    v_message_count INT := 0;
    
    v_href TEXT;
    v_thumb TEXT;
    v_text TEXT;
    v_is_target_a_responder BOOLEAN;
    
    v_group_name TEXT;
    v_customer_uid TEXT;
    v_customer_name TEXT;
BEGIN
    -- [GIAI ĐOẠN 1] BÓC TÁCH DỮ LIỆU TỪ RAW JSON
    NEW.thread_id := COALESCE(NEW.raw_data->>'threadId', NEW.raw_data->'data'->>'idTo');
    NEW.uid_from := COALESCE(NEW.raw_data->'data'->>'uidFrom', NEW.raw_data->'data'->>'fromuid');
    NEW.sender_name := COALESCE(NEW.raw_data->'data'->>'dName', NEW.raw_data->'data'->>'source_name');
    NEW.msg_type := COALESCE(NEW.raw_data->'data'->>'msgType', NEW.raw_data->'filter'->>'msgType', '');
    
    v_is_group := (NEW.raw_data->>'type' = '1');

    v_group_name := COALESCE(
        NEW.raw_data->'data'->>'groupName', 
        NEW.raw_data->>'groupName', 
        NEW.raw_data->'data'->>'source_name'
    );
    
    IF v_is_group AND (v_group_name IS NULL OR v_group_name = '') THEN
        BEGIN
            SELECT group_name INTO v_group_name 
            FROM public.zalo_groups 
            WHERE group_id = NEW.thread_id 
            LIMIT 1;
        EXCEPTION WHEN others THEN
        END;
    END IF;
    
    IF NEW.raw_data->'data'->>'ts' IS NOT NULL THEN
        NEW.ts := (NEW.raw_data->'data'->>'ts')::BIGINT;
    ELSE
        NEW.ts := (extract(epoch from now()) * 1000)::BIGINT;
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM public.nhan_vien WHERE uid_from = NEW.uid_from
    ) INTO NEW.is_staff;

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

    -- [GIAI ĐOẠN 2] NHẬN DIỆN VÀ GOM NHÓM
    
    v_target_uid := COALESCE(
        NEW.raw_data->'data'->'quote'->>'ownerId', 
        NEW.raw_data->'data'->'quote'->>'uidFrom',
        NEW.raw_data->'quote'->>'ownerId',
        NEW.raw_data->'data'->'mentions'->0->>'uid'
    );

    IF NEW.is_staff = true THEN
        IF v_target_uid IS NOT NULL AND v_target_uid != NEW.uid_from THEN
            v_customer_uid := v_target_uid;
        ELSIF v_is_group = false THEN
            v_customer_uid := NEW.thread_id;
        ELSE
            v_customer_uid := NULL;
        END IF;

        IF v_customer_uid IS NOT NULL THEN
            -- MỚI: Bỏ qua thread_id trong trường hợp chat 1-1, chỉ match customer_uid
            SELECT id, first_message_ts INTO v_conv_id, v_conv_ts
            FROM public.zalo_conversations
            WHERE is_group = v_is_group
              AND (v_is_group = false OR thread_id = NEW.thread_id)
              AND customer_uid = v_customer_uid
              AND (NEW.ts - last_message_ts) <= 259200000 
            ORDER BY last_message_ts DESC
            LIMIT 1;

            IF v_conv_id IS NOT NULL THEN
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
                    )),
                    group_name = COALESCE(group_name, v_group_name)
                WHERE id = v_conv_id
                RETURNING id INTO v_conversation_id;
            ELSE
                INSERT INTO public.zalo_conversations (
                    thread_id, customer_uid, customer_name, is_group,
                    first_message_ts, last_message_ts, content_summary, message_count,
                    media_data, group_name,
                    is_responded, responder_uid, responder_name, response_ts, response_content, response_time_ms, responses_data
                ) VALUES (
                    NEW.thread_id, v_customer_uid, 
                    CASE WHEN v_is_group = false THEN 'Khách cá nhân' ELSE 'Khách hàng (Từ Quote)' END,
                    v_is_group,
                    NEW.ts, NEW.ts, 
                    '', 0, '[]'::jsonb, v_group_name,
                    true, NEW.uid_from, NEW.sender_name, NEW.ts, NEW.content, 0,
                    jsonb_build_array(jsonb_build_object(
                        'uid', NEW.uid_from,
                        'name', NEW.sender_name,
                        'content', NEW.content,
                        'ts', NEW.ts,
                        'href', v_href,
                        'thumb', v_thumb
                    ))
                ) RETURNING id INTO v_conversation_id;
            END IF;
        ELSE
            v_conversation_id := NULL;
        END IF;

    ELSE
        v_customer_uid := NEW.uid_from;
        
        -- MỚI: Bỏ qua thread_id trong trường hợp chat 1-1, chỉ match customer_uid
        SELECT id, is_responded, message_count INTO v_conv_id, v_is_responded, v_message_count
        FROM public.zalo_conversations
        WHERE is_group = v_is_group
          AND (v_is_group = false OR thread_id = NEW.thread_id)
          AND customer_uid = v_customer_uid
          AND (
              (is_responded = false AND (NEW.ts - last_message_ts) <= 300000)
              OR 
              (is_responded = true AND message_count = 0 AND (NEW.ts - response_ts) <= 300000)
          )
        ORDER BY last_message_ts DESC
        LIMIT 1;

        IF v_conv_id IS NOT NULL THEN
            IF v_is_responded = true AND v_message_count = 0 THEN
                UPDATE public.zalo_conversations
                SET first_message_ts = NEW.ts,
                    last_message_ts = NEW.ts,
                    message_count = 1,
                    response_time_ms = response_ts - NEW.ts,
                    content_summary = CASE WHEN NEW.msg_type LIKE '%sticker%' THEN '' ELSE NEW.content END,
                    media_data = CASE 
                        WHEN v_href IS NOT NULL AND NEW.msg_type NOT LIKE '%sticker%' THEN 
                            jsonb_build_array(jsonb_build_object('type', NEW.msg_type, 'href', v_href, 'thumb', v_thumb))
                        ELSE '[]'::jsonb 
                    END,
                    customer_name = NEW.sender_name
                WHERE id = v_conv_id
                RETURNING id INTO v_conversation_id;
            ELSE
                UPDATE public.zalo_conversations
                SET last_message_ts = NEW.ts,
                    message_count = message_count + 1,
                    content_summary = CASE 
                        WHEN NEW.msg_type LIKE '%sticker%' THEN content_summary 
                        ELSE CASE WHEN content_summary = '' THEN NEW.content ELSE content_summary || E'\n' || NEW.content END
                    END,
                    media_data = CASE 
                        WHEN v_href IS NOT NULL AND NEW.msg_type NOT LIKE '%sticker%' THEN 
                            COALESCE(media_data, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('type', NEW.msg_type, 'href', v_href, 'thumb', v_thumb))
                        ELSE COALESCE(media_data, '[]'::jsonb) 
                    END,
                    group_name = COALESCE(group_name, v_group_name)
                WHERE id = v_conv_id
                RETURNING id INTO v_conversation_id;
            END IF;
        ELSE
            INSERT INTO public.zalo_conversations (
                thread_id, customer_uid, customer_name, is_group,
                first_message_ts, last_message_ts, content_summary, message_count,
                media_data, group_name
            ) VALUES (
                NEW.thread_id, v_customer_uid, NEW.sender_name, v_is_group,
                NEW.ts, NEW.ts, 
                CASE WHEN NEW.msg_type LIKE '%sticker%' THEN '' ELSE NEW.content END, 
                1,
                CASE 
                    WHEN v_href IS NOT NULL AND NEW.msg_type NOT LIKE '%sticker%' THEN 
                        jsonb_build_array(jsonb_build_object('type', NEW.msg_type, 'href', v_href, 'thumb', v_thumb))
                    ELSE '[]'::jsonb 
                END,
                v_group_name
            ) RETURNING id INTO v_conversation_id;
        END IF;
    END IF;

    NEW.conversation_id := v_conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
