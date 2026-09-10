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
import org.json.JSONObject;

/**
 * 桥接 WebView 与桌面小组件：
 * 1) saveToday —— JS 侧把 buildWidgetPayload / buildWidgetGridPayload 的结果传进来，
 *    持久化到 SharedPreferences 并立即刷新全部课表小组件；
 * 2) requestPin —— App 内点"添加到桌面"时调用系统 requestPinAppWidget；
 * 3) consumePinResult —— 回到前台时用"小组件实例数量前后对比"给出确定结论。
 *
 * 关于"点了没反应"：国产 ROM 行为差异极大（小米/红米**不弹确认框**，直接添加，
 * 空间不足还会自动新建一页），所以不能靠"有没有弹窗"判断成功与否，
 * 也不能只靠 requestPinAppWidget 的返回值。这里改成：
 * 发起时记下当前实例数，下次进 App / 开面板时再比一次数量 → 是成功还是失败一目了然。
 */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {

    static final String PREFS_NAME = "widget_data";
    static final String PREFS_KEY_PAYLOAD = "schedule_payload";
    /** 课表网格小组件的整周数据，与今日/近日的 payload 分开存 */
    static final String PREFS_KEY_GRID = "schedule_grid_payload";
    /** 待确认的一键添加请求：{widget, before, at} */
    static final String PREFS_KEY_PIN_PENDING = "pin_pending";

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

    /** widget 标识 -> 对应 provider 组件（requestPin 与实例计数共用同一套映射） */
    static ComponentName componentOf(Context ctx, String which) {
        if ("recent".equals(which)) return new ComponentName(ctx, RecentWidgetProvider.class);
        if ("grid".equals(which)) return new ComponentName(ctx, ScheduleWidgetProvider.class);
        return new ComponentName(ctx, TodayWidgetProvider.class);
    }

    /** 桌面上该小组件当前的实例数；异常返回 -1，调用方不要把 -1 当成"成功" */
    static int countWidgets(Context ctx, String which) {
        try {
            return AppWidgetManager.getInstance(ctx).getAppWidgetIds(componentOf(ctx, which)).length;
        } catch (Exception e) {
            return -1;
        }
    }

    /**
     * 一键添加到桌面。
     *
     * 注意不要在调用前用 isRequestPinAppWidgetSupported() 把请求拦掉：
     * 部分国产 ROM 会误报 false，但实际能添加。所以先直接尝试调用，
     * 该 API 的返回值只作为诊断信息（apiSupported / reason）一并回传。
     */
    @PluginMethod
    public void requestPin(PluginCall call) {
        String which = call.getString("widget", "today");
        Context ctx = getContext();
        JSObject ret = new JSObject();
        ret.put("widget", which);

        ComponentName cn = componentOf(ctx, which);
        int before = countWidgets(ctx, which);
        ret.put("before", before);

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            ret.put("supported", false);
            ret.put("launched", false);
            ret.put("reason", "android-too-old");
            call.resolve(ret);
            return;
        }

        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        boolean apiSupported = false;
        try {
            apiSupported = mgr.isRequestPinAppWidgetSupported();
        } catch (Exception e) {
            apiSupported = false;
        }
        ret.put("apiSupported", apiSupported);

        boolean launched = false;
        String reason = "ok";
        try {
            launched = mgr.requestPinAppWidget(cn, null, null);
        } catch (Exception e) {
            reason = "exception";
            ret.put("message", String.valueOf(e.getMessage()));
        }
        if (!launched && "ok".equals(reason)) {
            reason = apiSupported ? "request-returned-false" : "launcher-unsupported";
        }

        // 记下待确认请求，回到前台时再数一次实例，才能区分"添加成功"与"静默失败"
        try {
            JSONObject pending = new JSONObject()
                    .put("widget", which)
                    .put("before", before)
                    .put("at", System.currentTimeMillis());
            ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit().putString(PREFS_KEY_PIN_PENDING, pending.toString()).apply();
        } catch (Exception e) {
            // 记录失败不影响本次添加本身
        }

        ret.put("supported", launched || apiSupported);
        ret.put("launched", launched);
        ret.put("reason", reason);
        call.resolve(ret);
    }

    /**
     * 取回上一次一键添加的确认结果（取后即清）。
     * added = 现在的实例数 > 发起前的实例数。未发起过请求时 pending=false。
     */
    @PluginMethod
    public void consumePinResult(PluginCall call) {
        Context ctx = getContext();
        JSObject ret = new JSObject();
        String raw = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(PREFS_KEY_PIN_PENDING, null);
        if (raw == null || raw.isEmpty()) {
            ret.put("pending", false);
            call.resolve(ret);
            return;
        }
        ret.put("pending", true);
        String which = "today";
        int before = -1;
        long at = 0;
        try {
            JSONObject p = new JSONObject(raw);
            which = p.optString("widget", "today");
            before = p.optInt("before", -1);
            at = p.optLong("at", 0);
        } catch (Exception e) {
            // 记录损坏：按"未确认"处理
        }
        int after = countWidgets(ctx, which);
        ret.put("widget", which);
        ret.put("before", before);
        ret.put("after", after);
        // after 为 -1 表示查询异常，此时不下"失败"结论，交给 UI 提示手动添加
        ret.put("added", after > 0 && before >= 0 && after > before);
        ret.put("unknown", after < 0);
        ret.put("elapsedMs", at > 0 ? System.currentTimeMillis() - at : 0);
        ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().remove(PREFS_KEY_PIN_PENDING).apply();
        call.resolve(ret);
    }
}
