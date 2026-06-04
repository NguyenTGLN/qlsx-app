-- 1. Tạo bảng danh mục nhóm Zalo
CREATE TABLE IF NOT EXISTS public.zalo_groups (
    group_id TEXT PRIMARY KEY,
    group_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Cập nhật Trigger tự động tra cứu tên nhóm
CREATE OR REPLACE FUNCTION public.process_zalo_message_kpi()
RETURNS TRIGGER AS $$
DECLARE
    v_conversation_id UUID;
    v_target_uid TEXT;
    v_is_group BOOLEAN;
    v_group_name TEXT := NULL;
BEGIN
    v_is_group := (NEW.raw_data->>'type' = '1');
    
    -- Nếu là nhóm, TỰ ĐỘNG lấy tên nhóm từ bảng zalo_groups
    IF v_is_group THEN
        SELECT group_name INTO v_group_name 
        FROM public.zalo_groups 
        WHERE group_id = NEW.thread_id;
    END IF;

    IF NEW.is_staff = true THEN
        v_target_uid := COALESCE(
            NEW.raw_data->'data'->'quote'->>'ownerId', 
            NEW.raw_data->'data'->'mentions'->0->>'uid'
        );
        
        IF v_target_uid IS NOT NULL THEN
            SELECT id INTO v_conversation_id
            FROM public.zalo_conversations
            WHERE thread_id = NEW.thread_id
              AND customer_uid = v_target_uid
              AND is_responded = false
            ORDER BY last_message_ts DESC
            LIMIT 1;

            IF v_conversation_id IS NOT NULL THEN
                UPDATE public.zalo_conversations
                SET is_responded = true,
                    responder_uid = NEW.uid_from,
                    responder_name = NEW.sender_name,
                    response_ts = NEW.ts,
                    response_time_ms = NEW.ts - first_message_ts,
                    response_content = NEW.content
                WHERE thread_id = NEW.thread_id
                  AND customer_uid = v_target_uid
                  AND is_responded = false;
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
                content_summary = content_summary || E'\n' || NEW.content
            WHERE id = v_conversation_id;
        ELSE
            -- Ghi đè tên nhóm v_group_name vào dữ liệu
            INSERT INTO public.zalo_conversations (
                thread_id, customer_uid, customer_name, is_group, group_name,
                first_message_ts, last_message_ts, content_summary, message_count
            ) VALUES (
                NEW.thread_id, NEW.uid_from, NEW.sender_name, v_is_group, COALESCE(v_group_name, NEW.group_name),
                NEW.ts, NEW.ts, NEW.content, 1
            ) RETURNING id INTO v_conversation_id;
        END IF;
    END IF;

    NEW.conversation_id := v_conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
