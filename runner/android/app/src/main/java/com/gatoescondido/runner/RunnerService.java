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
    public static final String EXTRA_LAST_CARB_GRAMS = "lastCarbGrams";
    public static final String EXTRA_LAST_CARB_TS = "lastCarbTimestamp";
    public static final String EXTRA_SESSION_MODE = "sessionMode";

    private static volatile long lastCarbTimestamp = 0;
    private static volatile int lastCarbGrams = 0;

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
    private String sessionMode = "running";

    private int lastSgv = -1;
    private int announcementCount = 0;
    private long lastRoutineAnnouncedTime = 0;
    private long lastDangerAnnouncedTime = 0;
    private long lastKnownBolusTimestamp = 0;
    private String lastProcessedDate = "";

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

    public static void recordCarbIntake(int grams, long timestamp) {
        lastCarbGrams = grams > 0 ? grams : 20;
        lastCarbTimestamp = timestamp > 0 ? timestamp : System.currentTimeMillis();
        Log.d(TAG, "Carb intake recorded in RunnerService: " + lastCarbGrams + "g at " + lastCarbTimestamp);
        RunnerService instance = activeInstance;
        if (instance != null) {
            instance.onCarbIntakeLogged(lastCarbGrams);
        }
    }

    private void onCarbIntakeLogged(int grams) {
        try {
            int bpm = HeartRateManager.getInstance(this).getLatestBpm();
            String hrSuffix = (bpm > 0 ? " · ❤️ " + bpm + " bpm" : "");
            String paceSuffix = (currentPaceSecondsPerKm > 0 ? " · ⏱️ " + (currentPaceSecondsPerKm / 60) + ":" + String.format("%02d", currentPaceSecondsPerKm % 60) + "/km" : "");
            String distSuffix = (totalDistanceMeters > 50 ? " · " + String.format("%.2f", totalDistanceMeters / 1000.0f) + "km" : "");

            String title = "🏃 " + (lastSgv > 0 ? lastSgv + " mg/dL ⏳" : "⏳") + hrSuffix + paceSuffix;
            String content = "EM ABSORÇÃO (" + grams + "g) · Alerta em pausa" + distSuffix;
            updateNotification(title, content);

            boolean isPt = language.equals("pt-PT");
            String confirmText = isPt
                    ? "Gel registado! " + grams + " gramas em absorção. Alerta silenciado durante quinze minutos."
                    : "Carbs logged! " + grams + " grams absorbing. Alerts paused for fifteen minutes.";
            String ttsUrl = apiBase + "/api/tts?text=" + URLEncoder.encode(confirmText, "UTF-8") + "&lang=" + URLEncoder.encode(language, "UTF-8");
            AudioEngine.playVoice(getApplicationContext(), ttsUrl, null);
        } catch (Exception e) {
            Log.e(TAG, "Error in onCarbIntakeLogged", e);
        }
    }

    public static JSONObject getCarbStatusJson() {
        JSONObject obj = new JSONObject();
        try {
            long now = System.currentTimeMillis();
            boolean absorbing = (lastCarbTimestamp > 0) && (now - lastCarbTimestamp < 15 * 60 * 1000);
            obj.put("absorbing", absorbing);
            obj.put("timestamp", lastCarbTimestamp);
            obj.put("grams", lastCarbGrams);
            int minsAgo = absorbing ? (int) Math.max(0, (now - lastCarbTimestamp) / 60000) : -1;
            obj.put("minsAgo", minsAgo);
        } catch (Exception ignored) {}
        return obj;
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
        sessionMode = intent.getStringExtra(EXTRA_SESSION_MODE);
        if (sessionMode == null || sessionMode.isEmpty()) sessionMode = "running";
        lastRoutineAnnouncedTime = 0;
        lastDangerAnnouncedTime = 0;

        if (intent.hasExtra(EXTRA_LAST_CARB_TS)) {
            long prevTs = intent.getLongExtra(EXTRA_LAST_CARB_TS, 0);
            if (prevTs > 0 && (System.currentTimeMillis() - prevTs < 15 * 60 * 1000)) {
                lastCarbTimestamp = prevTs;
                lastCarbGrams = intent.getIntExtra(EXTRA_LAST_CARB_GRAMS, 20);
                Log.d(TAG, "Restored previous carb intake: " + lastCarbGrams + "g at " + lastCarbTimestamp);
            }
        }

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
        scheduler.schedule(this::pollAndCheck, 3, TimeUnit.SECONDS);

        // Fast 30-second checking loop for immediate danger detection and routine announcements
        scheduler.scheduleAtFixedRate(this::pollAndCheck, 30L, 30L, TimeUnit.SECONDS);

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

    private void pollAndCheck() {
        if (!isServiceRunning) return;

        try {
            Log.d(TAG, "pollAndCheck triggered");
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
            String dateString = current.optString("dateString", current.optString("date", ""));
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
            lastProcessedDate = dateString;

            // 1. Evaluate carb advice (Dexcom G7 lag-compensated + 15m absorption window)
            CarbAdvice advice = evaluateAdvice(sgv, direction, delta, language, targetMin, targetMax);

            // 2. Fetch latest Tandem Pump Bolus from Nightscout
            String pumpSpeech = "";
            try {
                String pumpJson = httpGet(apiBase + "/api/pump/latest");
                if (pumpJson != null && !pumpJson.isEmpty()) {
                    JSONObject pObj = new JSONObject(pumpJson);
                    if (pObj.optBoolean("hasBolus", false)) {
                        long bTs = pObj.optLong("timestamp", 0);
                        int minsAgo = pObj.optInt("minsAgo", 999);
                        if (minsAgo <= 20 && bTs > lastKnownBolusTimestamp) {
                            lastKnownBolusTimestamp = bTs;
                            String spoken = pObj.optString("spokenPt", "");
                            if (!spoken.isEmpty()) {
                                pumpSpeech = " " + spoken;
                            }
                        }
                    }
                }
            } catch (Exception ignored) {}

            // 3. Heart Rate
            int bpm = HeartRateManager.getInstance(this).getLatestBpm();
            String hrSpeech = "";
            if (bpm > 0 && tellHeartRate && "running".equalsIgnoreCase(sessionMode)) {
                String zoneLabel = getHrZoneLabel(bpm, maxHr, language);
                if (language.equals("pt-PT")) {
                    hrSpeech = " " + bpm + " batimentos por minuto" + (zoneLabel.isEmpty() ? "" : ", " + zoneLabel) + ".";
                } else {
                    hrSpeech = " Heart rate " + bpm + " bpm" + (zoneLabel.isEmpty() ? "" : ", " + zoneLabel) + ".";
                }
            }

            // 4. Update Notification on Lock Screen
            boolean isRunningMode = "running".equalsIgnoreCase(sessionMode);
            String hrSuffix = (bpm > 0 && isRunningMode ? " · ❤️ " + bpm + " bpm" : "");
            String paceSuffix = (currentPaceSecondsPerKm > 0 && isRunningMode ? " · ⏱️ " + (currentPaceSecondsPerKm / 60) + ":" + String.format("%02d", currentPaceSecondsPerKm % 60) + "/km" : "");
            String distSuffix = (totalDistanceMeters > 50 && isRunningMode ? " · " + String.format("%.2f", totalDistanceMeters / 1000.0f) + "km" : "");
            String modeIcon = isRunningMode ? "🏃 " : "📊 ";

            String notifTitle = modeIcon + sgv + " mg/dL " + advice.symbol + hrSuffix + paceSuffix;
            String notifContent = advice.dose + " · " + advice.title + distSuffix;
            updateNotification(notifTitle, notifContent);

            // 5. Evaluate DANGER condition for IMMEDIATE out-of-cycle intervention
            boolean isSevereHypo = sgv < 75;
            boolean isImminentHypo = sgv <= 85;
            boolean isFastPlunge = (delta != null && delta <= -6 && sgv <= 135) || (direction.equals("DoubleDown") && sgv <= 140);
            boolean isPredictiveCrash = false;
            if (delta != null && delta <= -5 && sgv <= 135) {
                float dropPerMin = Math.abs(delta) / 5.0f;
                int minTo70 = Math.round((sgv - 70) / dropPerMin);
                if (minTo70 > 0 && minTo70 <= 12) {
                    isPredictiveCrash = true;
                }
            }
            boolean isDanger = isSevereHypo || isImminentHypo || isFastPlunge || isPredictiveCrash;
            long now = System.currentTimeMillis();

            // A) IMMEDIATE OUT-OF-CYCLE DANGER INTERVENTION!
            if (isDanger && (now - lastDangerAnnouncedTime > 90 * 1000L)) {
                Log.i(TAG, "EMERGENCY DANGER detected out-of-cycle at SGV=" + sgv + "! Speaking immediately.");
                lastDangerAnnouncedTime = now;
                lastRoutineAnnouncedTime = now; // reset routine timer
                announcementCount++;

                String prefix = language.equals("pt-PT")
                    ? "Alerta urgente fora de ciclo! "
                    : "Urgent emergency alert! ";

                // Always state glucose clearly first!
                String emergencySpeech = (prefix + advice.spokenText.replaceAll("[⇈↑↗→↘↓⇊—?]", "").trim() + pumpSpeech + hrSpeech).trim();
                String ttsUrl = apiBase + "/api/tts?text=" + URLEncoder.encode(emergencySpeech, "UTF-8") + "&lang=" + URLEncoder.encode(language, "UTF-8");
                AudioEngine.playVoice(getApplicationContext(), ttsUrl, null);

            // B) ROUTINE PERIODIC ANNOUNCEMENT (every intervalMinutes)
            } else if (now - lastRoutineAnnouncedTime >= intervalMinutes * 60L * 1000L) {
                Log.d(TAG, "Routine interval reached (" + intervalMinutes + "m). Speaking.");
                lastRoutineAnnouncedTime = now;
                announcementCount++;

                // NOTE: NO paceSpeech! Pure glucose + carbs + pump + hr
                String cleanText = (advice.spokenText.replaceAll("[⇈↑↗→↘↓⇊—?]", "").trim() + pumpSpeech + hrSpeech).trim();
                String ttsUrl = apiBase + "/api/tts?text=" + URLEncoder.encode(cleanText, "UTF-8") + "&lang=" + URLEncoder.encode(language, "UTF-8");
                AudioEngine.playVoice(getApplicationContext(), ttsUrl, null);
            }

            // Forward reading event to UI
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
            readingEvent.put("sessionMode", sessionMode);
            MainActivity.notifyReading(readingEvent);

        } catch (Exception e) {
            Log.e(TAG, "Error in pollAndCheck", e);
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

        boolean isDroppingFast = dirKey.equals("SingleDown") || dirKey.equals("DoubleDown") || (delta != null && delta <= -5);
        boolean isDroppingSlow = dirKey.equals("FortyFiveDown") || (delta != null && delta < -2 && delta > -5);
        boolean isDropping = isDroppingFast || isDroppingSlow;

        // 1. Carb Absorption Window (Silence repeat carb alarms for 15 minutes!)
        long now = System.currentTimeMillis();
        if (lastCarbTimestamp > 0 && (now - lastCarbTimestamp < 15 * 60 * 1000)) {
            int minsAgo = (int) Math.max(0, (now - lastCarbTimestamp) / 60000);
            if (sgv < 65) {
                // Severe hypoglycemia safety override
                a.title = isEn ? "Hypo Alert: Stop running and wait" : "Alerta de Hipo: Pára a corrida e aguarda";
                a.dose = isEn ? "STOP & REST" : "PÁRA E AGUARDA";
                a.spokenText = isEn
                        ? "Urgent: Glucose low at " + sgv + ". Keep resting, carbs are absorbing."
                        : "Atenção: Glicémia baixa nos " + sgv + ". Pára a corrida e descansa, os hidratos estão a ser absorvidos.";
                return a;
            }

            // Normal absorption window: silence carb intake alarms
            a.title = isEn ? "Carbs absorbing (" + minsAgo + "m ago)" : "Hidratos em absorção (há " + minsAgo + "m)";
            a.dose = isEn ? "ABSORBING (" + lastCarbGrams + "g)" : "EM ABSORÇÃO (" + lastCarbGrams + "g)";
            a.symbol = "⏳";
            a.spokenText = isEn
                    ? "Blood glucose " + sgv + ", " + trendSpoken + ". Carbs absorbing, you took " + lastCarbGrams + " grams " + minsAgo + " minutes ago. Waiting for rise."
                    : "Glicémia nos " + sgv + ", " + trendSpoken + ". Hidratos em absorção, tomaste " + lastCarbGrams + " gramas há " + minsAgo + " minutos. Aguarda pela subida.";
            return a;
        }

        // 2. Predictive Hypoglycemia Alert (Projected <= 70 within 15m)
        if (delta != null && delta <= -5 && sgv <= 140) {
            float dropPerMin = Math.abs(delta) / 5.0f;
            int minutesTo70 = Math.round((sgv - 70) / dropPerMin);
            if (minutesTo70 > 0 && minutesTo70 <= 15) {
                a.title = isEn ? "Predictive Alert: Hypo in ~" + minutesTo70 + "m" : "Alerta Preditivo: Hipo em ~" + minutesTo70 + "m";
                a.dose = isEn ? "20g FAST GEL NOW" : "20g GEL RÁPIDO AGORA";
                a.spokenText = isEn
                        ? "Urgent warning! Rapid drop. Risk of hypoglycemia in " + minutesTo70 + " minutes. Take 20 grams of gel now!"
                        : "Atenção urgente! Queda rápida. Risco de hipoglicémia dentro de " + minutesTo70 + " minutos. Antecipa o sensor: toma um gel de vinte gramas já!";
                return a;
            }
        }

        // 3. Clinical Hypoglycemia (< 75 mg/dL)
        if (sgv < 75) {
            a.title = isEn ? "Hypo Alert: Stop and take fast carbs" : "Alerta de Hipo: Pára e toma hidratos rápidos";
            a.dose = isEn ? "20-25g FAST CARBS" : "20 a 25g HIDRATOS RÁPIDOS";
            a.spokenText = isEn
                    ? "Urgent warning: Glucose low at " + sgv + ", " + trendSpoken + ". Stop running immediately and take 20 to 25 grams of fast carbs!"
                    : "Atenção urgente! Glicémia baixa nos " + sgv + ", " + trendSpoken + ". Pára imediatamente a corrida e toma vinte a vinte e cinco gramas de hidratos rápidos!";
            return a;
        }

        // 4. Imminent Hypo Zone (75 - 110 mg/dL) - Interstitial lag means real capillary blood is < 90!
        if (sgv <= 110) {
            a.title = isEn ? "Imminent Hypo: Take gel immediately" : "Quebra Iminente: Toma gel imediatamente";
            a.dose = isEn ? "20-25g CARBS (Gel)" : "20 a 25g HIDRATOS (Gel)";
            a.spokenText = isEn
                    ? "Warning: Blood glucose " + sgv + ", " + trendSpoken + ". Real blood is below 90. Take 20 to 25 grams of carbs now!"
                    : "Aviso urgente! Glicémia nos " + sgv + ", " + trendSpoken + ". O sangue real está em quebra iminente. Toma vinte a vinte e cinco gramas de gel agora mesmo!";
            return a;
        }

        // 5. Proactive Carb Action Zone (110 - 140 mg/dL) - Compensates Dexcom G7 10-15m ISF lag!
        if (sgv <= 140) {
            if (isDroppingFast) {
                a.title = isEn ? "Fast Drop: Proactive Gel" : "Queda Rápida: Gel Agressivo";
                a.dose = isEn ? "20g PROACTIVE GEL" : "20g GEL AGRESSIVO (ANTECIPAÇÃO)";
                a.spokenText = isEn
                        ? "Blood glucose " + sgv + ", falling fast. Anticipate sensor lag: take a 20 gram gel now to stop the crash!"
                        : "Glicémia nos " + sgv + ", em descida rápida. Antecipa o atraso do sensor: toma um gel de vinte gramas já para travar a quebra!";
            } else if (isDroppingSlow) {
                a.title = isEn ? "Downward Drift: Take Carbs" : "Descida Suave: Reforça Hidratos";
                a.dose = isEn ? "15-20g GEL / CHEWS" : "15 a 20g GEL OU GOMAS";
                a.spokenText = isEn
                        ? "Blood glucose " + sgv + ", " + trendSpoken + ". Take 15 to 20 grams of carbs to sustain your run."
                        : "Glicémia nos " + sgv + ", " + trendSpoken + ". Toma quinze a vinte gramas de hidratos para proteger a tua corrida.";
            } else if (sgv <= 125) {
                a.title = isEn ? "Lower Boundary: Preventive Carbs" : "Limiar Inferior: Reforço Preventivo";
                a.dose = isEn ? "10-15g CHEWS / DRINK" : "10 a 15g BEBIDA / GOMAS";
                a.spokenText = isEn
                        ? "Blood glucose " + sgv + ", steady but at lower running limit. Sip 10 to 15 grams of sports drink."
                        : "Glicémia nos " + sgv + ", estável mas no limite inferior de corrida. Toma dez a quinze gramas de hidratos de reforço.";
            } else {
                a.title = isEn ? "Steady Running Base" : "Base Estável de Corrida";
                a.dose = isEn ? "MAINTAIN / SIP WATER" : "MANTER / BEBER ÁGUA";
                a.spokenText = isEn
                        ? "Blood glucose " + sgv + ", steady. Safe running pace, no carbs needed right now."
                        : "Glicémia nos " + sgv + ", estável. Ritmo seguro. Não precisas de hidratos de momento.";
            }
            return a;
        }

        // 6. Optimal Running Safety Buffer (140 - 175 mg/dL)
        if (sgv <= 175) {
            if (isDroppingFast) {
                a.title = isEn ? "In buffer but rapid drop" : "No alvo mas em queda rápida";
                a.dose = isEn ? "15g PREVENTIVE GEL" : "15g GEL PREVENTIVO";
                a.spokenText = isEn
                        ? "Blood glucose " + sgv + ", but dropping fast. Take a 15 gram preventive gel before reaching 120."
                        : "Glicémia nos " + sgv + ", mas em descida acentuada. Toma quinze gramas de gel preventivo antes que chegue aos cento e vinte.";
            } else if (isDroppingSlow) {
                a.title = isEn ? "Mild drift in buffer" : "No alvo com ligeira descida";
                a.dose = isEn ? "10g SIP / CHEWS" : "10g ISOTÓNICO / GOMAS";
                a.spokenText = isEn
                        ? "Blood glucose " + sgv + ", mild downward trend. Sip sports drink or take a 10 gram chew."
                        : "Glicémia nos " + sgv + ", com ligeira descida. Bebe um pouco de isotónico ou come uma goma de dez gramas.";
            } else {
                a.title = isEn ? "Ideal Zone: Perfect Pace" : "Zona Ideal: Excelente Gestão";
                a.dose = isEn ? "NO CARBS NEEDED" : "SEM HIDRATOS";
                a.spokenText = isEn
                        ? "Blood glucose " + sgv + ", " + trendSpoken + ". Perfect running zone with safety buffer. Keep going!"
                        : "Glicémia nos " + sgv + ", " + trendSpoken + ". Zona ideal para correr com excelente margem. Continua assim sem hidratos!";
            }
            return a;
        }

        // 7. Elevated (> 175 and <= 230 mg/dL)
        if (sgv <= 230) {
            a.title = isEn ? "Elevated: Hydrate with water" : "Elevada: Bebe água pura";
            a.dose = isEn ? "WATER ONLY" : "SÓ ÁGUA PURA";
            a.spokenText = isEn
                    ? "Blood glucose " + sgv + ", " + trendSpoken + ". Drink plain water, avoid carbs until it normalizes."
                    : "Glicémia nos " + sgv + ", " + trendSpoken + ". Bebe água pura e evita hidratos até estabilizar.";
            return a;
        }

        // 8. Very High (> 230 mg/dL)
        a.title = isEn ? "Very High: Ease pace and hydrate" : "Muito Alta: Modera o ritmo e hidrata-te";
        a.dose = isEn ? "REST & HYDRATE" : "MODERAR RITMO + ÁGUA";
        a.spokenText = isEn
                ? "Warning: Blood glucose very high at " + sgv + ". Ease your running pace, drink water and avoid carbs."
                : "Atenção: Glicémia muito alta nos " + sgv + ". Modera o ritmo da corrida, bebe água abundante e evita hidratos.";
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
