package com.endfield.aicplanner;

import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import java.util.ArrayList;
import java.util.List;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * App Android của Endfield AIC Planner (người dùng 2026-10-05): chạy đúng bản web trong `assets/public` (offline),
 * **toàn màn hình** — ẩn thanh trạng thái và thanh điều hướng (vuốt từ mép để hiện tạm), khoá ngang (Manifest),
 * cỡ chữ của hệ thống không làm vỡ bố cục (textZoom 100 %).
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SaveFilePlugin.class);
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WebView web = getBridge().getWebView();
        WebSettings ws = web.getSettings();
        ws.setTextZoom(100);
        ws.setSupportZoom(false);
        ws.setBuiltInZoomControls(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        hideSystemBars();
        // vùng **không** cho cử chỉ "Quay lại" của hệ thống (vuốt từ mép) — tay kéo bảng Tổng hợp dính mép phải màn hình,
        // vuốt nó phải tới được app (người dùng 2026-10-06). JS gọi EfpNative.setGestureExclusion("x,y,w,h;…") theo px CSS.
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void setGestureExclusion(String spec) {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;
                float k = getResources().getDisplayMetrics().density;
                List<Rect> rects = new ArrayList<>();
                for (String part : spec.split(";")) {
                    String[] v = part.split(",");
                    if (v.length != 4) continue;
                    try {
                        float x = Float.parseFloat(v[0]), y = Float.parseFloat(v[1]), w = Float.parseFloat(v[2]), h = Float.parseFloat(v[3]);
                        rects.add(new Rect(Math.round(x * k), Math.round(y * k), Math.round((x + w) * k), Math.round((y + h) * k)));
                    } catch (NumberFormatException ignored) {
                    }
                }
                web.post(() -> web.setSystemGestureExclusionRects(rects));
            }
        }, "EfpNative");
        // nút Quay lại = Esc của app (window.efpBack); không còn gì để huỷ ⇒ lui app về nền, giữ trạng thái
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                web.evaluateJavascript("window.efpBack ? efpBack() : false", v -> {
                    if (!"true".equals(v)) moveTaskToBack(true);
                });
            }
        });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
