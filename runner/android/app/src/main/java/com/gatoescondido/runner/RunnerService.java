package com.gatoescondido.runner;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
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

@SuppressLint("MissingPermission")
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
    public static final String EXTRA_TELL_HR = "tellHeartRate";
    public static final String EXTRA_MAX_HR = "maxHr";

    private static volatile RunnerService activeInstance = null;
    private static volatile boolean isServiceRunning = false;
    private PowerManager.WakeLock wakeLock = null;
    private ScheduledExecutorService scheduler = null;

    private int intervalMinutes = 2;
    private String language = "pt-PT";
    private String apiBase = "https://runner.gatoescondido.com";
    private int targetMin = 110;
    private int targetMax = 170;
    private boolean tellHeartRate = true;
    private int maxHr = 179;

    private int lastSgv = -1;
    private int announcementCount = 0;

    // GPS & Pace Tracking
    private LocationManager locationManager = null;
    private LocationListener locationListener = null;
    private Location lastLocation = null;
    private float totalDistanceMeters = 0.0f;
    private int currentPaceSecondsPerKm = 0;
    private int averagePaceSecondsPerKm = 0;
    private long workoutStartTimestamp = 0;

    public static boolean isRunning() {
        return isServiceRunning;
    }

    public static void stopServiceDirect(Context context) {
        try {
            Log.d(TAG, "stopServiceDirect called");
            isServiceRunning = false;

            // 1. Direct synchronous stop of active instance if running
            RunnerService instance = activeInstance;
            if (instance != null) {
                Log.d(TAG, "Stopping activeInstance directly");
                instance.stopForegroundService(false);
                activeInstance = null;
            }

            // 2. Cleanly stop service without calling startForegroundService
            if (context != null) {
                try {
                    context.stopService(new Intent(context, RunnerService.class));
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
            Log.d(TAG, "Received ACTION_STOP intent - stopping foreground service");
            stopForegroundService(true);
            return START_NOT_STICKY;
        }

        activeInstance = this;
        isServiceRunning = true;
        workoutStartTimestamp = System.currentTimeMillis();
        totalDistanceMeters = 0.0f;
        currentPaceSecondsPerKm = 0;
        averagePaceSecondsPerKm = 0;
        lastLocation = null;

        // Parse extras
        intervalMinutes = intent.getIntExtra(EXTRA_INTERVAL, 2);
        if (intervalMinutes < 1) intervalMinutes = 2;
        language = intent.getStringExtra(EXTRA_LANG);
        if (language == null || language.isEmpty()) language = "pt-PT";
        String customApiBase = intent.getStringExtra(EXTRA_API_BASE);
        if (customApiBase != null && !customApiBase.isEmpty()) {
            apiBase = customApiBase;
        }
        targetMin = intent.getIntExtra(EXTRA_TARGET_MIN, 110);
        targetMax = intent.getIntExtra(EXTRA_TARGET_MAX, 170);
        tellHeartRate = intent.getBooleanExtra(EXTRA_TELL_HR, true);
        maxHr = intent.getIntExtra(EXTRA_MAX_HR, 179);

        Log.d(TAG, "Starting RunnerService with interval=" + intervalMinutes + "m, lang=" + language + ", apiBase=" + apiBase + ", maxHr=" + maxHr);

        // 1. Acquire Partial WakeLock to keep CPU alive when screen is off
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && (wakeLock == null || !wakeLock.isHeld())) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NightscoutRunner:WorkoutWakeLock");
                wakeLock.acquire();
                Log.d(TAG, "Partial WakeLock acquired");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed acquiring WakeLock", e);
        }

        // 2. Start Foreground Service with notification immediately
        String notifTitle = language.equals("en") ? "🏃 Nightscout Runner · Starting..." : "🏃 Nightscout Runner · A iniciar treino...";
        String notifContent = language.equals("en") ? "Monitoring glucose and heart rate" : "A monitorizar glicémia, ritmo e batimentos";
        Notification notification = buildNotification(notifTitle, notifContent);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
                }
                startForeground(NOTIFICATION_ID, notification, type);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            Log.d(TAG, "startForeground succeeded");
        } catch (Exception e) {
            Log.e(TAG, "startForeground with types failed, attempting simple startForeground", e);
            try {
                startForeground(NOTIFICATION_ID, notification);
            } catch (Exception e2) {
                Log.e(TAG, "Fallback startForeground failed", e2);
            }
        }

        // 3. Start GPS Location tracking
        startGpsTracking();

        // 4. Connect to Heart Rate sensor if enabled
        if (tellHeartRate && !HeartRateManager.getInstance(this).isConnected()) {
            Log.d(TAG, "Starting HeartRateManager auto-connect in background...");
            HeartRateManager.getInstance(this).startConnect("");
        }

        // 5. Schedule periodic glucose & heart rate polling + voice announcement
        if (scheduler != null && !scheduler.isShutdown()) {
            scheduler.shutdownNow();
        }
        scheduler = Executors.newSingleThreadScheduledExecutor();

        // Immediate first poll after 3 seconds
        scheduler.schedule(this::pollAndAnnounce, 3, TimeUnit.SECONDS);

        // Recurring interval
        scheduler.scheduleAtFixedRate(this::pollAndAnnounce, intervalMinutes * 60L, intervalMinutes * 60L, TimeUnit.SECONDS);

        return START_NOT_STICKY;
    }

    private void startGpsTracking() {
        try {
            locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (locationManager == null) return;

            locationListener = new LocationListener() {
                @Override
                public void onLocationChanged(Location loc) {
                    if (loc == null) return;
                    if (loc.hasAccuracy() && loc.getAccuracy() > 35) return; // ignore inaccurate fixes

                    if (lastLocation != null) {
                        float dist = loc.distanceTo(lastLocation);
                        if (dist > 1.5f && dist < 100.0f) { // legitimate movement between fixes
                            totalDistanceMeters += dist;
                        }
                    }
                    lastLocation = loc;

                    // Calculate current pace from speed
                    if (loc.hasSpeed() && loc.getSpeed() > 0.6f) { // > ~2.2 km/h
                        currentPaceSecondsPerKm = (int) (1000.0f / loc.getSpeed());
                    }

                    // Calculate overall average pace
                    long elapsedSec = (System.currentTimeMillis() - workoutStartTimestamp) / 1000;
                    if (totalDistanceMeters > 40 && elapsedSec > 10) {
                        float avgSpeed = totalDistanceMeters / elapsedSec;
                        if (avgSpeed > 0.4f) {
                            averagePaceSecondsPerKm = (int) (1000.0f / avgSpeed);
                        }
                    }

                    // Forward GPS update to WebView
                    MainActivity.notifyGpsUpdate(totalDistanceMeters, currentPaceSecondsPerKm, averagePaceSecondsPerKm);
                }

                @Override
                public void onStatusChanged(String provider, int status, Bundle extras) {}
                @Override
                public void onProviderEnabled(String provider) {}
                @Override
                public void onProviderDisabled(String provider) {}
            };

            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000, 2.0f, locationListener);
                Log.d(TAG, "Registered GPS_PROVIDER location updates");
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 4000, 5.0f, locationListener);
                Log.d(TAG, "Registered NETWORK_PROVIDER location updates");
            }
        } catch (SecurityException se) {
            Log.w(TAG, "Location permission not granted for GPS runner tracking", se);
        } catch (Exception e) {
            Log.e(TAG, "startGpsTracking error", e);
        }
    }

    private void pollAndAnnounce() {
        if (!isServiceRunning) return;

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

            // Fetch live Heart Rate from HeartRateManager
            int bpm = HeartRateManager.getInstance(this).getLatestBpm();
            String hrSpeech = "";
            if (bpm > 0 && tellHeartRate) {
                String zoneLabel = getHrZoneLabel(bpm, maxHr, language);
                if (language.equals("pt-PT")) {
                    hrSpeech = " " + bpm + " batimentos por minuto" + (zoneLabel.isEmpty() ? "" : ", " + zoneLabel) + ".";
                } else {
                    hrSpeech = " Heart rate " + bpm + " bpm" + (zoneLabel.isEmpty() ? "" : ", " + zoneLabel) + ".";
                }
            }

            // Running Pace speech if moving
            String paceSpeech = "";
            if (currentPaceSecondsPerKm > 0 && currentPaceSecondsPerKm < 900) {
                int paceMins = currentPaceSecondsPerKm / 60;
                int paceSecs = currentPaceSecondsPerKm % 60;
                if (language.equals("pt-PT")) {
                    paceSpeech = " Ritmo " + paceMins + " minutos e " + paceSecs + " por quilómetro.";
                } else {
                    paceSpeech = " Pace " + paceMins + " " + paceSecs + " per kilometer.";
                }
            }

            // Update Notification on Lock Screen
            String hrSuffix = (bpm > 0 ? " · ❤️ " + bpm + " bpm" : "");
            String paceSuffix = (currentPaceSecondsPerKm > 0 ? " · ⏱️ " + (currentPaceSecondsPerKm / 60) + ":" + String.format("%02d", currentPaceSecondsPerKm % 60) + "/km" : "");
            String distSuffix = (totalDistanceMeters > 50 ? " · " + String.format("%.2f", totalDistanceMeters / 1000.0f) + "km" : "");

            String title = "🏃 " + sgv + " mg/dL " + advice.symbol + hrSuffix + paceSuffix;
            String content = advice.dose + " · " + advice.title + distSuffix;
            updateNotification(title, content);

            // Play voice via AudioEngine (routes to Bluetooth and ducks music!)
            String cleanText = (advice.spokenText.replaceAll("[⇈↑↗→↘↓⇊—?]", "").trim() + paceSpeech + hrSpeech).trim();
            String ttsUrl = apiBase + "/api/tts?text=" + URLEncoder.encode(cleanText, "UTF-8") + "&lang=" + URLEncoder.encode(language, "UTF-8");
            AudioEngine.playVoice(getApplicationContext(), ttsUrl, null);

            // Notify UI if app is open or unlocked
            JSONObject readingEvent = new JSONObject();
            readingEvent.put("sgv", sgv);
            readingEvent.put("direction", direction);
            readingEvent.put("delta", delta != null ? delta : JSONObject.NULL);
            readingEvent.put("adviceTitle", advice.title);
            readingEvent.put("adviceDose", advice.dose);
            readingEvent.put("announcementCount", announcementCount);
            readingEvent.put("heartRate", bpm);
            readingEvent.put("distanceMeters", totalDistanceMeters);
            readingEvent.put("paceSecondsPerKm", currentPaceSecondsPerKm);
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

        if (locationManager != null && locationListener != null) {
            try {
                locationManager.removeUpdates(locationListener);
            } catch (Exception ignored) {}
            locationListener = null;
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
            channel.setDescription("Mantém a leitura de glicémia, ritmo e batimentos ativas durante o treino");
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    private static class CarbAdvice {
        String title;
        String dose;
        String spokenText;
        String symbol;
        String trendLabel;
    }

    private CarbAdvice evaluateAdvice(int sgv, String direction, Integer delta, String lang, int tMin, int tMax) {
        CarbAdvice a = new CarbAdvice();
        boolean isEn = lang.equals("en");

        String dirKey = direction != null ? direction : "Flat";
        String trendSpoken;
        String sym;
        switch (dirKey) {
            case "DoubleUp":
                sym = "⇈";
                trendSpoken = isEn ? "rising fast" : "a subir rapidamente";
                break;
            case "SingleUp":
                sym = "↑";
                trendSpoken = isEn ? "rising" : "a subir";
                break;
            case "FortyFiveUp":
                sym = "↗";
                trendSpoken = isEn ? "rising slowly" : "a subir devagar";
                break;
            case "FortyFiveDown":
                sym = "↘";
                trendSpoken = isEn ? "dropping slowly" : "a descer devagar";
                break;
            case "SingleDown":
                sym = "↓";
                trendSpoken = isEn ? "dropping" : "a descer";
                break;
            case "DoubleDown":
                sym = "⇊";
                trendSpoken = isEn ? "dropping fast" : "a descer em queda livre";
                break;
            default:
                sym = "→";
                trendSpoken = isEn ? "steady" : "estável";
                break;
        }
        a.symbol = sym;
        a.trendLabel = trendSpoken;

        boolean isDroppingFast = dirKey.equals("SingleDown") || dirKey.equals("DoubleDown") || (delta != null && delta <= -6);
        boolean isDroppingSlow = dirKey.equals("FortyFiveDown") || (delta != null && delta < -2 && delta > -6);
        boolean isDropping = isDroppingFast || isDroppingSlow;

        if (sgv < 70) {
            a.title = isEn ? "Hypo Alert: Stop and take fast carbs" : "Alerta de Hipo: Pára e consome hidratos rápidos";
            a.dose = isEn ? "15-20g FAST CARBS" : "15 a 20g HIDRATOS RÁPIDOS";
            a.spokenText = isEn
                    ? "Warning: Blood glucose low at " + sgv + ", " + trendSpoken + ". Stop running and take 15 to 20 grams of fast carbs immediately."
                    : "Atenção: Glicémia baixa nos " + sgv + ", " + trendSpoken + ". Pára a corrida e toma 15 a 20 gramas de hidratos de ação rápida imediatamente.";
            return a;
        }

        if (sgv < tMin) {
            if (isDroppingFast) {
                a.title = isEn ? "Urgent: Fast drop below target" : "Urgente: Queda rápida abaixo do alvo";
                a.dose = isEn ? "20-25g CARBS (Gel)" : "20 a 25g HIDRATOS (Gel)";
                a.spokenText = isEn
                        ? "Blood glucose " + sgv + ", " + trendSpoken + ". Take 20 to 25 grams of carbs now, like an energy gel."
                        : "Glicémia nos " + sgv + ", " + trendSpoken + ". Toma 20 a 25 gramas de hidratos agora, toma um gel energético.";
            } else {
                a.title = isEn ? "Low trend: Top up carbs" : "Tendência de descida: Reforça hidratos";
                a.dose = isEn ? "15-20g CARBS (Gel/Chews)" : "15 a 20g HIDRATOS (Gel ou gomas)";
                a.spokenText = isEn
                        ? "Blood glucose " + sgv + ", " + trendSpoken + ". Take 15 to 20 grams of carbs to stay in the running zone."
                        : "Glicémia nos " + sgv + ", " + trendSpoken + ". Consome 15 a 20 gramas de hidratos para manteres a zona ideal de corrida.";
            }
            return a;
        }

        if (sgv <= tMax) {
            if (isDroppingFast) {
                a.title = isEn ? "In range but rapid drop" : "No alvo mas em queda rápida";
                a.dose = isEn ? "15-20g PREVENTIVE GEL" : "15 a 20g GEL PREVENTIVO";
                a.spokenText = isEn
                        ? "Blood glucose " + sgv + ", but " + trendSpoken + ". Take a preventive gel with 15 to 20 grams of carbs."
                        : "Glicémia nos " + sgv + ", mas " + trendSpoken + ". Toma um gel preventivo com 15 a 20 gramas de hidratos para antecipar a quebra.";
            } else if (isDroppingSlow) {
                a.title = isEn ? "In range with mild downward drift" : "No alvo com ligeira descida";
                a.dose = isEn ? "10g SIP CARBS / CHEWS" : "10g HIDRATOS / GOMAS";
                a.spokenText = isEn
                        ? "Blood glucose " + sgv + ", " + trendSpoken + ". Sip some sports drink or take a chew with 10 grams of carbs."
                        : "Glicémia nos " + sgv + ", " + trendSpoken + ". Bebe bebida isotónica ou gomas com 10 gramas de hidratos.";
            } else {
                a.title = isEn ? "Steady: Keep your pace" : "Estável: Mantém o ritmo";
                a.dose = isEn ? "NO CARBS NEEDED" : "SEM HIDRATOS";
                a.spokenText = isEn
                        ? "Blood glucose " + sgv + ", " + trendSpoken + ". Perfect running zone. Keep going!"
                        : "Glicémia nos " + sgv + ", " + trendSpoken + ". Zona ideal. Excelente ritmo, continua assim!";
            }
            return a;
        }

        if (sgv <= 220) {
            if (isDropping) {
                a.title = isEn ? "Above target but correcting downwards" : "Acima do alvo mas a corrigir para baixo";
                a.dose = isEn ? "HYDRATE WITH WATER" : "ÁGUA APENAS";
                a.spokenText = isEn
                        ? "Blood glucose " + sgv + ", " + trendSpoken + ". Returning to target zone. Drink water, no carbs needed."
                        : "Glicémia nos " + sgv + ", " + trendSpoken + ". A regressar à zona alvo. Bebe água, não precisas de hidratos.";
            } else {
                a.title = isEn ? "High: Monitor and hydrate" : "Alta: Vigia e hidrata-te";
                a.dose = isEn ? "WATER ONLY" : "SÓ ÁGUA";
                a.spokenText = isEn
                        ? "Blood glucose " + sgv + ", " + trendSpoken + ". Drink water and avoid carbs until it normalizes."
                        : "Glicémia nos " + sgv + ", " + trendSpoken + ". Bebe água e evita hidratos até estabilizar.";
            }
            return a;
        }

        a.title = isEn ? "Very high: Ease pace and hydrate" : "Muito alta: Modera o ritmo e hidrata-te";
        a.dose = isEn ? "REST & HYDRATE" : "DESCANSA E HIDRATA";
        a.spokenText = isEn
                ? "Warning: Blood glucose very high at " + sgv + ". Ease your pace, drink water and avoid carbs."
                : "Atenção: Glicémia muito alta nos " + sgv + ". Modera o ritmo da corrida, bebe água e evita hidratos.";
        return a;
    }

    private String getHrZoneLabel(int bpm, int maxHr, String language) {
        if (maxHr <= 0) maxHr = 179;
        boolean isPt = language.equals("pt-PT");
        // Zones calibrated from Intervals.icu profile (Marco Nascimento: 136, 144, 152, 161, 170)
        if (bpm < 136) {
            return isPt ? "zona um" : "zone one";
        } else if (bpm <= 144) {
            return isPt ? "zona dois" : "zone two";
        } else if (bpm <= 152) {
            return isPt ? "zona três" : "zone three";
        } else if (bpm <= 161) {
            return isPt ? "zona quatro" : "zone four";
        } else {
            return isPt ? "zona cinco" : "zone five";
        }
    }
}
