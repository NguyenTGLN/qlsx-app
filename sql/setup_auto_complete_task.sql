-- ==============================================================================
-- TRIGGER TỰ ĐỘNG HOÀN THÀNH CÔNG VIỆC TỪ ZALO
-- Mục đích: Đóng task "Báo cáo công việc cuối ngày" khi nhân viên nhắn vào nhóm
-- Nhóm đích: 6274675927160413910
-- Điều kiện: Tin nhắn phải chứa cụm từ "em gửi báo cáo" hoặc "em báo cáo"
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.process_zalo_auto_complete_task()
RETURNS TRIGGER AS $$
DECLARE
    v_staff_id TEXT;
    v_task_id TEXT;
    v_max_id INT;
    v_new_td_id TEXT;
BEGIN
    -- 1. CHỈ CHẠY NẾU TIN NHẮN GỬI VÀO ĐÚNG NHÓM VÀ CÓ CHỨA CÁC CỤM TỪ KHOÁ (Không phân biệt hoa/thường)
    IF NEW.thread_id = '6274675927160413910' 
       AND (NEW.content ILIKE '%em gửi báo cáo%' OR NEW.content ILIKE '%em báo cáo%') THEN
        
        -- 2. TÌM MÃ NHÂN VIÊN (DỰA VÀO ZALO UID)
        SELECT id INTO v_staff_id
        FROM public.nhan_vien
        WHERE uid_from = NEW.uid_from
        LIMIT 1;

        IF v_staff_id IS NOT NULL THEN
            -- 3. TÌM CÔNG VIỆC "Báo cáo công việc cuối ngày" CỦA NHÂN VIÊN TRONG HÔM NAY
            SELECT id INTO v_task_id
            FROM public.cong_viec_duoc_giao
            WHERE assignee_id = v_staff_id
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
                    'Hệ thống tự động ghi nhận HOÀN THÀNH do nhân viên đã gửi báo cáo lên nhóm Zalo.',
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
