package com.workmemo.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 桥接 WebView 与桌面小组件：
 * 1) saveToday —— JS 侧把 buildWidgetPayload / buildWidgetGridPayload 的结果传进来，
 *    持久化到 SharedPreferences 并立即刷新全部课表小组件；
 * 2) requestPin —— App 内点"添加到桌面"时调用系统 requestPinAppWidget，
 *    直接弹出放置确认框，省去用户去小部件列表里翻找。
 */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {

    static final String PREFS_NAME = "widget_data";
    static final String PREFS_KEY_PAYLOAD = "schedule_payload";
    /** 课表网格小组件的整周数据，与今日/近日的 payload 分开存 */
    static final String PREFS_KEY_GRID = "schedule_grid_payload";

    @PluginMethod
    public void saveToday(PluginCall call) {
        String payload = call.getString("payload", "");
        String gridPayload = call.getString("gridPayload", null);
        Context ctx = getContext();
        android.content.SharedPreferences.Editor ed = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(PREFS_KEY_PAYLOAD, payload == null ? "" : payload);
        // gridPayload 为空时保留旧值，避免旧版 JS 调用把网格数据清掉
        if (gridPayload != null) ed.putString(PREFS_KEY_GRID, gridPayload);
        ed.apply();
        TodayWidgetProvider.pushUpdate(ctx);
        RecentWidgetProvider.pushUpdate(ctx);
        ScheduleWidgetProvider.pushUpdate(ctx);
        call.resolve();
    }

    /** 一键添加到桌面（Android 8.0+ 且桌面支持 requestPinAppWidget）。 */
    @PluginMethod
    public void requestPin(PluginCall call) {
        String which = call.getString("widget", "today");
        Context ctx = getContext();
        JSObject ret = new JSObject();

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            ret.put("supported", false);
            ret.put("reason", "android-too-old");
            call.resolve(ret);
            return;
        }

        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        if (!mgr.isRequestPinAppWidgetSupported()) {
            ret.put("supported", false);
            ret.put("reason", "launcher-unsupported");
            call.resolve(ret);
            return;
        }

        ComponentName cn;
        if ("recent".equals(which)) {
            cn = new ComponentName(ctx, RecentWidgetProvider.class);
        } else if ("grid".equals(which)) {
            cn = new ComponentName(ctx, ScheduleWidgetProvider.class);
        } else {
            cn = new ComponentName(ctx, TodayWidgetProvider.class);
        }
        boolean launched = mgr.requestPinAppWidget(cn, null, null);
        ret.put("supported", true);
        ret.put("launched", launched);
        call.resolve(ret);
    }
}
