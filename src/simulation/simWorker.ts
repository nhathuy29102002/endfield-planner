/**
 * **Worker tính sẵn** của chế độ Simulation (người dùng 2026-10-03: thanh thời gian tính sẵn 24 giờ để tua tới đâu
 * cũng được). Chạy `runJob` ngoài luồng giao diện; mỗi việc mới = một worker mới (huỷ = `terminate()`).
 */
import { loadDataset } from '../model/dataset';
import { runJob, type JobRequest } from './timeline';

const ds = loadDataset();

self.onmessage = (e: MessageEvent<JobRequest>) => {
  runJob(e.data, ds, (c) => (self as unknown as Worker).postMessage(c));
};
