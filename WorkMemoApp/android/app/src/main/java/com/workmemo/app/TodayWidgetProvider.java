package com.workmemo.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/** 今日课程小组件（2x2）：日期 + 课程列表 + 今日共N门 */
public class TodayWidgetProvider extends AppWidgetProvider {

    public static void pushUpdate(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, TodayWidgetProvider.class));
        if (ids.length > 0) new TodayWidgetProvider().onUpdate(ctx, mgr, ids);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] appWidgetIds) {
        String raw = context.getSharedPreferences(WidgetBridgePlugin.PREFS_NAME, Context.MODE_PRIVATE)
                .getString(WidgetBridgePlugin.PREFS_KEY_PAYLOAD, null);
        RemoteViews views = buildViews(context, raw);
        for (int id : appWidgetIds) mgr.updateAppWidget(id, views);
    }

    static RemoteViews buildViews(Context context, String raw) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_today);
        String dateLine = "今日课程";
        String footer = "打开 App 同步课表";
        int[] slots = { R.id.wt_c1, R.id.wt_c2, R.id.wt_c3 };
        try {
            if (raw != null) {
                JSONObject p = new JSONObject(raw);
                if (p.optBoolean("hasSemester")) {
                    dateLine = p.optString("date", "").replace('-', '.')
                            + " " + p.optString("dowName", "");
                    JSONObject today = p.getJSONObject("today");
                    JSONArray cs = today.getJSONArray("courses");
                    for (int i = 0; i < slots.length; i++) {
                        if (i < cs.length()) {
                            JSONObject c = cs.getJSONObject(i);
                            String room = c.optString("room", "");
                            String start = c.optString("start", "");
                            String end = c.optString("end", "");
                            String text = c.optString("name", "")
                                    + (room.isEmpty() ? "" : " · " + room)
                                    + "\n" + start
                                    + (end.isEmpty() ? "" : " - " + end);
                            v.setTextViewText(slots[i], text);
                            // 彩色圆角块：colorIndex 由 JS 侧算好并下发
                            v.setInt(slots[i], "setBackgroundResource",
                                    ScheduleWidgetProvider.colorRes(c.optInt("colorIndex", 0)));
                            v.setViewVisibility(slots[i], View.VISIBLE);
                        } else {
                            v.setViewVisibility(slots[i], View.GONE);
                        }
                    }
                    int total = today.optInt("total", cs.length());
                    footer = total > 0 ? "今日共 " + total + " 门" : "今天没有课";
                } else {
                    footer = "打开 App 创建学期";
                }
            }
        } catch (Exception e) {
            // 数据异常时保持占位文案
        }
        v.setTextViewText(R.id.wt_date, dateLine);
        v.setTextViewText(R.id.wt_footer, footer);
        Intent it = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (it != null) {
            PendingIntent pi = PendingIntent.getActivity(context, 2001, it,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            v.setOnClickPendingIntent(R.id.wt_root, pi);
        }
        return v;
    }
}
