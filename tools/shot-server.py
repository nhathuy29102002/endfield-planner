"""
Server nhỏ để kiểm hình khi khung Browser của Claude bị ẩn (chụp màn hình khi đó trả ảnh cũ).

    python3 tools/shot-server.py [thư-mục-ra]      # mặc định /tmp/efp-shots, cổng 5199

Trong trang: fetch('http://127.0.0.1:5199/ten', {method:'POST', body: canvas.toDataURL('image/jpeg')})
⇒ ghi <thư-mục-ra>/ten.jpg để mở bằng Read. Chỉ nghe ở 127.0.0.1.
"""
import base64, http.server, os, sys

out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/efp-shots'
os.makedirs(out, exist_ok=True)

class H(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_POST(self):
        n = int(self.headers['Content-Length']); body = self.rfile.read(n).decode()
        name = os.path.basename(self.path.strip('/')) or 'shot'
        with open(os.path.join(out, f'{name}.jpg'), 'wb') as f:
            f.write(base64.b64decode(body.split(',', 1)[1]))
        self.send_response(200); self._cors(); self.end_headers(); self.wfile.write(b'ok')
    def log_message(self, *a): pass

http.server.HTTPServer(('127.0.0.1', 5199), H).serve_forever()
