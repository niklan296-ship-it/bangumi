package app.bangumi;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Бангуми как отдельное приложение: своё окно с WebView, без Chrome.
 * Само приложение грузится с GitHub Pages, поэтому обновления приходят без переустановки,
 * а service worker даёт работу без интернета. Мост BangumiNative даёт странице то,
 * чего нет у сайта: точные уведомления, сохранение файла в «Загрузки», цвет системных панелей.
 */
public class MainActivity extends Activity {

    static final String HOST = "niklan296-ship-it.github.io";
    static final String BASE = "https://niklan296-ship-it.github.io/bangumi/index.html";
    private static final int REQ_FILE = 41;
    private static final int REQ_NOTIF = 42;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private boolean clearHistoryOnLoad = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0B0B12"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " BangumiApp/1");

        web.addJavascriptInterface(new Bridge(), "BangumiNative");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost()) || "file".equals(u.getScheme())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) view.loadUrl("file:///android_asset/offline.html");
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (clearHistoryOnLoad) {
                    clearHistoryOnLoad = false;
                    view.clearHistory();
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        String start = intentUrl(getIntent());
        if (start != null) clearHistoryOnLoad = true;
        web.loadUrl(start != null ? start : BASE);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String url = intentUrl(intent);
        if (url != null) {
            clearHistoryOnLoad = true;
            web.loadUrl(url);
        }
    }

    /**
     * «Поделиться» из другого приложения — открываем Бангуми с текстом и ссылкой в адресе.
     * Ярлык «Быстро в расписание» — открываем панель плана.
     */
    private String intentUrl(Intent intent) {
        if (intent == null) return null;
        if ("app.bangumi.QUICK".equals(intent.getAction())) return BASE + "?quick=1";
        if (!Intent.ACTION_SEND.equals(intent.getAction())) return null;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (text == null && subject == null) return null;
        return Uri.parse(BASE).buildUpon()
                .appendQueryParameter("share_title", subject == null ? "" : subject)
                .appendQueryParameter("share_text", text == null ? "" : text)
                .build().toString();
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    private PendingIntent alarmIntent(int id, Intent intent) {
        if (intent == null) intent = new Intent(this, AlarmReceiver.class);
        return PendingIntent.getBroadcast(this, id, intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** То, что страница может попросить у приложения. Методы вызываются из JavaScript. */
    class Bridge {

        @JavascriptInterface
        public String version() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }

        /** Цвет строки состояния и нижней панели под текущий интерфейс. */
        @JavascriptInterface
        public void setBars(final String color, final boolean lightBackground) {
            runOnUiThread(() -> {
                try {
                    int c = Color.parseColor(color);
                    Window w = getWindow();
                    w.setStatusBarColor(c);
                    w.setNavigationBarColor(c);
                    web.setBackgroundColor(c);
                    View d = w.getDecorView();
                    int flags = d.getSystemUiVisibility();
                    int light = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    d.setSystemUiVisibility(lightBackground ? (flags | light) : (flags & ~light));
                } catch (Exception ignored) {
                }
            });
        }

        @JavascriptInterface
        public void vibrate(String pattern) {
            try {
                Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (v == null || !v.hasVibrator()) return;
                JSONArray arr = pattern.trim().startsWith("[") ? new JSONArray(pattern) : new JSONArray("[" + pattern + "]");
                if (arr.length() == 1) {
                    v.vibrate(VibrationEffect.createOneShot(Math.max(1, arr.getLong(0)), VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    long[] t = new long[arr.length() + 1];
                    t[0] = 0;
                    for (int i = 0; i < arr.length(); i++) t[i + 1] = arr.getLong(i);
                    v.vibrate(VibrationEffect.createWaveform(t, -1));
                }
            } catch (Exception ignored) {
            }
        }

        /** Резервная копия: файл в «Загрузки/Bangumi». Возвращает, куда сохранили, или пустую строку. */
        @JavascriptInterface
        public String saveFile(String name, String content) {
            try {
                byte[] data = content.getBytes(StandardCharsets.UTF_8);
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Bangumi");
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) return "";
                    try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                        if (os == null) return "";
                        os.write(data);
                    }
                    return "Загрузки/Bangumi/" + name;
                } else {
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null) return "";
                    File f = new File(dir, name);
                    try (FileOutputStream fo = new FileOutputStream(f)) {
                        fo.write(data);
                    }
                    return f.getAbsolutePath();
                }
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public boolean notifEnabled() {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            boolean on = nm != null && nm.areNotificationsEnabled();
            if (Build.VERSION.SDK_INT >= 33) {
                on = on && checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED;
            }
            return on;
        }

        @JavascriptInterface
        public void requestNotifications() {
            if (Build.VERSION.SDK_INT >= 33) {
                runOnUiThread(() -> requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIF));
            }
        }

        /**
         * Заменяет все запланированные уведомления новым списком.
         * JSON: [{ "id": 1, "at": миллисекунды, "title": "...", "body": "..." }]
         */
        @JavascriptInterface
        public void schedule(String json) {
            try {
                AlarmManager am = (AlarmManager) getSystemService(ALARM_SERVICE);
                if (am == null) return;
                SharedPreferences sp = getSharedPreferences("bangumi", MODE_PRIVATE);
                for (String s : sp.getString("ids", "").split(",")) {
                    if (s.isEmpty()) continue;
                    am.cancel(alarmIntent(Integer.parseInt(s), null));
                }
                JSONArray arr = new JSONArray(json);
                StringBuilder ids = new StringBuilder();
                long now = System.currentTimeMillis();
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject o = arr.getJSONObject(i);
                    long at = o.getLong("at");
                    if (at <= now) continue;
                    int id = o.getInt("id");
                    Intent it = new Intent(MainActivity.this, AlarmReceiver.class)
                            .putExtra("id", id)
                            .putExtra("title", o.optString("title", "Бангуми"))
                            .putExtra("body", o.optString("body", ""));
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, alarmIntent(id, it));
                    ids.append(id).append(',');
                }
                sp.edit().putString("ids", ids.toString()).apply();
            } catch (Exception ignored) {
            }
        }
    }
}
