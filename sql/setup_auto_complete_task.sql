-- ==============================================================================
-- TRIGGER TỰ ĐỘNG HOÀN THÀNH CÔNG VIỆC TỪ ZALO
-- Mục đích: Đóng task "Báo cáo công việc cuối ngày" khi nhân viên nhắn vào nhóm
-- Nhóm đích: 6491009630666576664 (đang dùng) + 6274675927160413910 (nhóm cũ)
-- Điều kiện: Tin nhắn có chữ "báo cáo" (kể cả viết liền) HOẶC từ "bc" đứng riêng
-- Việc nhóm: ai trong nhóm gửi cũng đóng được việc cho cả nhóm
--            (luật "ai xong trước là xong cả nhóm" — xem sql/setup_task_multi_assignee.sql)
--
-- SỬA 31/07/2026 — trigger nằm im từ 26/05/2026, do hai lỗi chồng nhau:
--   1. SAI MÃ NHÓM. Bản cũ canh '6274675927160413910', nhưng nhóm báo cáo đang dùng là
--      '6491009630666576664' (xác nhận bằng tin thật lúc 19:00 ngày 31/07/2026).
--      Giữ lại mã cũ trong danh sách để ai còn gửi vào nhóm cũ vẫn đóng được việc.
--   2. TỪ KHOÁ QUÁ CHẶT. Bản cũ chỉ khớp 'em gửi báo cáo'/'em báo cáo' nên trượt tin
--      thật "E gửi bc ngày 06.06 ạ" (đo được trong zalo_messages ngày 06/06/2026).
--
-- GIỚI HẠN ĐÃ BIẾT của cách nhận diện theo từ khoá:
--   - Ảnh chụp báo cáo KHÔNG kèm chú thích sẽ trượt, vì lúc đó content chỉ là '[Hình ảnh]'.
--   - Câu như "em xem báo cáo rồi nhé" vẫn bị tính là đã báo cáo.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.process_zalo_auto_complete_task()
RETURNS TRIGGER AS $$
DECLARE
    v_staff_id TEXT;
    v_staff_name TEXT;
    v_task_id TEXT;
    v_max_id INT;
    v_new_td_id TEXT;
    -- Nhóm Zalo dùng để gửi báo cáo cuối ngày.
    c_nhom_bao_cao CONSTANT TEXT[] := ARRAY['6491009630666576664', '6274675927160413910'];
