package com.workmemo.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 课表网格小组件（4x3，可缩放）：深色卡片 + 星期表头 + 左侧时间列 + 彩色课程块。
 *
 * 设计要点：
 * 1) RemoteViews 无法给圆角色块动态上色（setBackgroundColor 只有直角），
 *    所以由 JS 侧算好 colorIndex 下发，这里映射到预置的圆角 drawable wc_bg_&lt;i&gt;；
 *    View.setBackgroundResource 带 @RemotableViewMethod 注解（已核对 AOSP 源码），
 *    因此 RemoteViews.setInt(id, "setBackgroundResource", res) 是框架允许的调用。
 * 2) RemoteViews 不支持跨行合并单元格，网格按"节次块 x 星期"排布，
 *    课程画在起始节次所属的块上；无课的节次块整行 GONE（LinearLayout 会把 GONE 的
 *    权重排除，剩余行自动均分高度）。
 */
public class ScheduleWidgetProvider extends AppWidgetProvider {

    /** 与 src/schedule-core.js 的 COURSE_COLORS 逐项对应，顺序不可改。
     *  包内共享给 TodayWidgetProvider / RecentWidgetProvider 复用。 */
    static final int[] CELL_BG = {
            R.drawable.wc_bg_0, R.drawable.wc_bg_1, R.drawable.wc_bg_2, R.drawable.wc_bg_3,
            R.drawable.wc_bg_4, R.drawable.wc_bg_5, R.drawable.wc_bg_6, R.drawable.wc_bg_7,
            R.drawable.wc_bg_8, R.drawable.wc_bg_9,
    };

    private static final int MAX_ROWS = 5;
    private static final String[] WEEK_LABELS = { "一", "二", "三", "四", "五", "六", "日" };

    private static final int[] HEAD_IDS = {
            R.id.ws_h0,
            R.id.ws_h1,
            R.id.ws_h2,
            R.id.ws_h3,
            R.id.ws_h4,
            R.id.ws_h5,
            R.id.ws_h6,
    };
    private static final int[] ROW_IDS = {
            R.id.ws_row0,
            R.id.ws_row1,
            R.id.ws_row2,
            R.id.ws_row3,
            R.id.ws_row4,
    };
    private static final int[] TIME_IDS = {
            R.id.ws_t0,
            R.id.ws_t1,
            R.id.ws_t2,
            R.id.ws_t3,
            R.id.ws_t4,
    };

    private static final int[][] WRAP_IDS = {
            { R.id.ws_w00, R.id.ws_w01, R.id.ws_w02, R.id.ws_w03, R.id.ws_w04, R.id.ws_w05, R.id.ws_w06 },
            { R.id.ws_w10, R.id.ws_w11, R.id.ws_w12, R.id.ws_w13, R.id.ws_w14, R.id.ws_w15, R.id.ws_w16 },
            { R.id.ws_w20, R.id.ws_w21, R.id.ws_w22, R.id.ws_w23, R.id.ws_w24, R.id.ws_w25, R.id.ws_w26 },
            { R.id.ws_w30, R.id.ws_w31, R.id.ws_w32, R.id.ws_w33, R.id.ws_w34, R.id.ws_w35, R.id.ws_w36 },
            { R.id.ws_w40, R.id.ws_w41, R.id.ws_w42, R.id.ws_w43, R.id.ws_w44, R.id.ws_w45, R.id.ws_w46 },
    };
    private static final int[][] NAME_IDS = {
            { R.id.ws_n00, R.id.ws_n01, R.id.ws_n02, R.id.ws_n03, R.id.ws_n04, R.id.ws_n05, R.id.ws_n06 },
            { R.id.ws_n10, R.id.ws_n11, R.id.ws_n12, R.id.ws_n13, R.id.ws_n14, R.id.ws_n15, R.id.ws_n16 },
            { R.id.ws_n20, R.id.ws_n21, R.id.ws_n22, R.id.ws_n23, R.id.ws_n24, R.id.ws_n25, R.id.ws_n26 },
            { R.id.ws_n30, R.id.ws_n31, R.id.ws_n32, R.id.ws_n33, R.id.ws_n34, R.id.ws_n35, R.id.ws_n36 },
            { R.id.ws_n40, R.id.ws_n41, R.id.ws_n42, R.id.ws_n43, R.id.ws_n44, R.id.ws_n45, R.id.ws_n46 },
    };
    private static final int[][] ROOM_IDS = {
            { R.id.ws_rm00, R.id.ws_rm01, R.id.ws_rm02, R.id.ws_rm03, R.id.ws_rm04, R.id.ws_rm05, R.id.ws_rm06 },
            { R.id.ws_rm10, R.id.ws_rm11, R.id.ws_rm12, R.id.ws_rm13, R.id.ws_rm14, R.id.ws_rm15, R.id.ws_rm16 },
            { R.id.ws_rm20, R.id.ws_rm21, R.id.ws_rm22, R.id.ws_rm23, R.id.ws_rm24, R.id.ws_rm25, R.id.ws_rm26 },
            { R.id.ws_rm30, R.id.ws_rm31, R.id.ws_rm32, R.id.ws_rm33, R.id.ws_rm34, R.id.ws_rm35, R.id.ws_rm36 },
            { R.id.ws_rm40, R.id.ws_rm41, R.id.ws_rm42, R.id.ws_rm43, R.id.ws_rm44, R.id.ws_rm45, R.id.ws_rm46 },
    };

