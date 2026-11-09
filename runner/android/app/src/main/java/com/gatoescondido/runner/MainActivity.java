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

            // Crucial: USAGE_ASSISTANCE_SONIFICATION / CONTENT_TYPE_SPEECH
            // WE DELIBERATELY DO NOT REQUEST AUDIO FOCUS!
            // When audio focus is NOT requested, Android's AudioService NEVER notifies
            // background music players (Yuma, Spotify, etc.).
            // Therefore, Yuma NEVER receives a pause/stop event and NEVER stops playing!
            // Android hardware mixer seamlessly overlays the voice announcement on top of the music.
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
                    Log.d(TAG, "Speech playback started seamlessly over music");
                } catch (Exception e) {
                    Log.e(TAG, "Error starting MediaPlayer", e);
                    cleanupPlayer();
                }
            });

            mediaPlayer.setOnCompletionListener(mp -> {
                Log.d(TAG, "Speech playback completed cleanly");
                cleanupPlayer();
            });

            mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                Log.e(TAG, "MediaPlayer error: " + what + ", " + extra);
                cleanupPlayer();
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
}
