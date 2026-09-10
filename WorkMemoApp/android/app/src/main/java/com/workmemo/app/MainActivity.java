package com.workmemo.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 必须在 super.onCreate 之前注册：super.onCreate 内部会执行 load()
        // 创建 bridge 并加载 WebView，之后再加进 builder 就来不及了。
        registerPlugin(WidgetBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        // 自愈：每次回到 App 都让三款小组件重读 SharedPreferences 刷新，
        // 防止某次同步时序遗漏导致小组件停留在占位文案。
        try {
            TodayWidgetProvider.pushUpdate(this);
            RecentWidgetProvider.pushUpdate(this);
            ScheduleWidgetProvider.pushUpdate(this);
        } catch (Exception e) {
            // 小组件未添加时 getAppWidgetIds 为空数组，不会异常；兜底忽略
        }
    }
}
