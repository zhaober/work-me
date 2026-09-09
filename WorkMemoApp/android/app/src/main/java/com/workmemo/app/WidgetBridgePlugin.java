package com.workmemo.app;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 桥接 WebView 与桌面小组件：
 * JS 侧把 buildWidgetPayload 的结果传进来，这里持久化到
 * SharedPreferences 并立即刷新所有课表小组件。
 */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {

    static final String PREFS_NAME = "widget_data";
    static final String PREFS_KEY_PAYLOAD = "schedule_payload";

    @PluginMethod
    public void saveToday(PluginCall call) {
        String payload = call.getString("payload", "");
        Context ctx = getContext();
        ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(PREFS_KEY_PAYLOAD, payload == null ? "" : payload)
                .apply();
        TodayWidgetProvider.pushUpdate(ctx);
        RecentWidgetProvider.pushUpdate(ctx);
        call.resolve();
    }
}
