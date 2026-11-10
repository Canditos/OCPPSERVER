package com.gatoescondido.runner;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.JavascriptInterface;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "NS_MainActivity";
    private static WeakReference<MainActivity> currentActivityRef = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VoiceAudioPlugin.class);
        super.onCreate(savedInstanceState);
        currentActivityRef = new WeakReference<>(this);

        requestAppPermissions();

        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().addJavascriptInterface(new AudioBridge(), "AndroidVoice");
                Log.d(TAG, "AndroidVoice JavascriptInterface registered successfully");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to register AndroidVoice interface", e);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        currentActivityRef = new WeakReference<>(this);
    }

    private void requestAppPermissions() {
        List<String> permissionsNeeded = new ArrayList<>();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) { // Android 13+
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                permissionsNeeded.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) { // Android 12+
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT)
                    != PackageManager.PERMISSION_GRANTED) {
                permissionsNeeded.add(Manifest.permission.BLUETOOTH_CONNECT);
            }
        }

        if (!permissionsNeeded.isEmpty()) {
            ActivityCompat.requestPermissions(this, permissionsNeeded.toArray(new String[0]), 101);
        }
    }

    public static void notifyReading(JSONObject readingData) {
        try {
            if (currentActivityRef != null && currentActivityRef.get() != null) {
                MainActivity act = currentActivityRef.get();
                if (act.getBridge() != null && act.getBridge().getWebView() != null) {
                    act.runOnUiThread(() -> {
                        String js = "if(window._onNativeWorkoutReading) { window._onNativeWorkoutReading(" + readingData.toString() + "); }";
                        act.getBridge().getWebView().evaluateJavascript(js, null);
                    });
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error in notifyReading", e);
        }
    }

    public static void notifyWorkoutStopped() {
        try {
            if (currentActivityRef != null && currentActivityRef.get() != null) {
                MainActivity act = currentActivityRef.get();
                if (act.getBridge() != null && act.getBridge().getWebView() != null) {
                    act.runOnUiThread(() -> {
                        String js = "if(window._onNativeWorkoutStopped) { window._onNativeWorkoutStopped(); }";
                        act.getBridge().getWebView().evaluateJavascript(js, null);
                    });
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error in notifyWorkoutStopped", e);
        }
    }

    public class AudioBridge {
        @JavascriptInterface
        public void playVoice(String url) {
            Log.d(TAG, "playVoice called via JavascriptInterface: " + url);
            runOnUiThread(() -> AudioEngine.playVoice(MainActivity.this, url, () -> {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().post(() ->
                            getBridge().getWebView().evaluateJavascript(
                                    "if(window._onNativeVoiceDone) window._onNativeVoiceDone();", null));
                }
            }));
        }

        @JavascriptInterface
        public void stopVoice() {
            runOnUiThread(AudioEngine::cleanup);
        }

        @JavascriptInterface
        public void startWorkoutService(int intervalMinutes, String language, String apiBase, int targetMin, int targetMax) {
            Log.d(TAG, "startWorkoutService called via JavascriptInterface with interval=" + intervalMinutes);
            try {
                Intent serviceIntent = new Intent(MainActivity.this, RunnerService.class);
                serviceIntent.putExtra(RunnerService.EXTRA_INTERVAL, intervalMinutes);
                serviceIntent.putExtra(RunnerService.EXTRA_LANG, language);
                serviceIntent.putExtra(RunnerService.EXTRA_API_BASE, apiBase);
                serviceIntent.putExtra(RunnerService.EXTRA_TARGET_MIN, targetMin);
                serviceIntent.putExtra(RunnerService.EXTRA_TARGET_MAX, targetMax);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(serviceIntent);
                } else {
                    startService(serviceIntent);
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to start RunnerService", e);
            }
        }

        @JavascriptInterface
        public void stopWorkoutService() {
            Log.d(TAG, "stopWorkoutService called via JavascriptInterface");
            try {
                Intent serviceIntent = new Intent(MainActivity.this, RunnerService.class);
                serviceIntent.setAction(RunnerService.ACTION_STOP);
                startService(serviceIntent);
            } catch (Exception e) {
                Log.e(TAG, "Failed to stop RunnerService", e);
            }
        }

        @JavascriptInterface
        public boolean isWorkoutRunning() {
            return RunnerService.isRunning();
        }
    }
}
