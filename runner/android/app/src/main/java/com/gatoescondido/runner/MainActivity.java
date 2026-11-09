package com.gatoescondido.runner;

import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Bundle;
import android.util.Log;
import android.webkit.JavascriptInterface;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "NS_Runner_Audio";
    private MediaPlayer mediaPlayer = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
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

    public class AudioBridge {
        @JavascriptInterface
        public void playVoice(String url) {
            Log.d(TAG, "playVoice called via JavascriptInterface: " + url);
            runOnUiThread(() -> playVoiceInternal(url));
        }
    }

    private void playVoiceInternal(String url) {
        try {
            cleanupPlayer();

            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();

            mediaPlayer = new MediaPlayer();
            mediaPlayer.setAudioAttributes(audioAttributes);
            mediaPlayer.setDataSource(url);

            mediaPlayer.setOnPreparedListener(mp -> {
                try {
                    mp.start();
                    Log.d(TAG, "TTS playing on notification stream (music keeps playing)");
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

    private void cleanupPlayer() {
        try {
            if (mediaPlayer != null) {
                try {
                    if (mediaPlayer.isPlaying()) {
                        mediaPlayer.stop();
                    }
                } catch (Exception ignored) {}
                mediaPlayer.release();
                mediaPlayer = null;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error in cleanupPlayer", e);
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
}
