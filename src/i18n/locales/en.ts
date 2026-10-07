import type { Locale } from '../index';

/**
 * English. Khoá = câu tiếng Việt trong mã (xem `src/i18n/index.ts`), giá trị = bản dịch; giữ nguyên `{0}`, `{1}`…
 * và khoảng trắng ở đầu / cuối câu (nhiều câu được ghép nối với nhau). Tên máy / vật tư lấy từ dữ liệu game
 * (`nameEn`), không nằm ở đây. Thuật ngữ theo bản tiếng Anh của game: Depot Bus, Conduit, Inergen, Acridgen…
 */
export const en: Locale = {
  code: 'en',
  label: 'English',
  htmlLang: 'en',
  gameNames: 'en',
  strings: {
    'protobuf hỏng':
      'corrupted protobuf',
    'Không phải chuỗi bản vẽ (base64)':
      'Not a blueprint string (base64)',
    'không đặt được':
      'cannot be placed',
    'Không tìm thấy bản vẽ':
      'Blueprint not found',
    'Lỗi {0}':
      'Error {0}',
    'Trình duyệt hết chỗ lưu — hãy Xuất bớt bản vẽ ra file rồi xoá khỏi thư viện':
      'Browser storage is full — export some blueprints to files, then delete them from the library',
    'Không phải file bản vẽ của ứng dụng này':
      'Not a blueprint file of this app',
    'Mã phải bắt đầu bằng {0}':
      'The code must start with {0}',
    'Máy không còn cổng {0} ra nào trống':
      'The machine has no free {0} output left',
    'ống':
      'pipe',
    'băng':
      'belt',
    'Không bắt đầu được ở đây':
      'Can\'t start here',
    'Băng chuyền không đặt được ở viền ngoài map':
      'Belts can\'t be placed on the outer edge of the map',
    'Vướng vật cản, hoặc máy đích không còn cổng vào trống':
      'Blocked by an obstacle, or the target machine has no free input left',
    'Không có đường nào ≤ {0} góc mà không vướng vật cản':
      'No path with ≤ {0} turns that avoids obstacles',
    'Không tìm thấy cổng':
      'Port not found',
    'Phải nối cổng ra → cổng vào':
      'Must connect an output → an input',
    'Không nối được băng chuyền với ống':
      'Can\'t connect a belt to a pipe',
    'Không nối máy với chính nó':
      'Can\'t connect a machine to itself',
    'Cổng ra đó đã có băng':
      'That output already has a belt',
    'Cổng vào đó đã có băng':
      'That input already has a belt',
    'Không còn lối cho ống — công trình chiếm cả tầng trên, thử chừa hành lang':
      'No room left for the pipe — buildings fill the upper layer, try leaving a corridor',
    'Không còn lối cho băng chuyền':
      'No room left for the belt',
    'demo: nối #{0}.out{1} → #{2}.in{3} — {4}':
      'demo: link #{0}.out{1} → #{2}.in{3} — {4}',
    'Bản vẽ mẫu — tổng tuyến kho hàng, môi trường xúc tác, ống ngầm, trạm điện':
      'Sample plan — depot bus, catalyst environment, conduits, power stations',
    '{0} chỉ có một trên cả map':
      'Only one {0} is allowed on the whole map',
    'Chồng lên công trình khác':
      'Overlaps another building',
    'Ra ngoài khu vực':
      'Outside the area',
    'băng chuyền':
      'belt',
    'Di chuyển máy':
      'Move machine',
    'Đã di chuyển máy':
      'Machine moved',
    'Không đặt được: {0}':
      'Can\'t place: {0}',
    'Sao chép máy':
      'Copy machine',
    'Đã đặt bản sao — đặt tiếp, hoặc Esc để tắt':
      'Copy placed — keep placing, or Esc to stop',
    'Đặt máy':
      'Place machine',
    'Đã dán — đặt tiếp, hoặc Esc để tắt':
      'Pasted — keep placing, or Esc to stop',
    'Đã đặt máy':
      'Machine placed',
    'Bấm vào một máy đang tô xanh để ghép — Esc để thôi':
      'Click a machine highlighted in green to pair — Esc to cancel',
    'Ghép cặp ống ngầm':
      'Pair conduits',
    'Đã ghép với #{0}':
      'Paired with #{0}',
    'Không ghép được':
      'Can\'t pair',
    'Ô này đã có công trình ở tầng của {0}':
      'This cell already has a building on the {0} layer',
    'Rê tới đích — cổng ra sẽ tự chọn theo đường ngắn nhất. Bấm để đặt, Esc để huỷ':
      'Drag to the target — the output is picked by the shortest path. Click to place, Esc to cancel',
    'Rê tới đích rồi bấm để đặt, Esc để huỷ':
      'Drag to the target, then click to place, Esc to cancel',
    'Đặt ống':
      'Place pipe',
    'Đặt băng chuyền':
      'Place belt',
    'Đã qua cầu — kéo tiếp phía bên kia, Esc để dừng':
      'Crossed the bridge — keep dragging on the other side, Esc to stop',
    'Đã nối {0} vào máy':
      'Connected {0} to the machine',
    'Đã đặt {0} ô — kéo tiếp để nối, Esc để dừng':
      'Placed {0} cells — keep dragging to connect, Esc to stop',
    'Công trình đặt sẵn của căn cứ — không xoá được':
      'Pre-placed base building — can\'t be deleted',
    'Xoá máy':
      'Delete machine',
    'Xoá ô {0}':
      'Delete {0} cell',
    'Không có gì để xoá ở đây':
      'Nothing to delete here',
    'Không đặt được':
      'Can\'t place',
    '{0}đã trả về chỗ cũ':
      '{0}returned to the original spot',
    'Đã huỷ chọn vùng':
      'Area selection cancelled',
    'Đã thôi đặt bản vẽ':
      'Stopped placing the blueprint',
    'Đã thôi ghép cặp':
      'Stopped pairing',
    'Đã huỷ di chuyển — về chỗ cũ':
      'Move cancelled — back to the original spot',
    'Đã tắt sao chép':
      'Copy mode off',
    'Đã tắt chế độ đặt {0}':
      'Stopped placing {0}',
    'Đã huỷ di chuyển — máy về chỗ cũ':
      'Move cancelled — machine back to the original spot',
    'Đã huỷ đặt máy':
      'Placement cancelled',
    'Quay máy':
      'Rotate machine',
    'Không quay được: {0}':
      'Can\'t rotate: {0}',
    'Chưa ghim máy thứ {0} — bấm ghim ở bảng chọn máy bên trái':
      'Pinned machine #{0} not set — pin one in the machine list on the left',
    'Tab chỉ đổi chế độ khi đang cầm một máy — nhóm nhiều máy thì đổi từng máy sau khi đặt':
      'Tab only switches mode while holding a single machine — for a group, switch each machine after placing',
    'Không máy nào trong nhóm có chế độ để đổi':
      'No machine in the group has a mode to switch',
    'Máy này không có chế độ để đổi':
      'This machine has no mode to switch',
    'Chế độ khi đặt — {0}':
      'Mode on placement — {0}',
    'Đổi chế độ {0} máy khi đặt':
      'Switch mode of {0} machine(s) on placement',
    'Chế độ khi đặt: {0}':
      'Mode on placement: {0}',
    'Đổi chế độ':
      'Switch mode',
    'Chế độ: {0}':
      'Mode: {0}',
    'Không đổi được':
      'Can\'t switch',
    'Xoay camera {0}° — Ctrl+R xoay tiếp, Ctrl+Shift+R xoay ngược':
      'Camera rotated {0}° — Ctrl+R rotate again, Ctrl+Shift+R rotate back',
    'Sơn địa hình':
      'Paint terrain',
    'Van/cầu phải đặt đúng chiều dòng chảy của tuyến (cầu chỉ đặt lên ô thẳng)':
      'Valves/bridges must follow the flow direction of the line (bridges only on straight cells)',
    'Không biết máy "{0}"':
      'Unknown machine "{0}"',
    'Valley IV không đặt được tổng tuyến kho hàng — kho tổng là dải đặt sẵn ở rìa căn cứ':
      'Valley IV can\'t place a depot bus — the depot is the pre-placed strip at the base edge',
    'Không tìm thấy máy':
      'Machine not found',
    'Không biết máy':
      'Unknown machine',
    'Công trình đặt sẵn của căn cứ — không di chuyển được':
      'Pre-placed base building — can\'t be moved',
    'Công trình đặt sẵn của căn cứ — không quay được':
      'Pre-placed base building — can\'t be rotated',
    'Không có cổng ra này':
      'No such output',
    'Lò không dùng cũng không làm ra món này ở chế độ đang bật':
      'The furnace neither uses nor makes this item in the current mode',
    'Không có cổng này':
      'No such port',
    'Máy này tự đặt cổng ra theo công thức (mọi cổng ra là sản phẩm cuối), không chọn được':
      'This machine sets its outputs from the recipe (every output is a final product), can\'t be chosen',
    'Cổng không dùng trong công thức này':
      'Port not used in this recipe',
    'Item không thuộc công thức này':
      'Item is not part of this recipe',
    'Cổng băng chỉ chở vật rắn':
      'Belt ports only carry solids',
    'Cổng ống chỉ chở khí / lỏng':
      'Pipe ports only carry gas / liquid',
    'Máy này không chọn vật phẩm ra được':
      'This machine can\'t choose an output item',
    'Không phải cảng kiểm soát':
      'Not a control port',
    'Cảng băng chỉ lọc vật rắn':
      'Belt control ports only filter solids',
    'Cảng ống chỉ lọc khí / lỏng':
      'Pipe control ports only filter gas / liquid',
    'Chỉ cảng kiểm soát ống mới chỉnh tốc độ':
      'Only the pipe control port can set the rate',
    'Tốc độ phải là bội số của 6, tối đa 60':
      'Rate must be a multiple of 6, at most 60',
    'Không tìm thấy máy gốc':
      'Source machine not found',
    'Máy không có chế độ này':
      'The machine has no such mode',
    'Máy này không ghép cặp được':
      'This machine can\'t be paired',
    'Không ghép máy với chính nó':
      'Can\'t pair a machine with itself',
    'Đầu kia không phải ống ngầm':
      'The other end is not a conduit',
    'Phải ghép một đầu vào với một đầu ra':
      'Must pair one inlet with one outlet',
    'Đã hoàn tác':
      'Undone',
    'Đã làm lại':
      'Redone',
    '"{0}" có thay đổi chưa lưu vào thư viện (Ctrl+S). Đóng tab sẽ mất các thay đổi đó.':
      '"{0}" has changes not saved to the library (Ctrl+S). Closing the tab will lose them.',
    'Đóng không lưu':
      'Close without saving',
    'Đang xem mặt đất (băng chuyền)':
      'Viewing ground level (belts)',
    'Đang xem trên cao (ống)':
      'Viewing upper level (pipes)',
    'Di chuyển: chuột trái đặt · giữ chuột phải + rê để xoay · Tab đổi chế độ · Esc trả về chỗ cũ':
      'Move: left-click to place · hold right button + drag to rotate · Tab switches mode · Esc puts it back',
    'Sao chép: chuột trái đặt bản sao · giữ chuột phải + rê để xoay · Tab đổi chế độ · Esc để tắt':
      'Copy: left-click to place a copy · hold right button + drag to rotate · Tab switches mode · Esc to stop',
    'Xoá {0}':
      'Delete {0}',
    '{0} máy':
      '{0} machine(s)',
    '{0} ô băng':
      '{0} belt cell(s)',
    '{0} ô ống':
      '{0} pipe cell(s)',
    'không có gì':
      'nothing',
    'Di chuyển {0}: chuột trái đặt · R hoặc giữ chuột phải + rê để xoay · Esc trả về chỗ cũ':
      'Move {0}: left-click to place · R or hold right button + drag to rotate · Esc puts it back',
    'Sao chép {0}: chuột trái đặt bản sao · R hoặc giữ chuột phải + rê để xoay · Esc để tắt':
      'Copy {0}: left-click to place a copy · R or hold right button + drag to rotate · Esc to stop',
    'Di chuyển nhóm':
      'Move group',
    'Sao chép nhóm':
      'Copy group',
    'Đã di chuyển {0}':
      'Moved {0}',
    'Đã đặt bản sao {0} — đặt tiếp, hoặc Esc để tắt':
      'Placed a copy of {0} — keep placing, or Esc to stop',
    'Đặt bản vẽ "{0}": chuột trái đặt · R hoặc giữ chuột phải + rê để xoay · Esc để thôi':
      'Place blueprint "{0}": left-click to place · R or hold right button + drag to rotate · Esc to stop',
    'Không đặt được bản vẽ: {0}':
      'Can\'t place the blueprint: {0}',
    'Đặt bản vẽ':
      'Place blueprint',
    'Đã đặt "{0}" — đặt tiếp, hoặc Esc để thôi':
      'Placed "{0}" — keep placing, or Esc to stop',
    'Chưa chọn gì để chép':
      'Nothing selected to copy',
    'Đã chép {0} vào bộ nhớ tạm — Ctrl+V để dán (dán được sang tab Map khác)':
      'Copied {0} to the clipboard — Ctrl+V to paste (works in another Map tab too)',
    'Bộ nhớ tạm trống — chọn công trình rồi bấm Ctrl+C để chép':
      'Clipboard is empty — select buildings, then press Ctrl+C to copy',
    'Dán {0}: rê lên băng / ống để tự xoay theo tuyến, chuột trái đặt (đặt tiếp được), Esc để tắt':
      'Paste {0}: hover over a belt / pipe to align with the line, left-click to place (repeatable), Esc to stop',
    'Bộ nhớ tạm':
      'Clipboard',
    'Quay nhóm':
      'Rotate group',
    'Hiện tên máy':
      'Show machine names',
    'Ẩn tên máy':
      'Hide machine names',
    'Van / cầu băng chuyền không đặt được ở viền ngoài map':
      'Belt valves / bridges can\'t be placed on the outer edge of the map',
    'Chồng lên máy khác':
      'Overlaps another machine',
    'Chồng lên tuyến vận chuyển':
      'Overlaps a transport line',
    'Phải đặt trên mỏ khoáng':
      'Must be placed on an ore deposit',
    'Toàn bộ đế phải nằm trong vùng trồng':
      'The whole footprint must be inside the planting zone',
    'Bơm phải với tới mặt nước':
      'The pump must reach the water surface',
    'Phải gắn vào đường':
      'Must be attached to a road',
    'Vùng môi trường chồng lên vùng của máy khác':
      'The environment zone overlaps another machine\'s zone',
    'Thiếu #app':
      'Missing #app',
    'Bản mẫu':
      'Sample',
    'Bình thường':
      'Normal',
    'Nước':
      'Water',
    'Khí':
      'Gas',
    'Lỏng':
      'Liquid',
    'Khí & Lỏng':
      'Gas & Liquid',
    'Lỏng & Khí':
      'Fluid & Gas',
    'Khí hóa':
      'Gasify',
    'Lỏng hóa':
      'Fluidify',
    'Rắn hóa':
      'Solidify',
    'Cho phép tắc':
      'Allow clog',
    'Chống tắc':
      'Clog prevention',
    'Chuyển kho tổng':
      'Depot transfer',
    'Lưu trữ':
      'Storage mode',
    'Tinh khiết thấp':
      'Low purity',
    'Tinh khiết cao':
      'High purity',
    'rắn':
      'solid',
    'lỏng':
      'liquid',
    'khí':
      'gas',
    'Chất lỏng':
      'Liquid',
    'Sản phẩm thô':
      'Raw materials',
    'Sản phẩm khu phức hợp':
      'Complex products',
    'Cây trồng':
      'Plants',
    'Bình chứa khí/lỏng':
      'Filled tanks (gas/liquid)',
    'Khai thác — ngoài căn cứ (mỏ, bơm)':
      'Extraction — outside the base (ores, pumps)',
    'Chế biến':
      'Processing',
    'Tạo môi trường':
      'Environment generator',
    'Van chia / gộp':
      'Splitter / converger',
    'Rút từ kho tổng (băng)':
      'Take from the depot (belt)',
    'Nạp vào kho tổng (băng)':
      'Feed into the depot (belt)',
    'Đầu ra ống ngầm':
      'Conduit outlet',
    'Đầu vào ống ngầm':
      'Conduit inlet',
    'Cột / trụ điện':
      'Pylon / relay',
    'Trạm phát điện':
      'Power station',
    'Cầu băng / cầu ống':
      'Belt bridge / pipe bridge',
    'Tổng tuyến kho hàng':
      'Depot bus',
    'Kho / Điểm nhận':
      'Storage / Receiving',
    'Hạ tầng':
      'Infrastructure',
    'không yêu cầu':
      'not required',
    'trơ / ổn định':
      'inert / stable',
    'ẩm':
      'humid',
    'Bản vẽ chưa đặt tên':
      'Untitled blueprint',
    'Chỉ nối được cổng ra với cổng vào cùng vật phẩm':
      'Can only connect an output to an input of the same item',
    'Máy nguồn không có cổng ra này':
      'The source machine has no such output',
    'Lò phản ứng không nhận cổng này':
      'The crucible doesn\'t accept this port',
    'Lò chỉ nhận tối đa {0} đường {1} vào':
      'The crucible accepts at most {0} {1} input line(s)',
    'Máy đích không có cổng vào này':
      'The target machine has no such input',
    'Đã có đường nối này':
      'This connection already exists',
    'TRƠ':
      'INERT',
    'Môi trường {0}':
      'Environment {0}',
    'Bản vẽ — lưu / mở sơ đồ Modeler (Ctrl+S lưu)':
      'Blueprints — save / open Modeler diagrams (Ctrl+S to save)',
    'Bản vẽ':
      'Blueprints',
    'Hoàn tác (Ctrl+Z)':
      'Undo (Ctrl+Z)',
    'Làm lại (Ctrl+Shift+Z)':
      'Redo (Ctrl+Shift+Z)',
    'máy':
      'machine(s)',
    'Di chuyển {0} — đi theo chuột, bấm trái để đặt, Esc trả về chỗ cũ':
      'Move {0} — follows the mouse, left-click to place, Esc puts it back',
    'Sao chép {0} — bản sao đặt lệch bên cạnh; đường nối ra ngoài nhóm tự bị cắt (Ctrl+C / Ctrl+V: bộ nhớ tạm)':
      'Copy {0} — the copy is placed offset beside it; links leaving the group are cut (Ctrl+C / Ctrl+V: clipboard)',
    'Tắt bút vẽ  (Esc)':
      'Turn off pen  (Esc)',
    'Bút vẽ — vẽ tự do, viết chữ lên sơ đồ':
      'Pen — freehand drawing and text on the diagram',
    'Hiện nét vẽ / chữ':
      'Show drawings / text',
    'Ẩn nét vẽ / chữ':
      'Hide drawings / text',
    'Vừa màn hình — đưa cả sơ đồ vào giữa':
      'Fit to screen — center the whole diagram',
    'Màu tuỳ chọn':
      'Custom color',
    'Độ dày nét':
      'Stroke width',
    'Bút — kéo chuột trái để vẽ':
      'Pen — drag with the left button to draw',
    'Hình chữ nhật — kéo để vẽ khung (chỉ viền), nằm dưới các máy':
      'Rectangle — drag to draw a frame (outline only), stays below machines',
    'Chữ — bấm chỗ trống để viết, bấm chữ có sẵn để sửa (Enter: xong, Shift+Enter: xuống dòng)':
      'Text — click an empty spot to write, click existing text to edit (Enter: done, Shift+Enter: new line)',
    'Tẩy — bấm hoặc rê qua nét / chữ để xoá':
      'Eraser — click or drag over strokes / text to delete',
    'Màu':
      'Color',
    'Cỡ chữ':
      'Font size',
    'Độ dày':
      'Width',
    'Đóng / mở bảng tổng hợp  (F3)':
      'Close / open the summary panel  (F3)',
    'Tổng hợp':
      'Summary',
    'Sơ đồ trống':
      'Empty diagram',
    'Bấm một máy ở cột bên trái (hoặc phím 1…0) để thêm vào sơ đồ.':
      'Click a machine in the left column (or keys 1…0) to add it to the diagram.',
    ' · thiếu {0}/phút':
      ' · short {0}/min',
    ' · thừa {0}/phút (máy chỉ dùng {1})':
      ' · excess {0}/min (machines only use {1})',
    ' · dư {0}/phút':
      ' · surplus {0}/min',
    'Bấm: chọn làm đầu ra ({0}){1} · ':
      'Click: set as output ({0}){1} · ',
    'thường → vàng → cam → thường':
      'normal → yellow → orange → normal',
    'thường → đen → thường':
      'normal → black → normal',
    ' — đang là đầu ra {0}':
      ' — currently output {0}',
    'VÀNG':
      'YELLOW',
    'CAM':
      'ORANGE',
    'ĐEN':
      'BLACK',
    'Vào':
      'In',
    'Ra':
      'Out',
    ' — chưa có môi trường: nối từ một máy khuếch tán đang chạy':
      ' — no environment yet: connect from a running Gas Dispersing Unit',
    ' — {0}/phút{1}{2}':
      ' — {0}/min{1}{2}',
    ' / cần {0}':
      ' / needs {0}',
    ' — kéo để nối (thả ra khoảng trống: chọn máy mới) · giữ chuột rồi rê quanh máy: đổi chỗ · chuột phải: đổi mặt':
      ' — drag to connect (drop on empty space: pick a new machine) · hold and drag around the machine: move port · right-click: flip side',
    'Số máy tối đa được dùng (để trống = không giới hạn)':
      'Max number of machines to use (empty = unlimited)',
    'Số máy phải là số không âm':
      'Machine count must be a non-negative number',
    'lấy ra từ kho (vô hạn)':
      'taken from the depot (unlimited)',
    'xử lý (xoá sạch)':
      'disposed (deleted)',
    'nạp vào (sang Cửa Xả Phụ Phẩm)':
      'fed in (to the Byproduct Outlet)',
    'chứa trong bể (khí / chất lỏng không vào kho tổng)':
      'stored in a tank (gas / liquid don\'t go into the depot)',
    'đưa vào kho tổng':
      'sent to the depot',
    'kích hoạt (Khí Trơ / Khí Axit)':
      'activation (Inergen / Acridgen)',
    'cho qua':
      'pass-through',
    '{0} — chưa chọn {1}: kéo một cổng của máy khác thả vào đây để tự chọn, hoặc bấm đúp':
      '{0} — no {1} chosen yet: drag a port of another machine onto it to pick automatically, or double-click',
    'vật phẩm':
      'item',
    'công thức':
      'recipe',
    '{0} — bấm đúp để đổi {1}':
      '{0} — double-click to change {1}',
    'Kéo một cổng khí trơ / axit vào đây':
      'Drag an Inergen / Acridgen port here',
    'Chưa chọn công thức':
      'No recipe chosen',
    '{0} nước thải vào các cửa nạp → 1':
      '{0} sewage into the inlets → 1',
    'Chọn vật phẩm {0} {1}':
      'Choose {0} item {1}',
    'Chọn vật phẩm {0}':
      'Choose item {0}',
    'Chọn vật phẩm':
      'Choose item',
    'Lấy từ kho — vô hạn':
      'From the depot — unlimited',
    'Môi trường {0} — kéo tới máy có công thức cần môi trường này':
      'Environment {0} — drag to a machine whose recipe needs this environment',
    'Cần {0} — kéo tới một máy khuếch tán (khí {1}){2}':
      'Needs {0} — drag to a Gas Dispersing Unit ({1} gas){2}',
    ' · CHƯA CÓ':
      ' · MISSING',
    'Kẹt: {0} là sản phẩm cuối nhưng chưa có đường ra ⇒ lò đầy và dừng (như bên Map). Bấm vào ô của nó để chọn làm đầu ra rồi nối tới một máy nhận.':
      'Jammed: {0} is a final product but has no way out ⇒ the crucible fills up and stops (same as on the Map). Click its slot to set it as an output, then connect it to a receiving machine.',
    'Máy dùng nhiều chất kích hoạt hơn mức cần thiết: thừa {0}/phút ({1} máy chỉ cần {2}/phút — mỗi máy 6). Bấm icon trên đường ống để đặt giới hạn lưu lượng.':
      'Machines get more activator than needed: {0}/min excess ({1} machine(s) need only {2}/min — 6 each). Click the icon on the pipe to set a flow limit.',
    'Thiếu chất kích hoạt: {0} máy cần ít nhất {1}/phút (mỗi máy 6), đang nhận {2}/phút — thiếu {3}/phút.':
      'Missing activator: {0} machine(s) need at least {1}/min (6 each), receiving {2}/min — short {3}/min.',
    'Cảnh báo':
      'Warning',
    'Nối nguyên liệu vào — công thức tự chạy':
      'Connect ingredients — the recipe runs by itself',
    'Lượng làm ra mỗi phút':
      'Output per minute',
    '{0}/phút':
      '{0}/min',
    'Không tính: máy cuối chưa điền số máy (ô dưới) và không máy nào cần hàng của nó':
      'Not counted: the last machine has no machine count (box below) and no machine needs its output',
    'Lò chạy trung bình {0}% ({1} lò){2}':
      'Crucibles run {0}% on average ({1} crucible(s)){2}',
    ' — KẸT':
      ' — JAMMED',
    'Thực chạy {0} máy / mục tiêu {1} máy{2}':
      'Actually running {0} machine(s) / target {1} machine(s){2}',
    ' (tính theo nhu cầu phía sau)':
      ' (based on downstream demand)',
    '{0} — bấm để bỏ nối':
      '{0} — click to disconnect',
    'Điểm neo — kéo để dời · chuột phải hoặc bấm đúp: xoá điểm neo':
      'Anchor point — drag to move · right-click or double-click: delete the anchor',
    ' — {0}/phút{1}':
      ' — {0}/min{1}',
    ' (vượt sức chở một tuyến)':
      ' (exceeds one line\'s capacity)',
    ' · giới hạn {0}/phút':
      ' · limit {0}/min',
    ' — bấm: giới hạn lưu lượng':
      ' — click: flow limit',
    ' · kéo: thêm điểm neo để uốn · chuột phải: bỏ nối':
      ' · drag: add an anchor to bend · right-click: disconnect',
    'Lò chỉ có 2 đầu ra lỏng + 1 rắn — đã gỡ đường {0}':
      'The crucible has only 2 liquid outputs + 1 solid — removed link {0}',
    'Đã bỏ nối {0}':
      'Disconnected {0}',
    'Di chuyển {0} máy: rê chuột rồi bấm trái để đặt · Esc trả về chỗ cũ':
      'Move {0} machine(s): move the mouse, then left-click to place · Esc puts them back',
    'Đã chép {0} máy vào bộ nhớ tạm — Ctrl+V để dán (dán được sang tab Modeler khác)':
      'Copied {0} machine(s) to the clipboard — Ctrl+V to paste (works in another Modeler tab too)',
    'Bộ nhớ tạm trống — chọn máy rồi bấm Ctrl+C để chép':
      'Clipboard is empty — select machines, then press Ctrl+C to copy',
    'Đã dán {0} máy — rê chuột rồi bấm trái để đặt (Esc: để nguyên chỗ dán)':
      'Pasted {0} machine(s) — move the mouse, then left-click to place (Esc: leave them where pasted)',
    'Đã sao chép {0} máy — đường nối ra ngoài nhóm không chép theo':
      'Copied {0} machine(s) — links leaving the group are not copied',
    'Đã xoá {0} máy':
      'Deleted {0} machine(s)',
    'Máy trên sơ đồ':
      'Machines in the diagram',
    'Máy cần xây':
      'Machines to build',
    'Điện tiêu thụ':
      'Power consumption',
    'Nguyên liệu thô (mỗi phút)':
      'Raw materials (per minute)',
    'Chưa lấy gì từ kho.':
      'Nothing taken from the depot yet.',
    'Còn thiếu (mỗi phút)':
      'Still missing (per minute)',
    'Sản phẩm dư ra (mỗi phút)':
      'Surplus products (per minute)',
    'Không có hàng dư.':
      'No surplus.',
    'Vào kho tổng (mỗi phút)':
      'Into the depot (per minute)',
    'Chứa trong bể (mỗi phút)':
      'Stored in tanks (per minute)',
    'Đã xử lý / nạp đi (mỗi phút)':
      'Disposed / fed away (per minute)',
    'Máy (thực cần · phải xây)':
      'Machines (actually needed · to build)',
    'Chưa có máy nào được tính.':
      'No machines counted yet.',
    'Đã nối {0}':
      'Connected {0}',
    'Bấm vào ô {0} trong lò để chọn nó làm đầu ra (vàng / cam / đen) trước, rồi mới nối ra':
      'Click the {0} slot in the crucible to set it as an output (yellow / orange / black) first, then connect it',
    '{0} không có cổng {1} {2}':
      '{0} has no {1} port for {2}',
    'Máy này':
      'This machine',
    'vào':
      'input',
    'ra':
      'output',
    '{0} không nhận dùng {1}':
      '{0} doesn\'t take {1}',
    '{0} không nhận làm ra {1}':
      '{0} doesn\'t make {1}',
    '{0} không có công thức nào dùng {1}':
      '{0} has no recipe that uses {1}',
    '{0} không có công thức nào làm ra {1}':
      '{0} has no recipe that makes {1}',
    '{0} — công thức {1} {2}':
      '{0} — recipes that {1} {2}',
    'dùng':
      'use',
    'làm ra':
      'make',
    'Không máy nào {0} {1}':
      'No machine can {0} {1}',
    'Máy dùng':
      'Machines that use',
    'Máy làm ra':
      'Machines that make',
    'Chứa {0} vào loại nào?':
      'Store {0} in which container?',
    'Đã huỷ nối':
      'Connection cancelled',
    'Rê quanh máy để chọn chỗ cho cổng này, thả chuột để đặt':
      'Move around the machine to choose a spot for this port, release to place',
    'Đã chọn {0} máy — C: sao chép · Delete: xoá · kéo một máy để dời cả nhóm':
      'Selected {0} machine(s) — C: copy · Delete: delete · drag one machine to move the whole group',
    '{0}: đầu ra {1} — kéo từ ô màu để nối ra':
      '{0}: output {1} — drag from the colored slot to connect',
    '{0}: không còn là đầu ra':
      '{0}: no longer an output',
    'Phải nối một cổng ra với một cổng vào':
      'Must connect an output to an input',
    'Không giới hạn':
      'Unlimited',
    'Lưu lượng tối đa — {0}':
      'Max flow — {0}',
    'Chia hết cho 6, tối đa 60; phần còn lại chia cho các nhánh khác của nguồn.':
      'Multiple of 6, at most 60; the rest is split among the source\'s other branches.',
    'Bỏ mọi điểm neo của đường này':
      'Remove all anchors of this link',
    'Làm thẳng đường':
      'Straighten link',
    '{0} không dùng trong Modeler (không có công thức)':
      '{0} isn\'t used in the Modeler (no recipe)',
    '{0}: chỉ được có một trên sơ đồ':
      '{0}: only one allowed in the diagram',
    'Đã thêm {0}':
      'Added {0}',
    'Đã thêm {0} — nối với máy khác để tự chọn {1}, hoặc bấm đúp máy':
      'Added {0} — connect it to another machine to pick {1} automatically, or double-click the machine',
    'Đóng (Esc)':
      'Close (Esc)',
    '{0} ({1} loại {2})':
      '{0} ({1} {2} types)',
    'Chứa trong bình':
      'Fill into canisters',
    'Chứa trong lọ':
      'Fill into bottles',
    'bình':
      'canister',
    'lọ':
      'bottle',
    'Lấy khí ra':
      'Extract gas',
    'Lấy chất lỏng ra':
      'Extract liquid',
    'Lấy {0} từ kho (vô hạn)':
      'Take {0} from the depot (unlimited)',
    'Xử lý {0} (xoá sạch)':
      'Dispose of {0} (delete)',
    'Nạp {0} (sang Cửa Xả Phụ Phẩm)':
      'Feed {0} (to the Byproduct Outlet)',
    'Chứa {0} trong bể':
      'Store {0} in a tank',
    'Đưa {0} vào kho tổng':
      'Send {0} to the depot',
    'Nạp {0} để tạo môi trường':
      'Feed {0} to create the environment',
    'Tạo môi trường bằng {0}':
      'Create the environment with {0}',
    'Lò làm ra vật phẩm này':
      'Crucible that makes this item',
    'Tìm máy / vật phẩm… (không cần dấu)':
      'Search machines / items…',
    'Không có gì khớp':
      'Nothing matches',
    'Tick để ưu tiên chạy trước. Công thức không tick vẫn tự chạy khi đủ nguyên liệu và lò còn chỗ.':
      'Tick to give priority. Unticked recipes still run when ingredients are available and the crucible has room.',
    '{0} — công thức ưu tiên':
      '{0} — priority recipes',
    '✔ Ưu tiên':
      '✔ Priority',
    'Đang chạy':
      'Running',
    '{0} — chọn công thức':
      '{0} — choose a recipe',
    'Tìm vật phẩm… (không cần dấu)':
      'Search items…',
    'vật phẩm lấy ra từ kho (vô hạn)':
      'item taken from the depot (unlimited)',
    'khí kích hoạt':
      'activator gas',
    'vật phẩm nhận vào':
      'input item',
    'Canvas 2D không khả dụng':
      '2D canvas not available',
    'Không biết công thức "{0}"':
      'Unknown recipe "{0}"',
    'Thiếu':
      'Missing',
    'Kẹt cổng ra: {0} chỉ thoát được {1}/{2} mỗi phút — phía sau nhận không hết':
      'Output jammed: {0} can only leave at {1}/{2} per minute — downstream can\'t take it all',
    'Kẹt cổng ra — phía sau nhận không hết':
      'Output jammed — downstream can\'t take it all',
    'Mất điện toàn nhà máy — cần {0}, chỉ có {1}':
      'Factory-wide blackout — needs {0}, only {1}',
    'Đoạn băng không có nguồn — không cổng ra nào đẩy hàng vào nó':
      'Belt segment with no source — no output pushes items into it',
    'Băng cụt — đầu cuối không chạm cổng vào nào (hoặc chạm sai hướng)':
      'Dead-end belt — its end doesn\'t touch any input (or touches it the wrong way)',
    'Tuyến treo, thiếu một đầu':
      'Dangling line, one end missing',
    'Máy nguồn chưa khai báo sản lượng':
      'Source machine has no declared output rate',
    'Chưa chọn vật tư rút từ kho tổng':
      'No item chosen to take from the depot',
    'Cảng kiểm soát chỉ cho {0} qua — chưa có món đó chảy tới':
      'The control port only lets {0} through — none of it reaches it yet',
    'Van chưa có hàng nào chảy tới':
      'No items reach the valve yet',
    'Cổng ra của lõi chưa chọn vật phẩm':
      'The core\'s output has no item chosen',
    'Đầu ra chưa gán item (máy chưa chạy công thức nào?)':
      'Output has no item assigned (is the machine running a recipe?)',
    'Ống chỉ chở được một chất — đang lẫn {0} ⇒ kẹt':
      'A pipe can carry only one substance — {0} are mixed ⇒ jammed',
    'Băng lẫn nhiều món vào trạm điện ({0}) ⇒ kẹt':
      'Belt brings mixed items into the power station ({0}) ⇒ jammed',
    'Trạm điện không đốt được {0}':
      'The power station can\'t burn {0}',
    'chỉ nhận':
      'only accepts',
    'chỉ loại bỏ':
      'only disposes of',
    '{0} {1} {2} — không nhận {3}':
      '{0} {1} {2} — doesn\'t accept {3}',
    'Máy':
      'Machines',
    'Đầu vào chưa gán item (máy chưa chọn công thức?)':
      'Input has no item assigned (has the machine chosen a recipe?)',
    'Băng lẫn nhiều món ({0}) vào máy thường ⇒ kẹt — máy chỉ chạy một công thức, không có chỗ chứa món khác':
      'Belt brings mixed items ({0}) into a regular machine ⇒ jammed — it runs one recipe and has no room for other items',
    'Hai đầu chở khác nhau: {0} → máy chỉ dùng {1}':
      'The two ends carry different things: {0} → the machine only uses {1}',
    'Cảng kiểm soát chỉ cho {0} qua — gặp {1} nên cả tuyến bị nghẽn':
      'The control port only lets {0} through — it met {1}, so the whole line is blocked',
    'Đầu vào chưa gán item':
      'Input has no item assigned',
    'Hai đầu chở khác nhau: {0} → {1}':
      'The two ends carry different things: {0} → {1}',
    'Cổng kích hoạt chỉ nhận khí hoặc chất lỏng':
      'The activator port only accepts gas or liquid',
    'Kẹt: Cửa Xả ống ngầm chỉ đẩy ra được {0}/{1} mỗi phút — nối thêm chỗ nhận ở đầu ra':
      'Jammed: the conduit outlet can only push out {0}/{1} per minute — connect more receivers at the output',
    'Đoạn tổng tuyến này chưa nối về Cổng Tổng Tuyến Kho Hàng — nối các đoạn chạm nhau thành một dải tới cổng':
      'This bus segment isn\'t linked to a Depot Bus Port — join touching segments into one strip that reaches the port',
    'Chưa gắn vào tổng tuyến kho hàng — đặt sát tuyến, ở phía đối diện cổng băng':
      'Not attached to the depot bus — place it against the bus, on the side opposite its belt port',
    'Chưa có nhiên liệu — nối băng chở pin hoặc quặng originium vào':
      'No fuel — connect a belt carrying batteries or originium ore',
    'Thiếu nhiên liệu {0} ({1}/{2} mỗi phút)':
      'Missing fuel {0} ({1}/{2} per minute)',
    'Chưa khai báo sản lượng':
      'No output rate declared',
    'Máy này không có cổng {0} để đẩy {1}':
      'This machine has no {0} port to push {1}',
    'Thiếu khí kích hoạt ({0}/6 mỗi phút)':
      'Missing activator gas ({0}/6 per minute)',
    'Chưa nạp khí — không tạo ra môi trường nào':
      'No gas fed — no environment is created',
    'Chưa ghép cặp với đầu ra ống ngầm':
      'Not paired with a conduit outlet',
    'Nguồn vô hạn chưa chọn vật tư':
      'Infinite source has no item chosen',
    'Chưa ghép cặp với đầu vào ống ngầm':
      'Not paired with a conduit inlet',
    'Chưa có công thức nào — nối nguyên liệu vào (máy tự chạy công thức khớp) hoặc tích một công thức':
      'No recipe yet — connect ingredients (the machine runs the matching recipe) or tick a recipe',
    'Ngoài tầm cấp điện — đặt thêm cột hoặc trụ':
      'Out of power range — place another pylon or relay',
    'Công thức này thuộc chế độ {0}, máy đang ở chế độ {1}':
      'This recipe belongs to mode {0}, the machine is in mode {1}',
    'Cần môi trường {0} — máy chưa nằm trọn trong vùng phủ nào':
      'Needs environment {0} — the machine isn\'t fully inside any zone',
    'Cần môi trường {0}, đang ở môi trường {1}':
      'Needs environment {0}, currently in environment {1}',
    'Cổng kích hoạt chưa được nạp':
      'Activator port not fed',
    'Cổng kích hoạt thiếu ({0}/{1} mỗi phút)':
      'Activator port short ({0}/{1} per minute)',
    'Sản phẩm {0} không có đường ra':
      'Product {0} has no way out',
    'Thiếu hẳn {0}':
      'Missing {0} entirely',
    'Thiếu {0} ({1}/{2} mỗi phút)':
      'Missing {0} ({1}/{2} per minute)',
    'Bị chặn bởi sức chở đường ra':
      'Limited by output line capacity',
    'Huỷ':
      'Cancel',
    '{0} bảng tổng hợp  (F3)':
      '{0} summary panel  (F3)',
    'Đóng':
      'Close',
    'Mở':
      'Open',
    'Di chuyển {0} — chuột trái đặt, giữ chuột phải + rê để xoay, Esc trả về chỗ cũ':
      'Move {0} — left-click to place, hold right button + drag to rotate, Esc puts it back',
    'Sao chép {0} — chuột trái đặt bản sao, giữ chuột phải + rê để xoay, Esc để tắt. Ctrl+C: chép vào bộ nhớ tạm, Ctrl+V để dán':
      'Copy {0} — left-click to place a copy, hold right button + drag to rotate, Esc to stop. Ctrl+C: copy to clipboard, Ctrl+V to paste',
    'Xoay {0} 90°':
      'Rotate {0} 90°',
    'Lưu {0} thành bản vẽ (module)':
      'Save {0} as a blueprint (module)',
    'Di chuyển {0} — chuột trái đặt, R hoặc giữ chuột phải + rê để xoay, Esc trả về chỗ cũ':
      'Move {0} — left-click to place, R or hold right button + drag to rotate, Esc puts it back',
    'Sao chép {0} — chuột trái đặt bản sao, R hoặc giữ chuột phải + rê để xoay, Esc để tắt. Ctrl+C: chép vào bộ nhớ tạm, Ctrl+V để dán':
      'Copy {0} — left-click to place a copy, R or hold right button + drag to rotate, Esc to stop. Ctrl+C: copy to clipboard, Ctrl+V to paste',
    'Đặt băng chuyền — bấm điểm đầu, rê tới đích, bấm để đặt. Esc để tắt':
      'Place belt — click the start, drag to the target, click to place. Esc to stop',
    'Đặt ống — bấm điểm đầu, rê tới đích, bấm để đặt. Esc để tắt':
      'Place pipe — click the start, drag to the target, click to place. Esc to stop',
    'Xoá máy, hoặc một ô băng/ống ở tầng đang xem':
      'Delete a machine, or a belt/pipe cell on the current layer',
    'Xoay camera 90° — Shift+bấm: xoay ngược':
      'Rotate camera 90° — Shift+click: rotate back',
    'Đang xem mặt đất (băng chuyền) — bấm để chuyển lên trên cao (ống)  (CapsLock)':
      'Viewing ground level (belts) — click to switch to the upper level (pipes)  (CapsLock)',
    'Đang xem trên cao (ống) — bấm để chuyển xuống mặt đất (băng chuyền)  (CapsLock)':
      'Viewing upper level (pipes) — click to switch to ground level (belts)  (CapsLock)',
    'Đất':
      'Ground',
    'Đang hiện tên máy — bấm để ẩn':
      'Machine names shown — click to hide',
    'Đang ẩn tên máy — bấm để hiện':
      'Machine names hidden — click to show',
    'Kiểm tra tầm điện: BẬT — máy ngoài tầm cột/trụ không chạy. Bấm để tắt khi đang phác thảo':
      'Power range check: ON — machines outside pylon/relay range don\'t run. Click to turn off while sketching',
    'Kiểm tra tầm điện: TẮT — bấm để bật':
      'Power range check: OFF — click to turn on',
    'Đổi kiểm tra điện':
      'Toggle power check',
    'Bản vẽ — thư viện bản vẽ đã lưu, nhập / xuất':
      'Blueprints — saved blueprint library, import / export',
    '{0}×{1} = {2} ô':
      '{0}×{1} = {2} cells',
    'Kéo nền: chọn nhóm':
      'Drag background: select group',
    'Kéo: di chuyển':
      'Drag: move',
    'Kéo cổng: nối / máy mới':
      'Drag port: connect / new machine',
    'Giữ cổng: đổi chỗ':
      'Hold port: move it',
    'Kéo đường: thêm điểm neo':
      'Drag link: add anchor',
    'Điểm neo: xoá':
      'Anchor: delete',
    'Đường nối: bỏ':
      'Link: remove',
    'Sao chép / xoá':
      'Copy / delete',
    'Bút vẽ: nút ở cột phải':
      'Pen: button in the right column',
    'Bấm: chọn · kéo nền: chọn vùng':
      'Click: select · drag background: select area',
    'Di chuyển bản vẽ':
      'Move the view',
    'Băng chuyền / ống':
      'Belt / pipe',
    'Xoay máy':
      'Rotate machine',
    'Di chuyển / sao chép':
      'Move / copy',
    'Đổi chế độ máy':
      'Switch machine mode',
    'Mặt đất ⇄ trên cao':
      'Ground ⇄ upper level',
    'Tẩy / xoá':
      'Erase / delete',
    'Máy đã ghim':
      'Pinned machines',
    '{0} — bấm để mở cửa sổ máy':
      '{0} — click to open the machine window',
    'Hệ thống đang sụp điện':
      'The power grid is collapsing',
    'Ngoài tầm cấp điện':
      'Out of power range',
    'Cảnh báo: {0}':
      'Warning: {0}',
    'Thu gọn (nhớ cho mọi máy)':
      'Collapse (remembered for all machines)',
    'Đổi chế độ  (Tab)':
      'Switch mode  (Tab)',
    'Chế độ':
      'Mode',
    'Chế độ này chỉ đổi cách máy vận hành, không đổi bộ công thức.':
      'This mode only changes how the machine operates, not its recipe set.',
    'Cửa Nạp Nước Thải chỉ nhận {0} qua ống và luôn nối với Cửa Xả Phụ Phẩm ':
      'The Sewage Inlet only accepts {0} by pipe and is always linked to the Byproduct Outlet ',
    '(chỉ có một trên map). Cứ {0} {1} nạp vào thì cửa xả đẩy ra 1 ':
      '(only one per map). For every {0} {1} fed in, the outlet pushes out 1 ',
    '{0} qua ống.':
      '{0} by pipe.',
    'Đang nạp':
      'Feeding',
    'Cửa xả ra':
      'Outlet output',
    'chưa đặt Cửa Xả Phụ Phẩm':
      'no Byproduct Outlet placed',
    'Đổi tài nguyên nguồn':
      'Change source resource',
    'Tài nguyên':
      'Resource',
    'Đổi sản lượng nguồn':
      'Change source output rate',
    'Bảng dữ liệu game không có sản lượng cho máy khai thác — nó phụ thuộc mỏ, nên khai báo tay ở đây.':
      'The game data has no output rate for mining machines — it depends on the deposit, so set it manually here.',
    'Sản lượng /phút':
      'Output /min',
    'Lõi: nhận mọi thứ đưa tới, và rút hàng từ kho tổng ra các cổng băng — bấm cổng ra trên sơ đồ để chọn vật phẩm.':
      'Core: accepts everything delivered, and takes items from the depot out of its belt ports — click an output on the map to choose the item.',
    'Kho / Hub: nhận mọi thứ đưa tới, không hãm máy phía trước.':
      'Storage / Hub: accepts everything delivered, never slows down upstream machines.',
    'Rút từ kho tổng: nguồn không giới hạn, chỉ bị chặn bởi sức chở của tuyến. Bấm cổng ra trên sơ đồ hoặc ô dưới đây để chọn vật phẩm.':
      'Take from the depot: unlimited source, limited only by line capacity. Click an output on the map or the box below to choose the item.',
    'Nạp vào kho tổng: nhận bao nhiêu cũng được.':
      'Feed into the depot: accepts any amount.',
    'Vật tư':
      'Item',
    'Chọn vật tư kho tổng':
      'Choose depot item',
    'Vật tư rút từ kho tổng':
      'Item taken from the depot',
    'Đang chọn trên map — bấm máy tô xanh, Esc để thôi':
      'Choosing on the map — click a machine highlighted in green, Esc to cancel',
    'Chỉ định đầu kia trên map':
      'Pick the other end on the map',
    'Chưa có đầu ra ống ngầm nào trên map':
      'No conduit outlet on the map yet',
    'Chưa có đầu vào ống ngầm nào trên map':
      'No conduit inlet on the map yet',
    'Bấm vào máy tô xanh trên map để ghép — Esc để thôi':
      'Click a machine highlighted in green on the map to pair — Esc to cancel',
    'Đang chọn trên map…':
      'Choosing on the map…',
    'Chỉ định trên map':
      'Pick on the map',
    'Bỏ ghép':
      'Unpair',
    'Bỏ ghép cặp ống ngầm':
      'Unpair conduits',
    'Khí và chất lỏng **không có kho tổng**. Muốn đưa chúng đi xa thì ghép một đầu vào ':
      'Gas and liquids **have no depot**. To send them far away, pair an inlet ',
    'với một đầu ra ở đây — cặp này đi thẳng, không dùng băng chuyền cũng không dùng ống.':
      'with an outlet here — the pair links directly, without belts or pipes.',
    'Ghép với':
      'Paired with',
    'Nguồn vô hạn':
      'Infinite source',
    'Bật nguồn vô hạn':
      'Turn on infinite source',
    'Tắt nguồn vô hạn':
      'Turn off infinite source',
    'Nguồn vô hạn — chọn khí / lỏng (× để tắt)':
      'Infinite source — choose gas / liquid (× to turn off)',
    'Tổng tuyến kho hàng: đường thông ra kho tổng. Các đoạn chạm nhau thành một dải; dải phải chạm ':
      'Depot bus: the passage to the depot. Touching segments form one strip; the strip must touch ',
    'Cổng Tổng Tuyến Kho Hàng mới thông. Loader và Unloader phải đặt sát tuyến, ở phía đối diện cổng ':
      'a Depot Bus Port to work. Loaders and Unloaders must sit against the bus, on the side opposite their belt ',
    'băng của chúng, thì mới nạp/rút được hàng.':
      'port, to feed/take items.',
    '⛓ Đoạn này chưa nối về Cổng Tổng Tuyến — máy dỡ / nâng hàng gắn vào nó không chạy.':
      '⛓ This segment isn\'t linked to a Depot Bus Port — unloaders / loaders attached to it don\'t run.',
    'Chỉ cho món đã chọn ở ô OUTPUT đi tiếp; gặp món khác thì cả tuyến vào bị nghẽn. Chưa chọn thì cho qua mọi thứ.':
      'Only lets the item chosen in the OUTPUT slot through; any other item blocks the whole input line. Nothing chosen = everything passes.',
    ' Cảng ống: kéo thanh trượt để giới hạn lưu lượng (bội số của 6, tối đa 60); nằm trên cao nên đặt được phía trên băng chuyền.':
      ' Pipe port: drag the slider to limit the flow (multiple of 6, at most 60); it sits on the upper level, so it can be placed above belts.',
    'Van tách: chia đều hàng vào cho các nhánh đang nối; nhánh nào nhận ít hơn thì phần dư sang nhánh khác.':
      'Splitter: splits incoming items evenly across connected branches; if a branch takes less, the rest goes to the others.',
    'Van gộp: cộng dồn hàng các đường vào, tối đa bằng sức chở của đường ra (băng 30, ống 120). Băng gộp được nhiều món khác nhau; ống chỉ một chất.':
      'Converger: adds up its input lines, at most the output line\'s capacity (belt 30, pipe 120). Belts can merge different items; pipes carry one substance only.',
    'Cầu: hai tuyến cắt nhau mà không trộn hàng — hàng đi dọc ra dọc, đi ngang ra ngang. ':
      'Bridge: two lines cross without mixing — items going straight stay straight, crossing stays crossing. ',
    'Đặt băng đi vào cầu thì lần kéo tiếp tự bắt đầu ở phía bên kia.':
      'Drawing a belt into a bridge makes the next drag start on the other side.',
    'Máy tạo môi trường: phủ {0}×{1} ô quanh nó. ':
      'Environment generator: covers {0}×{1} cells around it. ',
    'Loại môi trường do **khí nạp vào cổng kích hoạt** quyết định. ':
      'The environment type is decided by the **gas fed into the activator port**. ',
    'Máy hưởng tác dụng phải nằm trọn trong vùng, thò ra một ô cũng không tính.':
      'Machines must sit fully inside the zone to benefit; sticking out by one cell doesn\'t count.',
    'Thông lượng':
      'Throughput',
    'Hệ số chạy':
      'Run factor',
    'Cổng kích hoạt':
      'Activator port',
    'Nhận tối đa {0}/phút nhưng chỉ cần {1}/phút là chạy hết công suất — giống như điện.':
      'Accepts up to {0}/min but needs only {1}/min to run at full capacity — like power.',
    'chưa nối':
      'not connected',
    'Đang phát ra':
      'Emitting',
    'Môi trường':
      'Environment',
    'chưa có':
      'none',
    ' (cần {0})':
      ' (needs {0})',
    'Tổng tuyến':
      'Bus',
    'đã gắn':
      'attached',
    'chưa gắn — đặt sát tuyến, phía đối diện cổng băng':
      'not attached — place against the bus, opposite the belt port',
    'Đang phát':
      'Generating',
    '{0} điện · đốt {1}':
      '{0} power · burning {1}',
    '0 điện · chưa có nhiên liệu':
      '0 power · no fuel',
    'Đốt pin hoặc quặng originium từ băng chuyền. Mỗi đơn vị cháy một khoảng thời gian cố định; ':
      'Burns batteries or originium ore from a belt. Each unit burns for a fixed time; ',
    'thiếu nhiên liệu thì phát theo tỉ lệ thời gian có lửa.':
      'with too little fuel, output follows the fraction of time it is lit.',
    'Điện':
      'Power',
    'trong tầm phủ · {0}/máy':
      'in range · {0}/machine',
    'ngoài tầm phủ':
      'out of range',
    'Vào /phút':
      'In /min',
    'Ra /phút':
      'Out /min',
    'Empty — để trống':
      'Empty — leave blank',
    '{0} — bấm để đổi':
      '{0} — click to change',
    'Chưa chọn — bấm để chọn vật phẩm':
      'Not chosen — click to choose an item',
    'Đã nhập {0} bản vẽ':
      'Imported {0} blueprint(s)',
    'Không đọc được file: {0}':
      'Can\'t read the file: {0}',
    'Mở một tab Modeler trước để lưu sơ đồ':
      'Open a Modeler tab first to save a diagram',
    'Chưa chọn gì để lưu':
      'Nothing selected to save',
    'Tên bản vẽ (bắt buộc)':
      'Blueprint name (required)',
    'Tìm biểu tượng…':
      'Search icons…',
    'Hãy điền tên bản vẽ':
      'Please enter a blueprint name',
    'Đã lưu bản vẽ "{0}"':
      'Saved blueprint "{0}"',
    'Lưu toàn bộ map thành bản vẽ':
      'Save the whole map as a blueprint',
    'Lưu sơ đồ Modeler':
      'Save Modeler diagram',
    'Lưu nhóm đang chọn thành bản vẽ':
      'Save the selected group as a blueprint',
    'Ảnh xem trước':
      'Preview',
    'Loại: toàn map':
      'Type: whole map',
    'Loại: sơ đồ Modeler':
      'Type: Modeler diagram',
    'Loại: module (nhóm)':
      'Type: module (group)',
    'Biểu tượng':
      'Icon',
    'Lưu':
      'Save',
    'Map hiện tại của bạn chưa lưu, bạn có chắc chắn? Đặt "{0}" sẽ thay toàn bộ map đang mở.':
      'Your current map isn\'t saved — are you sure? Placing "{0}" will replace the whole open map.',
    'Thay map':
      'Replace map',
    'Đã mở bản vẽ "{0}"':
      'Opened blueprint "{0}"',
    'Xoá bản vẽ "{0}" khỏi thư viện? Không hoàn tác được.':
      'Delete blueprint "{0}" from the library? This can\'t be undone.',
    'Xoá':
      'Delete',
    'Tạo căn cứ mới "{0}" ({1}×{2})? Map đang mở sẽ bị thay — hãy lưu ở tab Map trước nếu cần.':
      'Create new base "{0}" ({1}×{2})? The open map will be replaced — save it in the Map tab first if needed.',
    'Tạo map':
      'Create map',
    'Đã tạo căn cứ "{0}"':
      'Created base "{0}"',
    '{0} — dải kho tổng đặt sẵn ngoài vùng xây':
      '{0} — pre-placed depot strip outside the build area',
    'Tuỳ chọn':
      'Custom',
    'Tạo':
      'Create',
    'Valley IV không tự đặt tổng tuyến kho hàng; "Upgrade 2, depots" có dải kho tổng đặt sẵn ngoài vùng xây (viền vàng) — đặt Máy Nạp / Máy Dỡ Hàng Kho sát mép vùng xây để dùng. Wuling tự đặt tổng tuyến.':
      'Valley IV doesn\'t place its own depot bus; "Upgrade 2, depots" has a pre-placed depot strip outside the build area (yellow border) — place Depot Loaders / Unloaders against the edge of the build area to use it. Wuling places its own bus.',
    'EFO0………………  hoặc dán chuỗi bản vẽ EnKAD':
      'EFO0………………  or paste an EnKAD blueprint string',
    'Nhập':
      'Import',
    'Đang tải…':
      'Loading…',
    'Bản vẽ trống':
      'Empty blueprint',
    'Bản vẽ nhập':
      'Imported blueprint',
    'bỏ qua {0} loại không có trong dữ liệu ({1})':
      'skipped {0} type(s) not in the data ({1})',
    '{0} công trình không đặt được':
      '{0} building(s) couldn\'t be placed',
    'Đã nhập "{0}"{1}':
      'Imported "{0}"{1}',
    'Không đọc được bản vẽ':
      'Can\'t read the blueprint',
    'Nhập bản vẽ':
      'Import blueprint',
    'Mã bản vẽ':
      'Blueprint code',
    'Máy chủ':
      'Server',
    'Mã bản vẽ của game (EFO0…) được tra qua EnKAD — cần đúng máy chủ. Cũng có thể dán thẳng chuỗi bản vẽ (base64) của EnKAD. Bản vẽ nhập vào được lưu ở tab Blueprint rồi preview theo con trỏ để đặt.':
      'Game blueprint codes (EFO0…) are looked up through EnKAD — the server must match. You can also paste an EnKAD blueprint string (base64) directly. Imported blueprints are saved in the Blueprint tab and then follow the cursor for placement.',
    'Nhập bản vẽ từ file .json':
      'Import blueprints from a .json file',
    'Nhập file':
      'Import file',
    'Xuất "{0}" ra file':
      'Export "{0}" to a file',
    'Xuất mọi bản vẽ (blueprint, Modeler, map) ra một file':
      'Export every blueprint (blueprints, Modeler, maps) into one file',
    'Đã lưu file: {0}':
      'File saved: {0}',
    'Không xuất được file: {0}':
      'Could not export the file: {0}',
    'Xuất bản này':
      'Export this one',
    'Xuất tất cả':
      'Export all',
    '{0} bản':
      '{0} item(s)',
    'Lưu sơ đồ Modeler đang mở  (Ctrl+S)':
      'Save the open Modeler diagram  (Ctrl+S)',
    'Mở một tab Modeler trước':
      'Open a Modeler tab first',
    'Lưu sơ đồ hiện tại':
      'Save current diagram',
    'Chưa mở tab Modeler':
      'No Modeler tab open',
    'Lưu toàn bộ map hiện tại thành một bản vẽ mới  (Ctrl+S)':
      'Save the whole current map as a new blueprint  (Ctrl+S)',
    'Lưu map hiện tại':
      'Save current map',
    'Lưu nhóm đang chọn thành bản vẽ (module)  (Ctrl+S)':
      'Save the selected group as a blueprint (module)  (Ctrl+S)',
    'Chọn máy / nhóm máy trên bản vẽ trước':
      'Select a machine / group on the map first',
    'Lưu nhóm đang chọn':
      'Save selected group',
    'Chưa chọn máy nào':
      'No machine selected',
    'Nhập mã bản vẽ của game (EFO0…) hoặc chuỗi bản vẽ EnKAD':
      'Import a game blueprint code (EFO0…) or an EnKAD blueprint string',
    'Nhập mã bản vẽ':
      'Import blueprint code',
    'Bản vẽ toàn map':
      'Whole-map blueprint',
    'Sơ đồ Modeler — mở thành tab mới':
      'Modeler diagram — opens in a new tab',
    'Bản vẽ module (nhóm)':
      'Module blueprint (group)',
    'Số máy trên sơ đồ':
      'Machines in the diagram',
    'Diện tích (ô)':
      'Area (cells)',
    'Đặt':
      'Place',
    'Cổng kích hoạt: {0} · {1}/{2} mỗi phút (tối đa {3})':
      'Activator port: {0} · {1}/{2} per minute (max {3})',
    'chưa nạp':
      'not fed',
    'Đang ở môi trường {0}':
      'In environment {0}',
    'Cần môi trường {0} — {1}':
      'Needs environment {0} — {1}',
    'chưa nằm trọn trong vùng phủ nào':
      'not fully inside any zone',
    'đang ở {0}':
      'currently {0}',
    'TỐT':
      'OK',
    'KẸT':
      'JAMMED',
    'CHẬM':
      'SLOW',
    '{0} · {1}/{2} mỗi phút':
      '{0} · {1}/{2} per minute',
    'Cổng ra {0} — bấm để chọn {1}{2}{3}':
      'Output {0} — click to choose {1}{2}{3}',
    'vật phẩm xuất ra':
      'the output item',
    'sản phẩm':
      'the product',
    ' (đang: {0})':
      ' (currently: {0})',
    ' · mọi cổng băng ra đổi theo':
      ' · all belt outputs change together',
    'Cổng vào trống':
      'Empty input',
    'Cổng ra không dùng':
      'Unused output',
    'Chọn vật phẩm xuất ra':
      'Choose output item',
    'Chọn sản phẩm cổng ra':
      'Choose the output\'s product',
    'Không chọn được':
      'Can\'t choose',
    'Vật phẩm xuất ra':
      'Output item',
    'Sản phẩm ở cổng này':
      'Product at this port',
    'Chưa xuất gì — bấm vào cổng ra trên sơ đồ để chọn vật phẩm{0}.':
      'Nothing output yet — click an output on the map to choose an item{0}.',
    ' (mỗi cổng chọn một món riêng)':
      ' (each port picks its own item)',
    '{0} · {1}/phút ra khỏi băng này — bấm để đổi':
      '{0} · {1}/min leaving this belt — click to change',
    'Lượng đang nạp vào kho tổng của vật phẩm đã chọn':
      'Amount of the chosen item being fed into the depot',
    '{0} · đang nạp vào kho tổng {1}/phút':
      '{0} · feeding the depot {1}/min',
    '{0} · {1}/phút {2}':
      '{0} · {1}/min {2}',
    'Chỉ cho {0} đi tiếp · {1}/phút — bấm để đổi':
      'Only lets {0} through · {1}/min — click to change',
    'Chưa lọc — cho qua mọi thứ. Bấm để chọn vật phẩm được đi tiếp':
      'No filter — everything passes. Click to choose the item allowed through',
    'Chọn vật phẩm lọc':
      'Choose filter item',
    'Chỉ cho món này đi tiếp (Empty = mọi thứ)':
      'Only this item passes (Empty = everything)',
    'Đổi lưu lượng cảng kiểm soát':
      'Change control port flow',
    'Lưu lượng tối đa — bội số của 6, tối đa 60':
      'Max flow — multiple of 6, at most 60',
    'Lưu lượng':
      'Flow',
    'ra nhánh này':
      'to this branch',
    'Chưa có gì vào':
      'Nothing coming in',
    'Chưa ra đâu':
      'Not going anywhere',
    'Empty — không ra gì':
      'Empty — outputs nothing',
    'Đang xử lý {0}/phút':
      'Processing {0}/min',
    'Chưa có chất này chảy vào':
      'None of this substance flows in yet',
    'Công thức xử lý — tổng tối đa {0}/phút':
      'Processing recipes — total at most {0}/min',
    'Bỏ tích công thức':
      'Untick recipe',
    'Tích công thức':
      'Tick recipe',
    'Đã tích tay — bấm để bỏ tích':
      'Ticked manually — click to untick',
    'Máy đang tự chạy công thức này theo đầu vào — không tắt được':
      'The machine runs this recipe automatically from its inputs — can\'t be turned off',
    'Tích (ghim) công thức này':
      'Tick (pin) this recipe',
    'Đổi công thức':
      'Change recipe',
    'Thuộc chế độ khác — bấm để đổi chế độ và chạy':
      'Belongs to another mode — click to switch mode and run',
    'Đang chạy · {0}%{1}':
      'Running · {0}%{1}',
    ' · đã tích':
      ' · ticked',
    ' · tự chạy theo đầu vào':
      ' · runs automatically from inputs',
    'Đã tích — đang chờ đủ đầu vào. Bấm để bỏ tích':
      'Ticked — waiting for enough inputs. Click to untick',
    'Bấm để tích':
      'Click to tick',
    'Đang chờ':
      'Waiting',
    'Chế độ khác':
      'Other mode',
    'Tìm máy…':
      'Search machines…',
    'Bỏ ghim':
      'Unpin',
    'Ghim lên đầu':
      'Pin to top',
    ' (không dùng trong Modeler)':
      ' (not used in the Modeler)',
    'Phím {0}':
      'Key {0}',
    'Mở nhóm':
      'Expand group',
    'Thu gọn nhóm':
      'Collapse group',
    'Hiện cả những máy không đặt được lên sơ đồ Modeler (mờ) và công trình không xây được':
      'Also show machines that can\'t go on a Modeler diagram (dimmed) and unbuildable structures',
    'Hiện cả những công trình không được chọn hay xây dựng':
      'Also show structures that can\'t be chosen or built',
    'Hiện ẩn':
      'Show hidden',
    '{0}{1} (không chọn / xây được)':
      '{0}{1} (can\'t be chosen / built)',
    '{0}: không chọn hay xây được ở đây':
      '{0}: can\'t be chosen or built here',
    'Mở rộng bảng chọn máy  (F1)':
      'Expand the machine list  (F1)',
    'Ghim máy để hiện ở đây':
      'Pin machines to show them here',
    '{0} — phím {1}':
      '{0} — key {1}',
    'Thu gọn bảng chọn máy  (F1)':
      'Collapse the machine list  (F1)',
    'Đã ghim':
      'Pinned',
    'Ẩn — không xây được':
      'Hidden — can\'t be built',
    'Không có máy nào khớp':
      'No matching machine',
    'Ngôn ngữ':
      'Language',
    'Căn cứ':
      'Base',
    'Khu vực':
      'Area',
    'Ô băng chuyền':
      'Belt cells',
    'Ô ống':
      'Pipe cells',
    'Vùng môi trường':
      'Environment zones',
    'Điện nền (lõi căn cứ)':
      'Base power (base core)',
    'Điện các trạm':
      'Station power',
    'Điện tổng':
      'Total power',
    'Máy thiếu điện':
      'Machines without power',
    'Máy đang vướng':
      'Machines blocked',
    'Tuyến đầy tải':
      'Lines at full load',
    'Thiếu điện: tổng {0} (nền {1} + trạm {2}) ':
      'Missing power: total {0} (base {1} + stations {2}) ',
    'nhưng máy dùng {0}. Thêm trạm nhiệt năng hoặc đổi sang pin cấp cao hơn.':
      'but machines use {0}. Add Thermal Banks or switch to higher-grade batteries.',
    'Tuyến không hợp lệ ({0})':
      'Invalid line ({0})',
    'Cân bằng vật tư (mỗi phút)':
      'Item balance (per minute)',
    'Chưa có gì chạy.':
      'Nothing running yet.',
    'Dư':
      'Net',
    'Kho tổng (mỗi phút)':
      'Depot (per minute)',
    'Chưa có máy nạp/rút kho. Đặt Loader để bơm hàng vào kho, Unloader để rút ra.':
      'No depot loaders/unloaders yet. Place a Loader to push items into the depot, an Unloader to take them out.',
    'Nạp':
      'In',
    'Rút':
      'Out',
    'Tồn ±':
      'Stock ±',
    ' (chưa lưu vào thư viện)':
      ' (not saved to the library)',
    'Chưa lưu vào thư viện':
      'Not saved to the library',
    'Đóng tab':
      'Close tab',
    'Tab mới — Map hoặc Modeler':
      'New tab — Map or Modeler',
    'Chỉ nhận file bản vẽ .efp.json':
      'Only .efp.json blueprint files are accepted',
    'Ghim hộp hướng dẫn (bấm lần nữa để đóng)':
      'Pin the hint box (click again to close it)',
    'Bỏ ghim và đóng hộp hướng dẫn':
      'Unpin and close the hint box',
    'Huỷ (Esc)':
      'Cancel (Esc)',
    'Tên bản vẽ':
      'Blueprint name',
    'Bắt buộc':
      'Required',
    'Thêm nhanh':
      'Quick add',
    'Bỏ ghim khỏi thanh đặt máy thu gọn':
      'Unpin from the collapsed machine bar',
    'Ghim lên thanh đặt máy thu gọn':
      'Pin to the collapsed machine bar',
    'Đã đặt bản vẽ "{0}"':
      'Placed blueprint "{0}"',
    'Hoặc bấm vào một bản vẽ có sẵn bên trái để cập nhật bản vẽ đó thành bản vẽ này.':
      'Or click an existing blueprint on the left to update it to this one.',
    'Chỉ cập nhật được bản vẽ cùng loại':
      'Only a blueprint of the same type can be updated',
    'Cập nhật bản vẽ "{0}" thành bản vẽ mới? Nội dung cũ sẽ bị ghi đè, không hoàn tác được.':
      'Update blueprint "{0}" to the new one? Its old content will be overwritten — this cannot be undone.',
    'Cập nhật bản vẽ "{0}" thành bản vẽ mới "{1}"? Nội dung cũ sẽ bị ghi đè, không hoàn tác được.':
      'Update blueprint "{0}" to the new one "{1}"? Its old content will be overwritten — this cannot be undone.',
    'Cập nhật':
      'Update',
    'Đã cập nhật bản vẽ "{0}"':
      'Updated blueprint "{0}"',
    'Bấm để cập nhật "{0}" thành bản vẽ mới':
      'Click to update "{0}" to the new blueprint',
    '{0}: rê chuột tới chỗ cần đặt rồi bấm chuột trái · Esc để huỷ':
      '{0}: move the mouse to the spot, then left-click to place · Esc to cancel',
    'Chỉnh sửa bản vẽ':
      'Edit blueprint',
    'Giao diện sáng — bấm để chuyển sang tối':
      'Light mode — click to switch to dark',
    'Giao diện tối — bấm để chuyển sang sáng':
      'Dark mode — click to switch to light',
    'Cài đặt':
      'Settings',
    'Mô phỏng':
      'Simulate',
    '10 phút':
      '10 min',
    '1 giờ':
      '1 h',
    '4 giờ':
      '4 h',
    '8 giờ':
      '8 h',
    '24 giờ':
      '24 h',
    'Mất điện':
      'No power',
    'phút':
      'min',
    'Mô phỏng — chạy nhà máy như trong game (hàng chạy trên băng, tiến độ máy, kho); vẫn chỉnh sửa được trong lúc chạy':
      'Simulate — run the factory like the game (items moving on belts, machine progress, stores); you can keep editing while it runs',
    'Dừng  (Space)':
      'Pause  (Space)',
    'Chạy  (Space)':
      'Run  (Space)',
    'Tốc độ {0}×':
      'Speed {0}×',
    'Kho tổng nhận hàng kể cả khi đầy và luôn có đủ mọi món để rút. Tắt ⇒ mỗi món chứa tối đa 80 000. Đổi ⇒ chạy lại từ đầu.':
      'The depot accepts items even when full and always has every item to take. Off ⇒ at most 80,000 of each item. Changing it restarts the run.',
    'Kho tổng vô hạn':
      'Infinite depot',
    'Chờ nguyên liệu':
      'Waiting for ingredients',
    'Chưa chạy công thức nào — chờ nguyên liệu.':
      'No recipe run yet — waiting for ingredients.',
    'còn {0} s':
      '{0} s left',
    'Biểu đồ vẽ tối đa {0} món — bỏ bớt một món trước':
      'The chart shows at most {0} items — remove one first',
    'Bỏ khỏi biểu đồ':
      'Remove from the chart',
    'Thêm vào biểu đồ':
      'Add to the chart',
    'Bấm để tua tới lúc đó':
      'Click to jump to that moment',
    'Đang mô phỏng — bấm để thoát về bản vẽ tĩnh (mất tiến độ mô phỏng)':
      'Simulating — click to go back to the static map (simulation progress is lost)',
    'Cổng này chưa nối':
      'This port is not connected',
    'Cổng này ra {0}/phút':
      'This port outputs {0}/min',
    'Rê một ngón: kéo bản đồ':
      'One finger: pan the map',
    'Hai ngón: kéo + chụm để zoom':
      'Two fingers: pan + pinch to zoom',
    'Giữ 0,5 s ô trống: chọn vùng':
      'Hold 0.5 s on an empty cell: box select',
    'Rê nền: kéo sơ đồ · hai ngón: zoom':
      'Drag the background: pan · two fingers: zoom',
    'Giữ 0,5 s nền: chọn nhóm':
      'Hold 0.5 s on the background: box select',
    'Chạm hai lần vào máy: chọn công thức':
      'Double-tap a machine: choose a recipe',
    'Xoay':
      'Rotate',
    'Chọn vùng':
      'Box',
    'Đầu ống ở chỗ khác — rê từ đầu ống':
      'The line head is elsewhere — drag from the head',
    'Không rẽ được ngay trên cầu':
      'Cannot turn on a bridge',
    'Không quay đầu được':
      'Cannot turn back',
    'Máy chặn — đi vào máy qua ô trước một cổng vào':
      'Blocked by a machine — enter it through the cell in front of an input port',
    'Đường tự cắt chính nó':
      'The line crosses itself',
    'Vướng vật cản':
      'Blocked',
    'Ngắt ống — đi qua vật cản quá {0} ô':
      'Line cut — went through more than {0} blocked cells',
    'Ô trước cổng ra đang vướng':
      'The cell in front of the output port is blocked',
    'Không có cổng ra {0} ở mặt này của máy':
      'No {0} output port on this side of the machine',
    'Đầu ống đang nằm trên cầu — rê thêm một ô':
      'The head is on a bridge — drag one more cell',
    'Chạm: chọn máy / ô':
      'Tap: select a machine / cell',
    'Giữ 0,5 s trên máy: di chuyển':
      'Hold 0.5 s on a machine: move',
    'Chọn máy ở bảng trái, chạm bản đồ: đặt preview, ✓ để đặt':
      'Pick a machine on the left, tap the map: preview, ✓ to place',
    'Băng / ống: rê ngón vẽ đường, ✓ để đặt':
      'Belt / pipe: draw with your finger, ✓ to place',
    'Rê máy: di chuyển':
      'Drag a machine: move',
    'Rê từ cổng: nối · giữ cổng rồi rê: đổi chỗ':
      'Drag from a port: connect · hold a port then drag: move it',
    'Giữ lâu cổng / đường: menu, bỏ nối':
      'Long-hold a port / link: menu, disconnect',
    'Sao chép':
      'Copy',
    'Di chuyển':
      'Move',
    'Chọn thêm':
      'Add',
    'Huỷ chọn':
      'Deselect',
    'Đã đặt {0} ô — vẽ tiếp, hoặc Huỷ để thôi':
      'Placed {0} cells — keep drawing, or Cancel to stop',
    'Bản sao ở ngay bên cạnh — rê để dời, Đặt để đặt':
      'The copy is right next to it — drag to move, Place to place',
    'Đã đặt bản sao — bản sao đang được chọn':
      'Copy placed — the copy is selected',
    'Đã đặt bản vẽ':
      'Blueprint placed',
    'Nhạc nền':
      'Background music',
    'Biển tên trên thân máy':
      'Name plates on machines',
    'Kiểm tra tầm điện':
      'Check power range',
    'Bật: máy ngoài tầm cột / trụ điện không chạy. Tắt khi đang phác thảo':
      'On: machines outside pylon range do not run. Turn off while sketching',
    'Gộp':
      'Merge',
    'Tách':
      'Split',
    'Kiểm soát':
      'Control',
    'Cầu nối':
      'Bridge',
    'Đã thôi chọn {0}':
      'Stopped placing {0}',
    'Nhiên liệu khác':
      'Other fuels',
    'Nền đơn giản':
      'Simple area',
    'Nền cỏ':
      'Grass area',
    'Nền bản vẽ':
      'Board background',
    'Không hiện tooltip':
      'Hide tooltips',
    'Tắt chữ nổi khi rê chuột lên nút / máy / ô':
      'Turn off the hover text on buttons, machines and cells',
    'Con trỏ ô':
      'Pointer',
    'Bật: rê chuột tới ô nào trên Map thì hiện khung ô đó. Tắt: không hiện gì':
      'On: outline the Map cell under the mouse. Off: show nothing',
    '{0}: cháy {1} giây, phát {2} MW':
      '{0}: burns {1} s, gives {2} MW',
    'Chưa có món nào nạp vào kho tổng.':
      'Nothing has been loaded into the depot yet.',
    'Nạp vào kho tổng mỗi phút':
      'Loaded into the depot per minute',
    'Kéo hoặc bấm để tua (phần sáng = đã tính sẵn)':
      'Drag or click to seek (lighter part = already computed)',
    'ph':
      'min',
    '{0} — chuột phải: xoá sạch ô này':
      '{0} — right-click: empty this slot',
    '{0} MW khi đang cháy':
      '{0} MW while burning',
    'Chuột phải: xoá sạch':
      'Right-click: empty',
    'Đang mô phỏng nhóm {0} map (chung kho tổng + điện) — đang tính sẵn 24 giờ ở nền. Space: chạy / dừng':
      'Simulating a group of {0} maps (shared depot + power) — precomputing 24 hours in the background. Space: run / pause',
    'Đang mô phỏng — đang tính sẵn 24 giờ ở nền, kéo thanh tua dưới biểu đồ để tới bất kỳ lúc nào. Space: chạy / dừng':
      'Simulating — precomputing 24 hours in the background; drag the time bar under the chart to go to any moment. Space: run / pause',
    'Nhóm tab đổi — mô phỏng của nhóm / tab đó đã dừng':
      'Tab group changed — the simulation of that group / tab was stopped',
    'Đã xoá {0} {1} khỏi máy':
      'Removed {0} {1} from the machine',
    'đang tính sẵn… {0}':
      'precomputing… {0}',
    'Làm lại từ đầu (mọi máy rỗng, tính lại 24 giờ)':
      'Restart from the beginning (all machines empty, recompute 24 hours)',
    'Độ dài trục thời gian của biểu đồ / thanh tua và khoảng "N giờ tới" của bảng tổng hợp':
      'Length of the chart / time bar axis and of the "next N hours" column of the summary',
    'Mở biểu đồ':
      'Open the chart',
    'Thu gọn biểu đồ (chỉ còn thanh tua)':
      'Collapse the chart (keep only the time bar)',
    'Tổng hợp mô phỏng':
      'Simulation summary',
    'Nhóm':
      'Group',
    '{0} map':
      '{0} maps',
    'Đang xem':
      'Viewing',
    'Đã tính sẵn':
      'Computed up to',
    'Điện phát':
      'Power supply',
    'Điện cần':
      'Power demand',
    'Thiếu điện — mọi máy cần điện đang dừng. Đưa pin vào trạm điện.':
      'Missing power — every powered machine is stopped. Feed batteries into a thermal bank.',
    'Chưa có.':
      'None yet.',
    '30 phút tới':
      'Next 30 min',
    '{0} tới':
      'Next {0}',
    'Mới tính được {0} của khoảng này':
      'Only {0} of this range is computed so far',
    'Sản lượng (trung bình mỗi phút)':
      'Output (average per minute)',
    'Nạp vào kho tổng (trung bình mỗi phút)':
      'Loaded into the depot (average per minute)',
    'Tên nhóm':
      'Group name',
    '{0} tab':
      '{0} tabs',
    'Nhóm tab — bấm: {0} · bấm đúp: đổi tên · kéo: dời cả nhóm. Map trong nhóm mô phỏng chung kho tổng và điện':
      'Tab group — click: {0} · double-click: rename · drag: move the whole group. Maps in the group are simulated with a shared depot and power',
    'mở nhóm':
      'expand the group',
    'thu gọn nhóm':
      'collapse the group',
    'Hiện thanh điều khiển mô phỏng':
      'Show the simulation controls',
    'Ẩn thanh điều khiển mô phỏng':
      'Hide the simulation controls',
    'Tổng hợp {0}':
      'Summary over {0}',
    'Ô này là cổng RA {0} của {1} — cổng vào {0} nằm ở chỗ khác trên máy (xem sơ đồ cổng trong cửa sổ máy)':
      'This cell is an OUTPUT {0} port of {1} — its {0} inputs are elsewhere on the machine (see the port layout in the machine window)',
    'Ô này là cổng RA {0} của {1} — máy này không nhận {0} vào':
      'This cell is an OUTPUT {0} port of {1} — this machine takes no {0} input',
    'Đang phát nhạc nền — bấm để tắt':
      'Background music on — click to turn it off',
    'Tìm vật phẩm…':
      'Search items…',
    'Đang bật "Kho tổng vô hạn" — tắt đi thì sản lượng tự sinh mới có tác dụng.':
      '"Infinite depot" is on — turn it off for the generated amounts to take effect.',
    'Kho tổng tự sinh (mỗi phút)':
      'Depot generation (per minute)',
    'Số mỗi phút tự có thêm trong kho tổng':
      'Amount added to the depot every minute',
    '/ph':
      '/min',
    'Có tự sinh ({0})':
      'Generated ({0})',
    'Không tự sinh ({0})':
      'Not generated ({0})',
    'Nhập số ở cột bên phải để món đó tự sinh vào kho tổng.':
      'Type a number in the right column to generate that item into the depot.',
    'Ô đầu ra đầy':
      'Output slot full',
    'Kẹt':
      'Stuck',
    'Kho tổng tự sinh — mỗi món tự có thêm bao nhiêu mỗi phút (dùng khi tắt kho tổng vô hạn)':
      'Depot generation — how much of each item appears per minute (used when the infinite depot is off)',
    'Sản lượng thâm hụt (trung bình mỗi phút)':
      'Deficit (average per minute)',
    'Âm lượng':
      'Volume',
    'Xem mọi món nạp vào kho tổng':
      'Show every item loaded into the depot',
    'Mở bảng':
      'Expand the table',
    'Thu gọn bảng':
      'Collapse the table',
    'Không nối một máy với chính nó (chỉ nối được vào cổng kích hoạt của nó)':
      'A machine cannot connect to itself (only into its own activator port)',
    'Chất kích hoạt (cần 6/phút mỗi máy — đường Tự động chở đúng số máy × 6; nối được từ chính máy này)':
      'Activator (6/min per machine needed — an Auto line carries exactly machines × 6; can come from this machine itself)',
    'Số lò (để trống = tính theo nhu cầu phía sau)':
      'Number of crucibles (empty = from downstream demand)',
    ' · kích hoạt Tự động (số máy × 6/phút)':
      ' · activator Auto (machines × 6/min)',
    'Đã nối {0} vào cổng kích hoạt của chính máy này':
      'Connected {0} into this machine\'s own activator port',
    'Lấy {0} ra từ kho / bể (chuyển tiếp hàng đã vào)':
      'Take {0} out of the storage / tank (passes on what came in)',
    'Tự động ({0}/phút)':
      'Auto ({0}/min)',
    'Tự động = số máy thật × 6/phút (đủ để máy chạy). Đặt tay: chia hết cho 6, tối đa 60; không giới hạn: máy xin tới 30/phút mỗi máy.':
      'Auto = real machines × 6/min (enough to run). Manual: multiples of 6, up to 60; unlimited: the machine asks up to 30/min per machine.',
    'Đặt tiếp': 'Keep placing',
    'Kiểm soát lưu lượng': 'Flow control',
    '/phút': '/min',
    'Thư viện công thức — hồ sơ vật phẩm, chuỗi sản xuất': 'Recipe library — item records, production chains',
    'Quay lại (Esc)': 'Back (Esc)',
    'Thư viện công thức': 'Recipe library',
    'Cơ Sở Dữ Liệu Endfield': 'Endfield Database',
    'Hồ Sơ Vật Phẩm': 'Item Records',
    'Chuỗi Sản Xuất': 'Production Chain',
    'Không có vật phẩm nào khớp': 'No matching items',
    'Bỏ ghim máy này khỏi bảng chọn máy': 'Unpin this machine from the machine list',
    'Ghim máy này lên bảng chọn máy': 'Pin this machine to the machine list',
    'Đã ghim {0}': 'Pinned {0}',
    'Đã bỏ ghim {0}': 'Unpinned {0}',
    'khai thác': 'extract',
    'Thể': 'Phase',
    'Rắn': 'Solid',
    'Đốt trong trạm điện: {0} MW trong {1} s mỗi đơn vị': 'Burns in a power station: {0} MW for {1} s per unit',
    'Nạp vào Máy Khuếch Tán tạo môi trường {0}': 'Fed into a Diffuser it creates a {0} environment',
    'Chỉ lấy được bằng khai thác, không sản xuất được': 'Only obtainable by extraction, cannot be produced',
    'Nguồn': 'Source',
    'Không có cách làm ra — sản phẩm thô': 'No way to make it — raw material',
    'Công Thức Áp Dụng': 'Used In',
    'Chưa công thức nào dùng vật phẩm này': 'No recipe uses this item yet',
    'Xem Chuỗi': 'View Chain',
    'MÔI TRƯỜNG': 'ENVIRONMENT',
    'Công thức mặc định': 'Default recipe',
    'Công thức khác': 'Other recipes',
    'Đặt công thức mặc định': 'Set as default recipe',
    'Đã đặt công thức mặc định cho {0}': 'Default recipe set for {0}',
    'Ẩn': 'Hide',
    'Biến chuỗi này (theo công thức mặc định) thành sơ đồ Modeler mới': 'Turn this chain (using default recipes) into a new Modeler diagram',
    'Đã model hoá chuỗi {0} thành sơ đồ Modeler': 'Modelled the {0} chain as a Modeler diagram',
    'Mô hình hoá': 'Modelize',
    'Chạm máy: chọn / bỏ chọn': 'Tap a machine: select / deselect',
    'Giữ 0,5 s trên máy: di chuyển cả nhóm': 'Hold 0.5 s on a machine: move the whole group',
    'Thoát: thoát chế độ chọn nhiều': 'Exit: leave multi-select mode',
    'Chạm máy khác: chọn máy đó · chạm lại: bỏ chọn': 'Tap another machine: select it · tap again: deselect',
    'Sao chép · Xoá · Lưu: ở thanh thao tác bên phải': 'Copy · Delete · Save: in the action bar on the right',
    'Lưu trữ (xoá)': 'Store (delete)',
    'Bật / tắt máy': 'Turn machines on / off',
    'Bỏ chọn (Esc hoặc bấm chỗ trống)': 'Deselect (Esc or click empty space)',
    'Chọn nhiều': 'Multi-select',
    'Đang chọn máy': 'Machine selected',
    'Chọn nhiều — bấm từng máy để chọn / bỏ chọn, rồi thao tác với cả nhóm': 'Multi-select — tap machines to select / deselect, then act on the whole group',
    'Thoát': 'Exit',
    'Tìm vật phẩm': 'Search items',
    'CSDL': 'Database',
    'Chất kích hoạt: {0}': 'Activator: {0}',
    'Hiện bảng chọn máy': 'Show the machine list',
    'Bấm: thu gọn': 'Click: collapse',
    'Bấm: xem đủ công thức': 'Click: show the full recipe',
    'Bấm: hiện / ẩn chuỗi làm khí cho máy khuếch tán': 'Click: show / hide the chain that makes the gas for the Vaporizer',
    'ỔN ĐỊNH': 'STABLE',
    'AXIT': 'ACID',
    'Kéo để di chuyển · lăn chuột / hai ngón để thu phóng': 'Drag to move · scroll / two fingers to zoom',
    'Lắp': 'Fit',
    'Chiết': 'Fill',
    'Luyện': 'Refine',
    'Phản ứng khí': 'Gas reaction',
    'Nghiền': 'Shred',
    'Tinh chế': 'Purify',
    'Chuyển hoá': 'Transmute',
    'Trồng': 'Plant',
    'Lò phản ứng': 'Crucible',
    'Thu hạt': 'Seed-pick',
    'Đúc': 'Mould',
    'Nghiền mịn': 'Grind',
    'Đóng gói': 'Pack',
    'Linh kiện': 'Gear',
    'Rèn': 'Forge',
    'Đưa chuỗi này (theo công thức mặc định) vào sơ đồ Modeler đang mở': 'Put this chain (using default recipes) into the open Modeler diagram',
    'Chưa mở tab Modeler nào. Tạo sơ đồ Modeler mới cho chuỗi {0}?': 'No Modeler tab is open. Create a new Modeler diagram for the {0} chain?',
    'Tạo Modeler mới': 'New Modeler',
    'Đã mô hình hoá chuỗi {0} — các máy mới đang được chọn': 'Modelized the {0} chain — the new machines are selected',
    'Bật nhạc nền ({0}, lặp lại)':
      'Play background music ({0}, looping)',
    'Chưa có nhạc nền — chọn file MP3 trong Cài đặt':
      'No background music yet — pick an MP3 file in Settings',
    'Chưa có nhạc nền — mở Cài đặt (bánh răng) ⇒ "Chọn MP3…" để chọn file nhạc của bạn':
      'No background music yet — open Settings (gear) ⇒ "Choose MP3…" to pick your own music file',
    'Nhạc nền: {0}':
      'Background music: {0}',
    'Chọn MP3…':
      'Choose MP3…',
    'Bỏ file nhạc đã chọn':
      'Remove the chosen music file',
    'Chưa có — chọn file MP3 của bạn':
      'None yet — pick your own MP3 file',
    'File nhạc chỉ lưu trong trình duyệt / app trên máy này, không gửi đi đâu':
      'The music file is only stored in this browser / app on this device, never uploaded',
    'Phiên bản':
      'Version',
    'Tải app:':
      'Get the app:',
    'Tải bộ cài Windows (.exe) bản mới nhất':
      'Download the latest Windows installer (.exe)',
    'Tải app Android (.apk) bản mới nhất':
      'Download the latest Android app (.apk)',
    'Trang các bản phát hành trên GitHub':
      'Releases page on GitHub',
    "Đã thoát chế độ chọn hàng loạt":
      "Left batch selection mode",
    "Đổi chế độ máy đang cầm: bấm Space":
      "To switch the held machine's mode, press Space",
    "Chế độ chọn hàng loạt — bấm chọn / bỏ chọn, kéo hộp chọn thêm, chuột phải kéo hộp bỏ chọn; X / Esc / chuột phải để thoát":
      "Batch selection — click to select / deselect, drag a box to add, right-drag a box to remove; X / Esc / right-click to exit",
    "Chọn máy trước rồi bấm Tab để tắt / bật":
      "Select machines first, then press Tab to turn them off / on",
    "Không có máy nào dùng điện trong vùng chọn để tắt / bật":
      "No powered machine in the selection to turn off / on",
    "Tắt {0} máy":
      "Turn off {0} machines",
    "Bật {0} máy":
      "Turn on {0} machines",
    "Đã tắt {0} máy — không chạy, không tốn điện (Tab để bật lại)":
      "Turned off {0} machines — they stop and use no power (Tab to turn back on)",
    "Đã bật lại {0} máy":
      "Turned {0} machines back on",
    "Đã tắt — Tab để bật lại":
      "Turned off — Tab to turn back on",
    "Chọn / Bỏ chọn":
      "Select / deselect",
    "Kéo hộp: Chọn nhiều":
      "Drag a box: select many",
    "Kéo hộp: Bỏ chọn nhiều":
      "Drag a box: deselect many",
    "Thoát chế độ hàng loạt":
      "Exit batch mode",
    "Chọn hàng loạt":
      "Batch select",
    "Không có máy dùng điện nào đang chọn để bật / tắt":
      "No powered machine selected to turn on / off",
    "Bật lại máy đang chọn":
      "Turn the selected machines back on",
    "Tắt máy đang chọn — không chạy, không tốn điện":
      "Turn the selected machines off — they stop and use no power",
    "Lưu trữ (xoá) {0}":
      "Store (delete) {0}",
    "Bật / tắt máy đang chọn":
      "Turn selected machines on / off",
    "Xoá đang chọn / tẩy":
      "Delete selection / eraser",
    "Đóng / mở danh sách máy":
      "Hide / show the machine list",
  },
};