    public static void pushUpdate(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, ScheduleWidgetProvider.class));
        if (ids.length > 0) new ScheduleWidgetProvider().onUpdate(ctx, mgr, ids);
    }

    /** colorIndex -> 圆角色块 drawable；越界回退 0，避免宿主端抛异常导致整块小组件不刷新 */
    static int colorRes(int colorIndex) {
        if (colorIndex < 0 || colorIndex >= CELL_BG.length) return CELL_BG[0];
        return CELL_BG[colorIndex];
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] appWidgetIds) {
        String raw = context.getSharedPreferences(WidgetBridgePlugin.PREFS_NAME, Context.MODE_PRIVATE)
                .getString(WidgetBridgePlugin.PREFS_KEY_GRID, null);
        RemoteViews views = buildViews(context, raw);
        for (int id : appWidgetIds) mgr.updateAppWidget(id, views);
    }

    static RemoteViews buildViews(Context context, String raw) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_schedule);

        JSONObject payload = null;
        try {
            if (raw != null && !raw.isEmpty()) payload = new JSONObject(raw);
        } catch (Exception e) {
            payload = null; // 数据损坏时退化为空态，不崩
        }

        boolean hasSemester = payload != null && payload.optBoolean("hasSemester");
        String dateLine = payload == null ? "" : payload.optString("dateLabel", "");
        String dowName = payload == null ? "" : payload.optString("dowName", "");
        if (!dowName.isEmpty()) dateLine = dateLine + " " + dowName;
        v.setTextViewText(R.id.ws_date, dateLine.isEmpty() ? "课表" : dateLine);
        v.setTextViewText(R.id.ws_week, payload == null ? "" : payload.optString("weekLabel", ""));

        // ---- 星期表头（今天高亮）----
        JSONArray heads = payload == null ? null : payload.optJSONArray("weekdays");
        for (int d = 0; d < 7; d++) {
            JSONObject h = (heads != null && d < heads.length()) ? heads.optJSONObject(d) : null;
            if (h == null) {
                v.setTextViewText(HEAD_IDS[d], WEEK_LABELS[d]);
                v.setTextColor(HEAD_IDS[d], 0xCCFFFFFF);
                v.setInt(HEAD_IDS[d], "setBackgroundColor", Color.TRANSPARENT);
            } else {
                v.setTextViewText(HEAD_IDS[d], h.optString("label", WEEK_LABELS[d]) + "\n" + h.optInt("dateNum", 0));
                if (h.optBoolean("isToday")) {
                    v.setTextColor(HEAD_IDS[d], 0xFFF5C518);
                    v.setInt(HEAD_IDS[d], "setBackgroundResource", R.drawable.wc_head_today);
                } else {
                    v.setTextColor(HEAD_IDS[d], 0xCCFFFFFF);
                    v.setInt(HEAD_IDS[d], "setBackgroundColor", Color.TRANSPARENT);
                }
            }
        }

        // ---- 课表网格 ----
        JSONArray rows = payload == null ? null : payload.optJSONArray("rows");
        int rowCount = rows == null ? 0 : rows.length();
        for (int r = 0; r < MAX_ROWS; r++) {
            JSONObject row = (r < rowCount) ? rows.optJSONObject(r) : null;
            if (row == null) {
                v.setViewVisibility(ROW_IDS[r], View.GONE);
                continue;
            }
            v.setViewVisibility(ROW_IDS[r], View.VISIBLE);
            v.setTextViewText(TIME_IDS[r], row.optString("time", ""));
            JSONArray cells = row.optJSONArray("cells");
            for (int d = 0; d < 7; d++) {
                JSONObject c = (cells != null && d < cells.length()) ? cells.optJSONObject(d) : null;
                if (c == null) {
                    v.setTextViewText(NAME_IDS[r][d], "");
                    v.setTextViewText(ROOM_IDS[r][d], "");
                    v.setInt(WRAP_IDS[r][d], "setBackgroundResource", R.drawable.wc_bg_empty);
                } else {
                    v.setTextViewText(NAME_IDS[r][d], c.optString("name", ""));
                    v.setTextViewText(ROOM_IDS[r][d], c.optString("room", ""));
                    v.setInt(WRAP_IDS[r][d], "setBackgroundResource", colorRes(c.optInt("colorIndex", 0)));
                }
            }
        }

        // ---- 空态：整块网格让位给一句提示 ----
        if (rowCount == 0) {
            v.setViewVisibility(R.id.ws_empty, View.VISIBLE);
            v.setTextViewText(R.id.ws_empty, hasSemester ? "本周暂无课程" : "打开 App 导入课表");
        } else {
            v.setViewVisibility(R.id.ws_empty, View.GONE);
        }

        Intent it = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (it != null) {
            PendingIntent pi = PendingIntent.getActivity(context, 2003, it,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            v.setOnClickPendingIntent(R.id.ws_root, pi);
        }
        return v;
    }
}
