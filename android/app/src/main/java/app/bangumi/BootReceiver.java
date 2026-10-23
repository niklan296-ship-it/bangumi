package app.bangumi;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Телефон перезагрузился или приложение обновилось: возвращаем напоминания и обновляем виджет. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        Alarms.restore(ctx);
        BangumiWidget.updateAll(ctx);
    }
}
