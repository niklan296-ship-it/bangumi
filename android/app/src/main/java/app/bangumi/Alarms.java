package app.bangumi;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/** Напоминания о сериях и плане. Список хранится, чтобы вернуть его после перезагрузки телефона. */
final class Alarms {
    private Alarms() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences("bangumi", Context.MODE_PRIVATE);
    }

    private static PendingIntent intent(Context ctx, int id, Intent it) {
        if (it == null) it = new Intent(ctx, AlarmReceiver.class);
        return PendingIntent.getBroadcast(ctx, id, it, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Заменяет все напоминания новым списком: [{ id, at (мс), title, body }]. */
    static void apply(Context ctx, String json) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            SharedPreferences sp = prefs(ctx);
            for (String s : sp.getString("ids", "").split(",")) {
                if (s.isEmpty()) continue;
                try { am.cancel(intent(ctx, Integer.parseInt(s), null)); } catch (Exception ignored) { }
            }
            JSONArray arr = new JSONArray(json);
            StringBuilder ids = new StringBuilder();
            long now = System.currentTimeMillis();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                long at = o.getLong("at");
                if (at <= now) continue;
                int id = o.getInt("id");
                Intent it = new Intent(ctx, AlarmReceiver.class)
                        .putExtra("id", id)
                        .putExtra("title", o.optString("title", "Бангуми"))
                        .putExtra("body", o.optString("body", ""));
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent(ctx, id, it));
                ids.append(id).append(',');
            }
            sp.edit().putString("ids", ids.toString()).putString("alarms", json).apply();
        } catch (Exception ignored) {
        }
    }

    /** После перезагрузки Android забывает будильники — ставим их заново из сохранённого списка. */
    static void restore(Context ctx) {
        String json = prefs(ctx).getString("alarms", null);
        if (json != null) apply(ctx, json);
    }
}
