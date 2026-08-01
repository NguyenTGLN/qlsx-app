// Chờ một tác vụ NỀN ở hệ khác ghi xong dữ liệu, bằng cách hỏi lại nguồn theo nhịp
// tới khi "dấu vân tay" đổi so với lúc trước khi kích hoạt.
//
// Vì sao cần: webhook n8n để chế độ mặc định "Respond: Immediately" — nó trả
// {"message":"Workflow was started"} ngay (~0,5s) rồi mới đi làm việc. Đo 31/07/2026 trên
// webhook đồng bộ Caresoft: HTTP 200 về sau 455ms, còn dữ liệu chỉ thật sự vào DB sau ~21s.
// Nên `await fetch(webhook)` KHÔNG có nghĩa là đã có dữ liệu — phải hỏi lại nguồn.
//
// Tham số read/now/sleep tách rời để test tua đồng hồ ảo, không phải chờ thật.
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function pollUntilChanged({
  read,
  baseline,
  intervalMs = 3000,
  timeoutMs = 60000,
  sleep = defaultSleep,
  now = () => Date.now(),
}) {
  const start = now();
  let polls = 0;
  let value;

  // Luôn chờ hết một nhịp rồi mới hỏi: hỏi ngay lúc vừa gọi thì chắc chắn còn là giá trị cũ.
  for (;;) {
    await sleep(intervalMs);
    polls += 1;

    try {
      value = await read();
    } catch {
      // Mạng chập chờn / nguồn lỗi một nhịp: coi như CHƯA đổi rồi hỏi lại nhịp sau,
      // đừng để một lần lỗi làm hỏng cả lần đồng bộ.
      value = undefined;
    }

    // null/undefined = chưa đọc được, không đủ căn cứ kết luận là đã đổi.
    if (value != null && value !== baseline) return { changed: true, value, polls };
    if (now() - start >= timeoutMs) return { changed: false, value, polls };
  }
}
