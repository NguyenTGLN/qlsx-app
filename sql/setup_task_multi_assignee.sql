-- ==============================================================================
-- GIAO MỘT VIỆC CHO NHIỀU NHÂN VIÊN (VIỆC NHÓM)
-- Nguồn sự thật: cong_viec_duoc_giao.assignee_ids (text[])
-- Bất biến: assignee_id = assignee_ids[1] (người đại diện), do trigger dưới canh giữ.
-- Giữ assignee_id để TvDashboard + các query cũ chạy nguyên, không phải sửa.
-- Luật nghiệp vụ: ai xong trước là xong cả nhóm → 1 việc = 1 dòng = 1 trạng thái.
-- ==============================================================================

-- 1. CỘT MỚI
ALTER TABLE public.cong_viec_duoc_giao
  ADD COLUMN IF NOT EXISTS assignee_ids text[] DEFAULT '{}';

-- 2. MIGRATE DỮ LIỆU CŨ (idempotent — chạy lại nhiều lần không hỏng)
--    Sau bước này bất biến assignee_id = assignee_ids[1] tự đúng cho mọi dòng:
--    có assignee_id → mảng 1 phần tử; không có → cả hai cùng rỗng.
UPDATE public.cong_viec_duoc_giao
   SET assignee_ids = ARRAY[assignee_id]
 WHERE assignee_id IS NOT NULL
   AND COALESCE(array_length(assignee_ids, 1), 0) = 0;

-- 3. INDEX cho truy vấn "việc có chứa NV này" (trigger Zalo dùng @>)
CREATE INDEX IF NOT EXISTS idx_cv_assignee_ids
  ON public.cong_viec_duoc_giao USING GIN (assignee_ids);

-- 4. TRIGGER ĐỒNG BỘ HAI CHIỀU
CREATE OR REPLACE FUNCTION public.sync_task_assignees()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Ghi kiểu mới (có mảng) → mảng quyết định người đại diện
        IF COALESCE(array_length(NEW.assignee_ids, 1), 0) > 0 THEN
            NEW.assignee_id := NEW.assignee_ids[1];
        -- Ghi kiểu cũ (chỉ có assignee_id) → dựng mảng một phần tử
        ELSIF NEW.assignee_id IS NOT NULL THEN
            NEW.assignee_ids := ARRAY[NEW.assignee_id];
        ELSE
            NEW.assignee_ids := '{}';
        END IF;

    ELSE  -- UPDATE
        IF NEW.assignee_ids IS DISTINCT FROM OLD.assignee_ids THEN
            -- Mảng đổi → mảng thắng (kể cả khi assignee_id cũng đổi cùng lúc)
            IF COALESCE(array_length(NEW.assignee_ids, 1), 0) > 0 THEN
                NEW.assignee_id := NEW.assignee_ids[1];
            ELSE
                NEW.assignee_id := NULL;
            END IF;
        ELSIF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
            -- Chỉ assignee_id đổi → đường đổi mã NV (TaskApp.jsx:1331).
            -- Thay đúng id cũ trong mảng, giữ nguyên các thành viên khác và thứ tự.
            IF NEW.assignee_id IS NULL THEN
                NEW.assignee_ids := '{}';
            ELSIF OLD.assignee_id IS NULL THEN
                NEW.assignee_ids := ARRAY[NEW.assignee_id];
            ELSE
                NEW.assignee_ids := array_replace(COALESCE(OLD.assignee_ids, '{}'), OLD.assignee_id, NEW.assignee_id);
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_task_assignees ON public.cong_viec_duoc_giao;

CREATE TRIGGER trigger_sync_task_assignees
BEFORE INSERT OR UPDATE ON public.cong_viec_duoc_giao
FOR EACH ROW
EXECUTE FUNCTION public.sync_task_assignees();


-- ==============================================================================
-- TEST BLOCK — chạy tay trong SQL Editor. Tự dọn sạch kể cả khi test fail.
-- Kỳ vọng in ra: "OK: tat ca 6 test deu dat".
-- Dùng 3 nhân viên CÓ THẬT vì assignee_id có khoá ngoại tới nhan_vien.
-- ==============================================================================
DO $$
DECLARE
    v_ids      text[];
    v_one      text;
    v_nv       text[];
    v_nullable text;
