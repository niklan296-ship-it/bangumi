package app.bangumi;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/**
 * Виджет «Сегодня»: план на день (или то, что смотришь) с кнопками, и ближайшая серия.
 * Данные присылает страница (BangumiNative.widget). Нажатия копятся в «pending»
 * и применяются к списку, когда Бангуми открывается.
 */
public class BangumiWidget extends AppWidgetProvider {

    static final String ACT_TAP = "app.bangumi.WIDGET_TAP";
    static final String ACT_TICK = "app.bangumi.WIDGET_TICK";
    private static final int[] ROW = {R.id.row0, R.id.row1, R.id.row2};
    private static final int[] TTL = {R.id.r0_title, R.id.r1_title, R.id.r2_title};
    private static final int[] SUB = {R.id.r0_sub, R.id.r1_sub, R.id.r2_sub};
    private static final int[] BTN = {R.id.r0_btn, R.id.r1_btn, R.id.r2_btn};

    static void updateAll(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        int[] ids = m.getAppWidgetIds(new ComponentName(ctx, BangumiWidget.class));
        if (ids == null || ids.length == 0) return;
        for (int id : ids) m.updateAppWidget(id, build(ctx));
        scheduleMidnight(ctx);
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, build(ctx));
        scheduleMidnight(ctx);
    }

    @Override
    public void onReceive(Context ctx, Intent in) {
        super.onReceive(ctx, in);
        String a = in.getAction();
        if (ACT_TICK.equals(a)) updateAll(ctx);
        else if (ACT_TAP.equals(a)) tap(ctx, in);
    }

    static String dayKey(Calendar c) {
        return c.get(Calendar.YEAR) + "-" + (c.get(Calendar.MONTH) + 1) + "-" + c.get(Calendar.DAY_OF_MONTH);
    }

    /** Пересобрать виджет в полночь: «сегодня» сменилось. */
    private static void scheduleMidnight(Context ctx) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            Calendar c = Calendar.getInstance();
            c.add(Calendar.DAY_OF_MONTH, 1);
            c.set(Calendar.HOUR_OF_DAY, 0); c.set(Calendar.MINUTE, 1); c.set(Calendar.SECOND, 0);
            Intent it = new Intent(ctx, BangumiWidget.class).setAction(ACT_TICK);
            PendingIntent pi = PendingIntent.getBroadcast(ctx, 7001, it, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            am.set(AlarmManager.RTC, c.getTimeInMillis(), pi);
        } catch (Exception ignored) { }
    }

    private static JSONObject data(Context ctx) {
        try { return new JSONObject(Alarms.prefs(ctx).getString("widget", "{}")); } catch (Exception e) { return new JSONObject(); }
    }

    private static JSONArray pending(SharedPreferences sp) {
        try { return new JSONArray(sp.getString("pending", "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    /** Строки для показа: план на сегодня или, если его нет, то, что смотришь. */
    private static JSONArray rows(JSONObject d, String today, int weekday, boolean[] isPlan) {
        JSONArray plan = d.optJSONArray("plan");
        JSONArray day = plan != null ? plan.optJSONArray(weekday) : null;
        if (day != null && day.length() > 0) { isPlan[0] = true; return day; }
        isPlan[0] = false;
        JSONArray w = d.optJSONArray("watching");
        return w != null ? w : new JSONArray();
    }

    private static int weekdayMon(Calendar c) {
        return (c.get(Calendar.DAY_OF_WEEK) + 5) % 7;
    }

    static RemoteViews build(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget);
        JSONObject d = data(ctx);
        JSONObject lb = d.optJSONObject("labels");
        if (lb == null) lb = new JSONObject();
        SharedPreferences sp = Alarms.prefs(ctx);
        JSONArray pend = pending(sp);
        Calendar now = Calendar.getInstance();
        String today = dayKey(now);
        Locale loc = "en".equals(d.optString("lang")) ? Locale.UK : new Locale("ru");

        boolean[] isPlan = {false};
        JSONArray list = rows(d, today, weekdayMon(now), isPlan);
        v.setTextViewText(R.id.w_title, isPlan[0] ? lb.optString("plan", "Сегодня по плану") : lb.optString("watching", "Смотрю"));
        v.setTextViewText(R.id.w_date, new SimpleDateFormat("EEE, d MMM", loc).format(now.getTime()));

        int shown = 0;
        for (int i = 0; i < ROW.length; i++) {
            JSONObject r = list.optJSONObject(i);
            if (r == null) { v.setViewVisibility(ROW[i], View.GONE); continue; }
            shown++;
            String id = r.optString("id");
            int prog = r.optInt("p");
            boolean done = isPlan[0] && today.equals(d.optString("doneKey")) && r.optBoolean("done");
            for (int k = 0; k < pend.length(); k++) {
                JSONObject o = pend.optJSONObject(k);
                if (o == null || !id.equals(o.optString("id"))) continue;
                if ("plan".equals(o.optString("kind"))) { if (today.equals(o.optString("day"))) { done = true; prog += r.optInt("eps", 1); } }
                else prog += 1;
            }
            int total = r.optInt("total");
            if (total > 0) prog = Math.min(prog, total);
            String sub = r.optString("sub");
            String ep = "EP " + prog + (total > 0 ? "/" + total : "");
            v.setViewVisibility(ROW[i], View.VISIBLE);
            v.setTextViewText(TTL[i], r.optString("t"));
            v.setTextViewText(SUB[i], (done ? "✓ " : "") + ep + (sub.isEmpty() ? "" : " · " + sub));
            boolean full = total > 0 && prog >= total;
            if (isPlan[0]) {
                v.setTextViewText(BTN[i], done ? "✓" : "○");
                v.setInt(BTN[i], "setBackgroundResource", done ? R.drawable.w_btn_done : R.drawable.w_btn);
            } else {
                v.setTextViewText(BTN[i], full ? "✓" : "+1");
                v.setInt(BTN[i], "setBackgroundResource", full ? R.drawable.w_btn_done : R.drawable.w_btn);
            }
            Intent it = new Intent(ctx, BangumiWidget.class).setAction(ACT_TAP)
                    .putExtra("id", id).putExtra("kind", isPlan[0] ? "plan" : "inc").putExtra("day", today)
                    .putExtra("t", r.optString("t"));
            PendingIntent pi = PendingIntent.getBroadcast(ctx, 7100 + i, it, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            v.setOnClickPendingIntent(BTN[i], pi);
        }
        v.setViewVisibility(R.id.w_empty, shown == 0 ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.w_empty, lb.optString("empty", "Сегодня ничего не запланировано"));

        // Ближайшая серия
        String next = "";
        JSONArray nx = d.optJSONArray("next");
        long nowMs = System.currentTimeMillis();
        if (nx != null) {
            for (int i = 0; i < nx.length(); i++) {
                JSONObject o = nx.optJSONObject(i);
                if (o == null || o.optLong("at") <= nowMs) continue;
                Date at = new Date(o.optLong("at"));
                Calendar c = Calendar.getInstance(); c.setTime(at);
                String when = dayKey(c).equals(today)
                        ? lb.optString("today", "сегодня") + " " + new SimpleDateFormat("HH:mm", loc).format(at)
                        : new SimpleDateFormat("EEE HH:mm", loc).format(at);
                next = lb.optString("next", "Дальше") + ": " + o.optString("t") + " · EP " + o.optInt("ep") + " · " + when;
                break;
            }
        }
        v.setViewVisibility(R.id.w_next, next.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.w_next, next);

        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(ctx, 7000, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        return v;
    }

    private static void tap(Context ctx, Intent in) {
        try {
            SharedPreferences sp = Alarms.prefs(ctx);
            JSONArray pend = pending(sp);
            String id = in.getStringExtra("id"), kind = in.getStringExtra("kind"), day = in.getStringExtra("day");
            if (id == null) return;
            JSONObject d = data(ctx);
            JSONObject lb = d.optJSONObject("labels");
            if (lb == null) lb = new JSONObject();
            if ("plan".equals(kind)) {
                // уже отмечено сегодня — второй раз не считаем
                boolean done = day != null && day.equals(d.optString("doneKey")) && isDoneInData(d, id);
                for (int k = 0; k < pend.length(); k++) {
                    JSONObject o = pend.optJSONObject(k);
                    if (o != null && id.equals(o.optString("id")) && "plan".equals(o.optString("kind")) && day != null && day.equals(o.optString("day"))) done = true;
                }
                if (done) return;
            }
            pend.put(new JSONObject().put("id", id).put("kind", kind).put("day", day).put("at", System.currentTimeMillis()));
            sp.edit().putString("pending", pend.toString()).apply();
            Toast.makeText(ctx, in.getStringExtra("t") + " — " + lb.optString("marked", "отмечено"), Toast.LENGTH_SHORT).show();
            updateAll(ctx);
        } catch (Exception ignored) { }
    }

    private static boolean isDoneInData(JSONObject d, String id) {
        JSONArray plan = d.optJSONArray("plan");
        if (plan == null) return false;
        JSONArray day = plan.optJSONArray(weekdayMon(Calendar.getInstance()));
        if (day == null) return false;
        for (int i = 0; i < day.length(); i++) {
            JSONObject r = day.optJSONObject(i);
            if (r != null && id.equals(r.optString("id"))) return r.optBoolean("done");
        }
        return false;
    }
}
