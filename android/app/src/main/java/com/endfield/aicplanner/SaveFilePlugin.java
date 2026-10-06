package com.endfield.aicplanner;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Hộp thoại **"Lưu thành…"** của Android (Storage Access Framework) cho nút Xuất của cửa sổ Bản vẽ — giống lệnh Rust
 * `save_text` của bản exe. `save({ name, text, mime })` ⇒ `{ saved, uri }`; bấm Huỷ ⇒ `saved: false`.
 */
@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {
    private String pending = null;

    @PluginMethod
    public void save(PluginCall call) {
        String name = call.getString("name", "export.json");
        String mime = call.getString("mime", "application/json");
        pending = call.getString("text", "");
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, intent, "onPicked");
    }

    @ActivityCallback
    private void onPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            ret.put("saved", false);
            call.resolve(ret);
            return;
        }
        Uri uri = data.getData();
        try (OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
            if (out == null) throw new Exception("openOutputStream null");
            out.write((pending == null ? "" : pending).getBytes(StandardCharsets.UTF_8));
            ret.put("saved", true);
            ret.put("uri", uri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Không ghi được file: " + e.getMessage());
        } finally {
            pending = null;
        }
    }
}