BEGIN
    SELECT array_agg(id) INTO v_nv FROM (SELECT id FROM public.nhan_vien ORDER BY id LIMIT 3) s;
    IF COALESCE(array_length(v_nv, 1), 0) < 3 THEN
        RAISE EXCEPTION 'Can it nhat 3 nhan vien de test, dang co %', COALESCE(array_length(v_nv,1),0);
    END IF;

    -- T1: INSERT kiểu cũ (chỉ assignee_id) → mảng tự dựng
    INSERT INTO public.cong_viec_duoc_giao (id, title, status, assignee_id, created_date)
    VALUES ('CV-TEST1', 'test viec nhom', 'IN_PROGRESS', v_nv[1], NOW());
    SELECT assignee_ids INTO v_ids FROM public.cong_viec_duoc_giao WHERE id = 'CV-TEST1';
    IF v_ids <> ARRAY[v_nv[1]] THEN RAISE EXCEPTION 'T1 fail: %', v_ids; END IF;

    -- T2: INSERT kiểu mới (mảng) → assignee_id = phần tử đầu
    INSERT INTO public.cong_viec_duoc_giao (id, title, status, assignee_ids, created_date)
    VALUES ('CV-TEST2', 'test viec nhom', 'IN_PROGRESS', ARRAY[v_nv[1]], NOW());
    SELECT assignee_id INTO v_one FROM public.cong_viec_duoc_giao WHERE id = 'CV-TEST2';
    IF v_one <> v_nv[1] THEN RAISE EXCEPTION 'T2 fail: %', v_one; END IF;

    -- T3: UPDATE mảng (thành nhóm 2 người) → assignee_id chạy theo phần tử đầu
    UPDATE public.cong_viec_duoc_giao SET assignee_ids = ARRAY[v_nv[1], v_nv[2]] WHERE id = 'CV-TEST2';
    SELECT assignee_id INTO v_one FROM public.cong_viec_duoc_giao WHERE id = 'CV-TEST2';
    IF v_one <> v_nv[1] THEN RAISE EXCEPTION 'T3 fail: %', v_one; END IF;

    -- T4: UPDATE chỉ assignee_id (đường đổi mã NV) → array_replace giữ thành viên còn lại
    UPDATE public.cong_viec_duoc_giao SET assignee_id = v_nv[3] WHERE id = 'CV-TEST2';
    SELECT assignee_ids INTO v_ids FROM public.cong_viec_duoc_giao WHERE id = 'CV-TEST2';
    IF v_ids <> ARRAY[v_nv[3], v_nv[2]] THEN RAISE EXCEPTION 'T4 fail: % (ky vong [%, %])', v_ids, v_nv[3], v_nv[2]; END IF;

    -- T5: UPDATE mảng về rỗng → assignee_id = NULL.
    -- Nếu cột assignee_id là NOT NULL thì trạng thái "nhóm rỗng" không tồn tại được ở DB
    -- (giao diện cũng bắt buộc chọn ≥1 người) → nhánh NULL của trigger chỉ là phòng thủ, bỏ qua test.
    SELECT is_nullable INTO v_nullable
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'cong_viec_duoc_giao' AND column_name = 'assignee_id';
    IF v_nullable = 'YES' THEN
        UPDATE public.cong_viec_duoc_giao SET assignee_ids = '{}' WHERE id = 'CV-TEST2';
        SELECT assignee_id INTO v_one FROM public.cong_viec_duoc_giao WHERE id = 'CV-TEST2';
        IF v_one IS NOT NULL THEN RAISE EXCEPTION 'T5 fail: %', v_one; END IF;
    ELSE
        RAISE NOTICE 'T5 bo qua: assignee_id la NOT NULL nen nhom rong khong xay ra duoc';
    END IF;

    -- T6: UPDATE cột khác không đụng tới nhóm
    UPDATE public.cong_viec_duoc_giao SET title = 'test viec nhom 2' WHERE id = 'CV-TEST1';
    SELECT assignee_ids INTO v_ids FROM public.cong_viec_duoc_giao WHERE id = 'CV-TEST1';
    IF v_ids <> ARRAY[v_nv[1]] THEN RAISE EXCEPTION 'T6 fail: %', v_ids; END IF;

    DELETE FROM public.cong_viec_duoc_giao WHERE id IN ('CV-TEST1', 'CV-TEST2');
    RAISE NOTICE 'OK: tat ca 6 test deu dat';
EXCEPTION WHEN OTHERS THEN
    -- Dọn sạch rồi mới ném lỗi ra: test fail giữa chừng không được để lại việc rác trên app
    DELETE FROM public.cong_viec_duoc_giao WHERE id IN ('CV-TEST1', 'CV-TEST2');
    RAISE;
END $$;

-- ==============================================================================
-- KIỂM CHỨNG SAU MIGRATE — cả 2 cột phải trả về 0
-- ==============================================================================
SELECT count(*) FILTER (WHERE assignee_id IS NOT NULL AND COALESCE(array_length(assignee_ids,1),0) = 0) AS chua_migrate,
       count(*) FILTER (WHERE COALESCE(array_length(assignee_ids,1),0) > 0 AND assignee_id IS DISTINCT FROM assignee_ids[1]) AS lech
  FROM public.cong_viec_duoc_giao;
