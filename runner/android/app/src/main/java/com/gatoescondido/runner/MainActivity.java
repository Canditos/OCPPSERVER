package com.gatoescondido.runner;

import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.JavascriptInterface;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "NS_Runner_Audio";
    private MediaPlayer mediaPlayer = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VoiceAudioPlugin.class);
        super.onCreate(savedInstanceState);
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
    public void onPause() {
        super.onPause();
        // Prevent WebView from freezing timers when app is minimized or screen is locked
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().resumeTimers();
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to resume WebView timers in onPause", e);
        }
    }

    public class AudioBridge {
        @JavascriptInterface
        public void playVoice(String url) {
            Log.d(TAG, "playVoice called via JavascriptInterface: " + url);
            runOnUiThread(() -> playVoiceInternal(url));
        }

        @JavascriptInterface
        public void startWorkoutService() {
            Log.d(TAG, "startWorkoutService called via JavascriptInterface");
            try {
                Intent serviceIntent = new Intent(MainActivity.this, RunnerService.class);
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
                serviceIntent.setAction("STOP");
                startService(serviceIntent);
            } catch (Exception e) {
                Log.e(TAG, "Failed to stop RunnerService", e);
            }
        }
    }

    private void playVoiceInternal(String url) {
        try {
            cleanupPlayer();

            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();

            mediaPlayer = new MediaPlayer();
            mediaPlayer.setAudioAttributes(audioAttributes);
            mediaPlayer.setDataSource(url);

            mediaPlayer.setOnPreparedListener(mp -> {
                try {
                    mp.start();
                    Log.d(TAG, "TTS playing as sonification overlay (no audio focus requested)");
                } catch (Exception e) {
                    Log.e(TAG, "Error starting MediaPlayer", e);
                    cleanupPlayer();
                    notifyWebViewDone();
                }
            });

            mediaPlayer.setOnCompletionListener(mp -> {
                Log.d(TAG, "TTS completed");
                cleanupPlayer();
                notifyWebViewDone();
            });

            mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                Log.e(TAG, "MediaPlayer error: " + what + ", " + extra);
                cleanupPlayer();
                notifyWebViewDone();
                return true;
            });

            mediaPlayer.prepareAsync();

        } catch (Exception e) {
            Log.e(TAG, "Error in playVoiceInternal", e);
        }
    }

    private void notifyWebViewDone() {
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().post(() ->
                    getBridge().getWebView().evaluateJavascript(
                        "if(window._onNativeVoiceDone) window._onNativeVoiceDone();", null));
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to notify WebView", e);
        }
    }

    private void cleanupPlayer() {
        try {
            if (mediaPlayer != null) {
                try {
                    if (mediaPlayer.isPlaying()) { mediaPlayer.stop(); }
                } catch (Exception ignored) {}
                mediaPlayer.release();
                mediaPlayer = null;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error in cleanupPlayer", e);
        }
    }
}
