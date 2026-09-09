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

/** 近日课程小组件（4x2）：今天/明天/后天 三列，每天最多3节课 */
public class RecentWidgetProvider extends AppWidgetProvider {

    private static final int[] DAY_DATES = { R.id.wr_d1_date, R.id.wr_d2_date, R.id.wr_d3_date };
    private static final int[][] DAY_SLOTS = {
            { R.id.wr_d1_c1, R.id.wr_d1_c2, R.id.wr_d1_c3 },
            { R.id.wr_d2_c1, R.id.wr_d2_c2, R.id.wr_d2_c3 },
            { R.id.wr_d3_c1, R.id.wr_d3_c2, R.id.wr_d3_c3 }
    };

    public static void pushUpdate(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, RecentWidgetProvider.class));
        if (ids.length > 0) new RecentWidgetProvider().onUpdate(ctx, mgr, ids);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] appWidgetIds) {
        String raw = context.getSharedPreferences(WidgetBridgePlugin.PREFS_NAME, Context.MODE_PRIVATE)
                .getString(WidgetBridgePlugin.PREFS_KEY_PAYLOAD, null);
        RemoteViews views = buildViews(context, raw);
        for (int id : appWidgetIds) mgr.updateAppWidget(id, views);
    }

    static RemoteViews buildViews(Context context, String raw) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_recent);
        v.setTextViewText(R.id.wr_title, "近日课程");
        try {
            if (raw != null) {
                JSONObject p = new JSONObject(raw);
                if (p.optBoolean("hasSemester")) {
                    v.setTextViewText(R.id.wr_title,
                            "第 " + p.optInt("weekNum", 0) + " 周 · 近日课程");
                }
            }
        } catch (Exception e) {
            // 保持默认标题
        }
        JSONArray recent = null;
        try {
            if (raw != null) recent = new JSONObject(raw).optJSONArray("recent");
        } catch (Exception e) {
            recent = null;
        }
        for (int d = 0; d < 3; d++) {
            String dateText = "";
            v.setViewVisibility(DAY_DATES[d], View.VISIBLE);
            // 清空槽位
            for (int s = 0; s < 3; s++) v.setViewVisibility(DAY_SLOTS[d][s], View.GONE);
            if (recent != null && d < recent.length()) {
                JSONObject day = recent.optJSONObject(d);
                if (day != null) {
                    String iso = day.optString("date", "");
                    String[] ymd = iso.split("-");
                    dateText = (ymd.length >= 3 ? (Integer.parseInt(ymd[1]) + "." + Integer.parseInt(ymd[2])) : iso);
                    JSONArray cs = day.optJSONArray("courses");
                    int total = day.optInt("total", 0);
                    if (cs != null) {
                        for (int s = 0; s < 3 && s < cs.length(); s++) {
                            JSONObject c = cs.optJSONObject(s);
                            if (c == null) continue;
                            String room = c.optString("room", "");
                            String text = c.optString("name", "")
                                    + (room.isEmpty() ? "" : " · " + room)
                                    + "\n" + c.optString("start", "");
                            v.setTextViewText(DAY_SLOTS[d][s], text);
                            v.setViewVisibility(DAY_SLOTS[d][s], View.VISIBLE);
                        }
                    }
                    if (total == 0) {
                        v.setTextViewText(DAY_SLOTS[d][0], "无课");
                        v.setViewVisibility(DAY_SLOTS[d][0], View.VISIBLE);
                    }
                }
            }
            v.setTextViewText(DAY_DATES[d], dateText);
        }
        Intent it = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (it != null) {
            PendingIntent pi = PendingIntent.getActivity(context, 2002, it,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            v.setOnClickPendingIntent(R.id.wr_root, pi);
        }
        return v;
    }
}