BEGIN
    -- 1. CHỈ CHẠY NẾU TIN VÀO ĐÚNG NHÓM BÁO CÁO VÀ CÓ DẤU HIỆU LÀ TIN BÁO CÁO.
    --    ILIKE cho phần tiếng Việt (đã kiểm chứng khớp được cả chữ hoa lẫn dấu);
    --    regex \y cho "bc" để KHÔNG bắt nhầm chữ chứa "bc" bên trong (vd mã 'ABC123').
    IF NEW.thread_id = ANY(c_nhom_bao_cao)
       AND NEW.content IS NOT NULL
       AND (
              NEW.content ILIKE '%báo cáo%'
           OR NEW.content ILIKE '%báocáo%'
           OR NEW.content ~* '\ybc\y'
           ) THEN

        -- 2. TÌM MÃ NHÂN VIÊN (DỰA VÀO ZALO UID)
        SELECT id, name INTO v_staff_id, v_staff_name
        FROM public.nhan_vien
        WHERE uid_from = NEW.uid_from
        LIMIT 1;

        IF v_staff_id IS NOT NULL THEN
            -- 3. TÌM CÔNG VIỆC "Báo cáo công việc cuối ngày" CỦA NHÂN VIÊN TRONG HÔM NAY.
            --    Tìm theo CẢ NHÓM: nhân viên là thành viên bất kỳ, không riêng người đại diện.
            --    Nhánh `OR assignee_id = ...` là lưới an toàn phòng dòng chưa migrate assignee_ids.
            SELECT id INTO v_task_id
            FROM public.cong_viec_duoc_giao
            WHERE (assignee_ids @> ARRAY[v_staff_id] OR assignee_id = v_staff_id)
              AND title ILIKE '%Báo cáo công việc cuối ngày%'
              AND status = 'IN_PROGRESS'
              AND DATE(COALESCE(due_date, created_date) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh') = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
            ORDER BY created_date DESC
            LIMIT 1;

            -- 4. NẾU TÌM THẤY CÔNG VIỆC -> CẬP NHẬT HOÀN THÀNH
            IF v_task_id IS NOT NULL THEN
                -- 4.1 Cập nhật bảng công việc 
                UPDATE public.cong_viec_duoc_giao
                SET status = 'COMPLETED',
                    completed_date = NOW(),
                    updated_by = v_staff_id
                WHERE id = v_task_id;

                -- 4.2 Sinh ID mới cho bảng tiến độ (TD-xxx)
                SELECT COALESCE(MAX(CAST(NULLIF(REGEXP_REPLACE(id, '\D', '', 'g'), '') AS INTEGER)), 0) + 1 
                INTO v_max_id
                FROM public.tien_do 
                WHERE id LIKE 'TD-%';
                
                v_new_td_id := 'TD-' || LPAD(v_max_id::TEXT, 3, '0');

                -- 4.3 Lưu log vào bảng tiến độ để báo cáo
                INSERT INTO public.tien_do (
                    id, task_id, time, content, updated_by_id
                ) VALUES (
                    v_new_td_id,
                    v_task_id,
                    NOW(),
                    -- Việc nhóm thì "nhân viên" là chưa đủ — phải ghi rõ AI đã gửi.
                    -- updated_by_id cũng là người thật sự gửi, không phải người đại diện.
                    'Hệ thống tự động ghi nhận HOÀN THÀNH do ' || COALESCE(v_staff_name, v_staff_id) || ' đã gửi báo cáo lên nhóm Zalo.',
                    v_staff_id
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. GẮN TRIGGER VÀO BẢNG ZALO_MESSAGES (CHẠY SAU KHI CÓ TIN NHẮN VÀO)
DROP TRIGGER IF EXISTS trigger_zalo_auto_complete_task ON public.zalo_messages;

CREATE TRIGGER trigger_zalo_auto_complete_task
AFTER INSERT ON public.zalo_messages
FOR EACH ROW
EXECUTE FUNCTION public.process_zalo_auto_complete_task();


-- ==============================================================================
-- TEST BLOCK — chạy tay trong SQL Editor. Tự dọn sạch kể cả khi test fail.
-- Kỳ vọng in ra: "OK: menh de moi tim duoc viec nhom cho thanh vien thu 2".
--
-- KHÔNG ghi gì vào zalo_messages / zalo_conversations — hai bảng đó đang nuôi KPI CSKH thật,
-- và mọi cột của zalo_messages đều do parser (process_zalo_message_kpi) suy ra từ raw_data,
-- nên chèn tin nhắn giả vừa bẩn dữ liệu vừa phải bịa đúng hình dạng JSON của n8n.
--
-- Thay vào đó test đúng THỨ ĐÃ ĐỔI: mệnh đề WHERE tìm việc. Chứng minh 2 chiều —
-- mệnh đề mới TÌM THẤY việc nhóm, mệnh đề cũ KHÔNG (nếu cũ cũng thấy thì test vô nghĩa).
-- Kiểm tra đầu-cuối thật sự: để một NV gửi "bc" / "báo cáo" vào nhóm 6491009630666576664.
--
-- 31/07/2026 đã kiểm đầu-cuối bằng giao dịch TỰ HUỶ (chèn tin thử → kiểm tra → RAISE để
-- rollback, không để lại dòng nào trong zalo_messages). Ba ca đều đạt:
--   CA1 đúng nhóm nhưng nội dung "3"            → KHÔNG đóng việc  ✔
--   CA2 có chữ "báo cáo" nhưng gửi nhóm khác     → KHÔNG đóng việc  ✔
--   CA3 đúng nhóm + "E gửi bc ngày 31.07 ạ"      → ĐÓNG việc + ghi log tiến độ  ✔
-- ==============================================================================
DO $$
DECLARE
    v_me        TEXT;
    v_other     TEXT;
    v_found_new TEXT;
    v_found_old TEXT;
BEGIN
    -- v_me: NV đã map Zalo (uid_from) — chính là người trigger sẽ nhận diện khi gửi báo cáo
    SELECT id INTO v_me
      FROM public.nhan_vien WHERE uid_from IS NOT NULL AND uid_from <> '' ORDER BY id LIMIT 1;
    IF v_me IS NULL THEN RAISE EXCEPTION 'Khong co nhan vien nao co uid_from de test'; END IF;

    SELECT id INTO v_other FROM public.nhan_vien WHERE id <> v_me ORDER BY id LIMIT 1;
    IF v_other IS NULL THEN RAISE EXCEPTION 'Can it nhat 2 nhan vien de test'; END IF;

    -- Việc nhóm: người đại diện là v_other, còn v_me (người gửi báo cáo) đứng THỨ HAI
    INSERT INTO public.cong_viec_duoc_giao (id, title, status, assignee_ids, due_date, created_date)
    VALUES ('CV-ZTEST', 'Báo cáo công việc cuối ngày', 'IN_PROGRESS', ARRAY[v_other, v_me], NOW(), NOW());

    -- Mệnh đề MỚI (bản trong trigger ở trên) → PHẢI tìm thấy
    SELECT id INTO v_found_new
      FROM public.cong_viec_duoc_giao
     WHERE (assignee_ids @> ARRAY[v_me] OR assignee_id = v_me)
       AND title ILIKE '%Báo cáo công việc cuối ngày%'
       AND status = 'IN_PROGRESS'
       AND DATE(COALESCE(due_date, created_date) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh') = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
     ORDER BY created_date DESC
     LIMIT 1;
    IF v_found_new IS DISTINCT FROM 'CV-ZTEST' THEN
        RAISE EXCEPTION 'FAIL: menh de moi khong tim thay viec nhom (tim duoc: %)', COALESCE(v_found_new, 'NULL');
    END IF;

    -- Mệnh đề CŨ (chỉ assignee_id) → PHẢI KHÔNG tìm thấy, vì v_me không phải người đại diện
    SELECT id INTO v_found_old
      FROM public.cong_viec_duoc_giao
     WHERE assignee_id = v_me
       AND id = 'CV-ZTEST'
     LIMIT 1;
    IF v_found_old IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL: test vo nghia — menh de cu cung tim thay, v_me dang la nguoi dai dien';
    END IF;

    RAISE NOTICE 'OK: menh de moi tim duoc viec nhom cho thanh vien thu 2 (%), menh de cu thi khong', v_me;

    DELETE FROM public.cong_viec_duoc_giao WHERE id = 'CV-ZTEST';
EXCEPTION WHEN OTHERS THEN
    DELETE FROM public.cong_viec_duoc_giao WHERE id = 'CV-ZTEST';
    RAISE;
END $$;
