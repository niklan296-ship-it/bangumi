package app.bangumi;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.util.Base64;
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
        if (web != null) {
            web.onResume();
            // страница забирает отметки с виджета и обновляет данные
            web.evaluateJavascript("window.__nativeResume && window.__nativeResume()", null);
        }
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
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
            Alarms.apply(MainActivity.this, json);
        }

        /** Данные для виджета на рабочем столе. */
        @JavascriptInterface
        public void widget(String json) {
            Alarms.prefs(MainActivity.this).edit().putString("widget", json).apply();
            BangumiWidget.updateAll(MainActivity.this);
        }

        /** Отметки, сделанные на виджете, пока приложение было закрыто. Забираем и очищаем. */
        @JavascriptInterface
        public String takePending() {
            SharedPreferences sp = Alarms.prefs(MainActivity.this);
            String p = sp.getString("pending", "[]");
            sp.edit().putString("pending", "[]").apply();
            return p;
        }

        /**
         * Автокопия: файл bangumi-auto-ГГГГ-ММ-ДД.json в «Загрузки/Bangumi».
         * Оставляем 4 последние автокопии, ручные копии не трогаем.
         */
        @JavascriptInterface
        public String autoBackup(String name, String content) {
            String where = saveFile(name, content);
            if (where.isEmpty() || Build.VERSION.SDK_INT < 29) return where;
            try {
                Uri col = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                String[] proj = {MediaStore.MediaColumns._ID};
                try (Cursor c = getContentResolver().query(col, proj,
                        MediaStore.MediaColumns.DISPLAY_NAME + " LIKE ?", new String[]{"bangumi-auto-%"},
                        MediaStore.MediaColumns.DATE_ADDED + " DESC")) {
                    int n = 0;
                    while (c != null && c.moveToNext()) {
                        if (++n <= 4) continue;
                        getContentResolver().delete(ContentUris.withAppendedId(col, c.getLong(0)), null, null);
                    }
                }
            } catch (Exception ignored) {
            }
            return where;
        }

        private Uri writeImage(String base64, String name) throws Exception {
            byte[] png = Base64.decode(base64, Base64.DEFAULT);
            if (Build.VERSION.SDK_INT < 29) return null;
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, "image/png");
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Bangumi");
            Uri uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
            if (uri == null) return null;
            try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                if (os == null) return null;
                os.write(png);
            }
            return uri;
        }

        /**
         * Запрос в сеть без ограничений браузера (CORS): страница так находит прямую ссылку на тайтл
         * и проверяет, живы ли ссылки. Ответ приходит в window.__nativeHttp(id, status, body).
         */
        @JavascriptInterface
        public void http(final String method, final String url, final String cbId) {
            new Thread(() -> {
                int status = 0;
                String body = "";
                java.net.HttpURLConnection c = null;
                try {
                    c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                    c.setRequestMethod("HEAD".equals(method) ? "HEAD" : "GET");
                    c.setInstanceFollowRedirects(true);
                    c.setConnectTimeout(7000);
                    c.setReadTimeout(9000);
                    c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36");
                    c.setRequestProperty("Accept-Language", "ru,en;q=0.8");
                    status = c.getResponseCode();
                    if (!"HEAD".equals(method)) {
                        java.io.InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
                        if (in != null) {
                            java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
                            byte[] buf = new byte[16384];
                            int n, total = 0;
                            while ((n = in.read(buf)) > 0 && total < 1500000) { bo.write(buf, 0, n); total += n; }
                            in.close();
                            body = bo.toString("UTF-8");
                        }
                    }
                    String finalUrl = c.getURL().toString();
                    if (!finalUrl.equals(url)) body = "<!--final:" + finalUrl + "-->" + body;
                } catch (Exception e) {
                    status = 0;
                } finally {
                    if (c != null) c.disconnect();
                }
                final String js = "window.__nativeHttp && window.__nativeHttp(" + org.json.JSONObject.quote(cbId) + "," + status + "," + org.json.JSONObject.quote(body) + ")";
                runOnUiThread(() -> { if (web != null) web.evaluateJavascript(js, null); });
            }).start();
        }

        /** Открыть ссылку в браузере или приложении. */
        @JavascriptInterface
        public void openUrl(String url) {
            try {
                Uri u = Uri.parse(url);
                Intent it = "intent".equals(u.getScheme()) ? Intent.parseUri(url, Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, u);
                it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(it);
            } catch (Exception ignored) {
            }
        }

        /** Картинка в «Картинки/Bangumi» (видна в галерее). */
        @JavascriptInterface
        public boolean saveImage(String base64, String name) {
            try { return writeImage(base64, name) != null; } catch (Exception e) { return false; }
        }

        /** Картинка «Итогов года»: кладём в «Картинки/Bangumi» и открываем меню «Поделиться». */
        @JavascriptInterface
        public boolean shareImage(String base64, String name, String text) {
            try {
                Uri uri = writeImage(base64, name);
                if (uri == null) return false;
                Intent send = new Intent(Intent.ACTION_SEND).setType("image/png")
                        .putExtra(Intent.EXTRA_STREAM, uri)
                        .putExtra(Intent.EXTRA_TEXT, text)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> startActivity(Intent.createChooser(send, null)));
                return true;
            } catch (Exception e) {
                return false;
            }
        }
    }
}
