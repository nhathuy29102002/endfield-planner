//! Endfield AIC Planner — vỏ ứng dụng máy tính (Tauri 2).
//!
//! Giao diện là đúng bản web (`dist/`), chạy trong WebView2 của Windows. Vỏ này thêm hai việc:
//! 1. Tắt các hành vi "trình duyệt" (người dùng 2026-09-30): phím tắt của trình duyệt (F5 / Ctrl+R tải lại,
//!    Ctrl+F tìm, Ctrl+P in, Ctrl+U xem mã, F12 / Ctrl+Shift+I công cụ nhà phát triển, Alt+← quay lại…), zoom trang
//!    bằng Ctrl + lăn / Ctrl+± / hai ngón, menu chuột phải mặc định, thanh trạng thái khi rê lên liên kết. Phím tắt
//!    của ứng dụng (F1, F3, Ctrl+R xoay camera, Ctrl+S…) vẫn tới trang bình thường.
//! 2. Lệnh `efbp`: tra mã bản vẽ của game (`EFO0…`) qua API của EnKAD — bản web đi qua proxy của Vite, trong app
//!    không có proxy nên gọi thẳng từ đây (không bị CORS).
//! 3. Lệnh `save_text` (người dùng 2026-10-04): nút **Xuất** của cửa sổ Bản vẽ. Bản web tải file bằng liên kết
//!    `<a download>`, nhưng WebView2 trong Tauri **bỏ qua** việc tải xuống đó ⇒ trong app bấm Xuất không ra gì. Lệnh này
//!    mở hộp thoại "Lưu file" của Windows rồi ghi file.

/// Kết quả tra mã: mã trạng thái HTTP + nội dung trả về (chuỗi bản vẽ, hoặc JSON báo lỗi).
#[derive(serde::Serialize)]
struct EfbpReply {
  status: u16,
  body: String,
}

/// Tra mã bản vẽ `code` trên máy chủ `server` (euandus / asiapacific / beyondcn) qua EnKAD.
#[tauri::command]
async fn efbp(code: String, server: String) -> Result<EfbpReply, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let res = ureq::get("https://beta.enka.network/endfield/aic/api/efbp")
      .query("code", &code)
      .query("server", &server)
      .timeout(std::time::Duration::from_secs(20))
      .call();
    match res {
      Ok(r) => {
        let status = r.status();
        r.into_string().map(|body| EfbpReply { status, body }).map_err(|e| e.to_string())
      }
      // mã lỗi HTTP (404…) vẫn trả nội dung để giao diện đọc thông báo
      Err(ureq::Error::Status(status, r)) => Ok(EfbpReply { status, body: r.into_string().unwrap_or_default() }),
      Err(e) => Err(format!("Không kết nối được EnKAD: {e}")),
    }
  })
  .await
  .map_err(|e| e.to_string())?
}

/// Mở hộp thoại "Lưu file" của Windows (tên gợi ý `name`, lọc `.json`) rồi ghi `text` vào file đã chọn.
/// Trả về đường dẫn đã lưu; `None` = người dùng bấm Huỷ.
#[tauri::command]
async fn save_text(window: tauri::WebviewWindow, name: String, text: String) -> Result<Option<String>, String> {
  #[cfg(windows)]
  {
    // HWND không gửi qua luồng được ⇒ chuyển thành số; hộp thoại chạy trên một luồng riêng có COM (STA)
    let owner = window.hwnd().map(|h| h.0 as isize).unwrap_or(0);
    let path = std::thread::spawn(move || pick_save_path(owner, &name))
      .join()
      .map_err(|_| "Hộp thoại lưu file bị lỗi".to_string())??;
    match path {
      Some(p) => {
        std::fs::write(&p, text.as_bytes()).map_err(|e| format!("Không ghi được file: {e}"))?;
        Ok(Some(p))
      }
      None => Ok(None),
    }
  }
  #[cfg(not(windows))]
  {
    let _ = (window, name, text);
    Err("Chỉ hỗ trợ trên Windows".to_string())
  }
}

#[cfg(windows)]
fn pick_save_path(owner: isize, name: &str) -> Result<Option<String>, String> {
  use windows::Win32::Foundation::HWND;
  use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize,
  };
  use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
  use windows::Win32::UI::Shell::{FileSaveDialog, IFileSaveDialog, SIGDN_FILESYSPATH};
  use windows::core::{HSTRING, PCWSTR};
  unsafe {
    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    let result = (|| -> Result<Option<String>, String> {
      let dlg: IFileSaveDialog = CoCreateInstance(&FileSaveDialog, None, CLSCTX_INPROC_SERVER).map_err(|e| e.to_string())?;
      let label = HSTRING::from("Endfield AIC Planner (*.json)");
      let spec = HSTRING::from("*.json");
      let all_label = HSTRING::from("*.*");
      let all_spec = HSTRING::from("*.*");
      let types = [
        COMDLG_FILTERSPEC { pszName: PCWSTR(label.as_ptr()), pszSpec: PCWSTR(spec.as_ptr()) },
        COMDLG_FILTERSPEC { pszName: PCWSTR(all_label.as_ptr()), pszSpec: PCWSTR(all_spec.as_ptr()) },
      ];
      dlg.SetFileTypes(&types).map_err(|e| e.to_string())?;
      dlg.SetDefaultExtension(&HSTRING::from("json")).map_err(|e| e.to_string())?;
      dlg.SetFileName(&HSTRING::from(name)).map_err(|e| e.to_string())?;
      let hwnd = if owner != 0 { Some(HWND(owner as *mut core::ffi::c_void)) } else { None };
      if dlg.Show(hwnd).is_err() {
        // bấm Huỷ (ERROR_CANCELLED) hoặc đóng hộp thoại
        return Ok(None);
      }
      let item = dlg.GetResult().map_err(|e| e.to_string())?;
      let p = item.GetDisplayName(SIGDN_FILESYSPATH).map_err(|e| e.to_string())?;
      let path = p.to_string().map_err(|e| e.to_string());
      CoTaskMemFree(Some(p.0 as *const core::ffi::c_void));
      path.map(Some)
    })();
    CoUninitialize();
    result
  }
}

/// Tắt phím tắt / menu / zoom của trình duyệt trong WebView2.
#[cfg(windows)]
fn disable_browser_features(window: &tauri::WebviewWindow) {
  let _ = window.with_webview(|webview| unsafe {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
      ICoreWebView2Settings3, ICoreWebView2Settings5, ICoreWebView2Settings6,
    };
    use windows::core::Interface;
    let Ok(core) = webview.controller().CoreWebView2() else { return };
    let Ok(settings) = core.Settings() else { return };
    let _ = settings.SetAreDefaultContextMenusEnabled(false);
    let _ = settings.SetIsZoomControlEnabled(false);
    let _ = settings.SetIsStatusBarEnabled(false);
    let _ = settings.SetAreDevToolsEnabled(cfg!(debug_assertions));
    if let Ok(s3) = settings.cast::<ICoreWebView2Settings3>() {
      let _ = s3.SetAreBrowserAcceleratorKeysEnabled(false);
    }
    if let Ok(s5) = settings.cast::<ICoreWebView2Settings5>() {
      let _ = s5.SetIsPinchZoomEnabled(false);
    }
    if let Ok(s6) = settings.cast::<ICoreWebView2Settings6>() {
      let _ = s6.SetIsSwipeNavigationEnabled(false);
    }
  });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![efbp, save_text])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      #[cfg(windows)]
      {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
          disable_browser_features(&window);
        }
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
