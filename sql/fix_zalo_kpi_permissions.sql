-- Cấp quyền cho giao diện (app) được phép UPDATE và DELETE dữ liệu trong bảng zalo_conversations
CREATE POLICY "Allow public update on zalo_conversations" 
  ON public.zalo_conversations 
  FOR UPDATE USING (true);

CREATE POLICY "Allow public delete on zalo_conversations" 
  ON public.zalo_conversations 
  FOR DELETE USING (true);
