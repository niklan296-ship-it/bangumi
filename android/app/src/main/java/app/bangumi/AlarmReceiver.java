package app.bangumi;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Показывает уведомление, когда наступает время, заданное страницей через BangumiNative.schedule. */
public class AlarmReceiver extends BroadcastReceiver {

    static final String CHANNEL = "episodes";

    @Override
    public void onReceive(Context ctx, Intent in) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Серии и план", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Выход новых серий и напоминания о плане на день");
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(ctx, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        String title = in.getStringExtra("title");
        String body = in.getStringExtra("body");
        Notification n = new Notification.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_notif)
                .setColor(0xFFFFB81C)
                .setContentTitle(title == null ? "Бангуми" : title)
                .setContentText(body == null ? "" : body)
                .setStyle(new Notification.BigTextStyle().bigText(body == null ? "" : body))
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build();
        nm.notify(in.getIntExtra("id", 1), n);
    }
}
