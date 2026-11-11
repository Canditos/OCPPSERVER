package com.gatoescondido.runner;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class RunnerService extends Service {
    private static final String TAG = "RunnerService";
    private static final String CHANNEL_ID = "ns_runner_workout_channel";
    private static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_STOP = "STOP";
    public static final String EXTRA_INTERVAL = "intervalMinutes";
    public static final String EXTRA_LANG = "language";
    public static final String EXTRA_API_BASE = "apiBase";
    public static final String EXTRA_TARGET_MIN = "targetMin";
    public static final String EXTRA_TARGET_MAX = "targetMax";

    private static volatile RunnerService activeInstance = null;
    private static volatile boolean isServiceRunning = false;
    private PowerManager.WakeLock wakeLock = null;
    private ScheduledExecutorService scheduler = null;

    private int intervalMinutes = 2;
    private String language = "pt-PT";
    private String apiBase = "https://runner.gatoescondido.com";
    private int targetMin = 110;
    private int targetMax = 170;

    private int lastSgv = -1;
    private int announcementCount = 0;

    public static boolean isRunning() {
        return isServiceRunning;
    }

    public static void stopServiceDirect(Context context) {
        try {
            Log.d(TAG, "stopServiceDirect called");
            isServiceRunning = false;

            // 1. Direct synchronous stop if running in same process
            RunnerService instance = activeInstance;
            if (instance != null) {
                Log.d(TAG, "Stopping activeInstance directly");
                instance.stopForegroundService(false);
                activeInstance = null;
            }

            // 2. Deliver ACTION_STOP to onStartCommand
            if (context != null) {
                Intent stopIntent = new Intent(context, RunnerService.class);
                stopIntent.setAction(ACTION_STOP);
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(stopIntent);
                    } else {
                        context.startService(stopIntent);
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Failed sending startService with ACTION_STOP", e);
                }

                try {
                    context.stopService(stopIntent);
                } catch (Exception e) {
                    Log.w(TAG, "Failed context.stopService", e);
                }

                try {
                    NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null) {
                        nm.cancel(NOTIFICATION_ID);
                    }
                } catch (Exception ignored) {}
            }

            AudioEngine.cleanup();
        } catch (Exception e) {
            Log.e(TAG, "stopServiceDirect error", e);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        activeInstance = this;
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            Log.d(TAG, "onStartCommand with null intent - stopping service");
            stopForegroundService(false);
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        if (ACTION_STOP.equals(action)) {
            Log.d(TAG, "Stopping RunnerService via STOP action");
            stopForegroundService(true);
            return START_NOT_STICKY;
        }

        intervalMinutes = intent.getIntExtra(EXTRA_INTERVAL, 2);
        if (intervalMinutes < 1) intervalMinutes = 1;
        String lang = intent.getStringExtra(EXTRA_LANG);
        if (lang != null && !lang.isEmpty()) language = lang;
        String base = intent.getStringExtra(EXTRA_API_BASE);
        if (base != null && !base.isEmpty()) apiBase = base;
        targetMin = intent.getIntExtra(EXTRA_TARGET_MIN, 110);
        targetMax = intent.getIntExtra(EXTRA_TARGET_MAX, 170);

        Log.d(TAG, "Starting RunnerService in foreground with interval=" + intervalMinutes + "m, lang=" + language);
        startWorkoutForeground();
        return START_NOT_STICKY;
    }

    private void startWorkoutForeground() {
        if (isServiceRunning) return;
        isServiceRunning = true;
        announcementCount = 0;

        // 1. Acquire Partial WakeLock so CPU never sleeps while phone is locked in pocket
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && wakeLock == null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NightscoutRunner:WorkoutWakeLock");
                wakeLock.acquire();
                Log.d(TAG, "Partial WakeLock acquired successfully");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to acquire wake lock", e);
        }

        // 2. Start Foreground with initial notification (mediaPlayback type for audio runner)
        Notification notification = buildNotification(
                language.equals("en") ? "🏃 Nightscout Runner" : "🏃 Treino Ativo — NS Runner",
                language.equals("en") ? "Connecting to Nightscout..." : "A ligar ao Nightscout..."
        );

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            Log.d(TAG, "startForeground succeeded with type mediaPlayback");
        } catch (Exception e) {
            Log.e(TAG, "startForeground error", e);
            try {
                startForeground(NOTIFICATION_ID, notification);
            } catch (Exception e2) {
                Log.e(TAG, "Fallback startForeground failed", e2);
            }
        }

        // 3. Start recurring background timer in Java (immune to WebView sleep!)
        scheduler = Executors.newSingleThreadScheduledExecutor();
        scheduler.scheduleAtFixedRate(this::pollAndAnnounce, 2, intervalMinutes * 60L, TimeUnit.SECONDS);
    }

    private void pollAndAnnounce() {
        try {
            Log.d(TAG, "pollAndAnnounce triggered");
            String entriesUrl = apiBase + "/api/entries";
            String jsonStr = httpGet(entriesUrl);

            if (jsonStr == null || jsonStr.isEmpty()) {
                Log.w(TAG, "Empty response from " + entriesUrl);
                return;
            }

            JSONArray arr = new JSONArray(jsonStr);
            if (arr.length() == 0) return;

            JSONObject current = arr.getJSONObject(0);
            int sgv = current.getInt("sgv");
            String direction = current.optString("direction", "Flat");
            Integer delta = null;

            if (arr.length() > 1) {
                JSONObject prev = arr.getJSONObject(1);
                if (prev.has("sgv")) {
                    delta = sgv - prev.getInt("sgv");
                }
            } else if (lastSgv > 0) {
                delta = sgv - lastSgv;
            }

            lastSgv = sgv;
            announcementCount++;

            // Evaluate carb advice
            CarbAdvice advice = evaluateAdvice(sgv, direction, delta, language, targetMin, targetMax);

            // Update Notification on Lock Screen
            String title = "🏃 " + sgv + " mg/dL " + advice.symbol + " (" + advice.trendLabel + ")";
            String content = advice.dose + " · " + advice.title;
            updateNotification(title, content);

            // Play voice via AudioEngine (routes to Bluetooth and ducks music!)
            String cleanText = advice.spokenText.replaceAll("[⇈↑↗→↘↓⇊—?]", "").trim();
            String ttsUrl = apiBase + "/api/tts?text=" + URLEncoder.encode(cleanText, "UTF-8") + "&lang=" + URLEncoder.encode(language, "UTF-8");
            AudioEngine.playVoice(getApplicationContext(), ttsUrl, null);

            // Notify UI if app is open or unlocked
            JSONObject readingEvent = new JSONObject();
            readingEvent.put("sgv", sgv);
            readingEvent.put("direction", direction);
            readingEvent.put("delta", delta != null ? delta : JSONObject.NULL);
            readingEvent.put("adviceTitle", advice.title);
            readingEvent.put("adviceCarbs", advice.dose);
            readingEvent.put("announcementCount", announcementCount);
            MainActivity.notifyReading(readingEvent);

        } catch (Exception e) {
            Log.e(TAG, "Error in pollAndAnnounce", e);
        }
    }

    private Notification buildNotification(String title, String content) {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setAction(Intent.ACTION_MAIN);
        notificationIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        notificationIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pOpen = PendingIntent.getActivity(this, 0, notificationIntent, pendingFlags);

        Intent stopIntent = new Intent(this, RunnerService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent pStop = PendingIntent.getService(this, 1, stopIntent, pendingFlags);

        String stopLabel = language.equals("en") ? "Stop Workout" : "Parar Treino";

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(content)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(pOpen)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .addAction(android.R.drawable.ic_media_pause, stopLabel, pStop)
                .build();
    }

    private void updateNotification(String title, String content) {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(NOTIFICATION_ID, buildNotification(title, content));
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to update notification", e);
        }
    }

    public void stopForegroundService(boolean notifyWeb) {
        Log.d(TAG, "stopForegroundService called, notifyWeb=" + notifyWeb);
        isServiceRunning = false;
        if (scheduler != null) {
            try {
                scheduler.shutdownNow();
            } catch (Exception ignored) {}
            scheduler = null;
        }

        AudioEngine.cleanup();

        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
                Log.d(TAG, "Partial WakeLock released successfully");
            } catch (Exception ignored) {}
            wakeLock = null;
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
        } catch (Exception ignored) {}

        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(NOTIFICATION_ID);
            }
        } catch (Exception ignored) {}

        stopSelf();

        if (notifyWeb) {
            MainActivity.notifyWorkoutStopped();
        }
    }

    private String httpGet(String urlStr) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Accept", "application/json");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            int code = conn.getResponseCode();
            if (code == 200) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
                reader.close();
                return sb.toString();
            }
        } catch (Exception e) {
            Log.e(TAG, "httpGet failed for " + urlStr, e);
        } finally {
            if (conn != null) conn.disconnect();
        }
        return null;
    }

    @Override
    public void onDestroy() {
        stopForegroundService(false);
        if (activeInstance == this) {
            activeInstance = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Nightscout Runner Workout",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Mantém a leitura de glicémia e recomendações ativas durante o treino com ecrã desligado");
            channel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    // Advice Data Structure & Decision Engine
    private static class CarbAdvice {
        String symbol;
        String trendLabel;
        String dose;
        String title;
        String spokenText;
    }

    private static CarbAdvice evaluateAdvice(int sgv, String direction, Integer delta, String lang, int targetMin, int targetMax) {
        CarbAdvice a = new CarbAdvice();
        boolean isEn = "en".equals(lang);

        boolean isDroppingFast = "SingleDown".equals(direction) || "DoubleDown".equals(direction) || (delta != null && delta <= -6);
        boolean isDroppingSlow = "FortyFiveDown".equals(direction) || (delta != null && delta <= -3 && delta > -6);

        // Direction mapping
        if ("DoubleUp".equals(direction)) {
            a.symbol = "⇈";
            a.trendLabel = isEn ? "Rising sharply" : "A subir vertiginosamente";
        } else if ("SingleUp".equals(direction)) {
            a.symbol = "↑";
            a.trendLabel = isEn ? "Rising fast" : "A subir rápido";
        } else if ("FortyFiveUp".equals(direction)) {
            a.symbol = "↗";
            a.trendLabel = isEn ? "Rising slightly" : "A subir ligeiramente";
        } else if ("FortyFiveDown".equals(direction)) {
            a.symbol = "↘";
            a.trendLabel = isEn ? "Slowly falling" : "A descer suavemente";
        } else if ("SingleDown".equals(direction)) {
            a.symbol = "↓";
            a.trendLabel = isEn ? "Falling fast" : "A descer rápido";
        } else if ("DoubleDown".equals(direction)) {
            a.symbol = "⇊";
            a.trendLabel = isEn ? "Dropping sharply" : "A cair a pique";
        } else {
            a.symbol = "→";
            a.trendLabel = isEn ? "Steady" : "Estável";
        }

        if (sgv < 75) {
            a.dose = isEn ? "15-20g FAST CARBS" : "15g a 20g HC RÁPIDOS";
            a.title = isEn ? "URGENT: Hypo Risk! Walk or stop" : "URGENTE: Risco de hipo! Caminha ou pára";
            a.spokenText = isEn
                    ? "Warning. Urgent hypo risk. Blood glucose is " + sgv + ". Stop running and take 15 to 20 grams of fast-acting carbs immediately."
                    : "Atenção. Risco urgente de hipoglicémia. Glicémia a " + sgv + ". Pára a corrida e ingere já 15 a 20 gramas de hidratos de absorção rápida.";
        } else if (sgv < 95) {
            if (isDroppingFast) {
                a.dose = isEn ? "15g fast carbs" : "15g HC rápidos";
                a.title = isEn ? "Warning: Fast drop! Take 15g carbs" : "Alerta: Queda rápida! Toma 15g HC";
                a.spokenText = isEn
                        ? "Warning. Blood glucose at " + sgv + ", " + a.trendLabel + ". Take 15 grams of fast carbs immediately."
                        : "Atenção. Glicémia a " + sgv + ", " + a.trendLabel + ". Ingere de imediato 15 gramas de hidratos rápidos.";
            } else {
                a.dose = isEn ? "10-15g carbs" : "10g a 15g HC";
                a.title = isEn ? "Borderline low: Take 10-15g carbs" : "Valor baixo no limite: Toma 10 a 15g HC";
                a.spokenText = isEn
                        ? "Blood glucose at " + sgv + ", borderline low. Take 10 to 15 grams of carbs."
                        : "Glicémia a " + sgv + ", valor no limite. Toma 10 a 15 gramas de hidratos para manter energia.";
            }
        } else if (sgv < 120) {
            if (isDroppingFast) {
                a.dose = isEn ? "15g carbs" : "15g HC";
                a.title = isEn ? "Rapid drop: Take 15g carbs" : "Queda rápida: Toma 15g HC";
                a.spokenText = isEn
                        ? "Blood glucose at " + sgv + ", " + a.trendLabel + ". Take 15 grams of carbs to stop the drop."
                        : "Glicémia a " + sgv + ", " + a.trendLabel + ". Toma 15 gramas de hidratos para travar a descida.";
            } else if (isDroppingSlow) {
                a.dose = isEn ? "10g carbs" : "10g HC ou meio gel";
                a.title = isEn ? "Slow drop: Take 10g carbs" : "Descida suave: Toma 10g HC ou meio gel";
                a.spokenText = isEn
                        ? "Blood glucose at " + sgv + ", " + a.trendLabel + ". Suggesting 10 grams of carbs or half a gel."
                        : "Glicémia a " + sgv + ", " + a.trendLabel + ". Sugestão de 10 gramas de hidratos ou meio gel energético.";
            } else {
                a.dose = isEn ? "5-10g carbs (optional)" : "5g a 10g HC (opcional)";
                a.title = isEn ? "Steady: Keep your pace" : "Estável: Mantém o ritmo";
                a.spokenText = isEn
                        ? "Blood glucose at " + sgv + ", steady. Acceptable level. If your run is long, you can take 5 to 10 grams of carbs."
                        : "Glicémia a " + sgv + ", estável. Valor aceitável. Se o treino for longo, podes ingerir 5 a 10 gramas de hidratos.";
            }
        } else if (sgv <= targetMax) {
            if (isDroppingFast) {
                a.dose = isEn ? "10g preventive carbs" : "10g HC preventivos";
                a.title = isEn ? "Good glucose but dropping fast" : "Boa glicémia mas a descer rápido";
                a.spokenText = isEn
                        ? "Blood glucose at " + sgv + ", but dropping fast. Take 10 grams of preventive carbs."
                        : "Glicémia a " + sgv + ", mas a descer rápido. Toma 10 gramas de hidratos preventivos.";
            } else {
                a.dose = isEn ? "No carbs needed" : "Sem hidratos";
                a.title = isEn ? "Target zone: Perfect" : "Zona alvo: Excelente";
                a.spokenText = isEn
                        ? "Blood glucose at " + sgv + ", " + a.trendLabel + ". Target zone for running, no carbs needed."
                        : "Glicémia a " + sgv + ", " + a.trendLabel + ". Zona ideal de corrida, não precisas de hidratos.";
            }
        } else if (sgv <= 230) {
            a.dose = isEn ? "No carbs + Water" : "Sem hidratos + Água";
            a.title = isEn ? "Elevated: Drink water" : "Elevada: Bebe água";
            a.spokenText = isEn
                    ? "Blood glucose elevated at " + sgv + ", " + a.trendLabel + ". Drink water, no carbs needed."
                    : "Glicémia elevada a " + sgv + ", " + a.trendLabel + ". Bebe água, não precisas de hidratos.";
        } else {
            a.dose = isEn ? "No carbs + Hydration" : "Sem hidratos + Hidratação";
            a.title = isEn ? "Very high: Ease pace and hydrate" : "Muito alta: Modera o ritmo e hidrata-te";
            a.spokenText = isEn
                    ? "Warning: Blood glucose very high at " + sgv + ". Ease your pace, drink water and avoid carbs."
                    : "Atenção: Glicémia muito alta a " + sgv + ". Modera o ritmo da corrida, bebe água e evita hidratos.";
        }

        return a;
    }
}
