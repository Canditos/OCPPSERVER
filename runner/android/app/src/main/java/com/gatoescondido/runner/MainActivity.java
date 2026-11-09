package com.gatoescondido.runner;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.KeyEvent;
import android.webkit.JavascriptInterface;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "NS_Runner_Audio";
    private MediaPlayer mediaPlayer = null;
    private AudioFocusRequest focusRequest = null;
    private AudioManager.OnAudioFocusChangeListener focusChangeListener = null;

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
            AudioManager audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (audioManager == null) {
                Log.e(TAG, "AudioManager is null");
                return;
            }

            // Cleanup previous playback
            cleanupPlayer(audioManager);

            focusChangeListener = focusChange -> {
                Log.d(TAG, "Focus change notification: " + focusChange);
            };

            // Navigation guidance usage tells Android to DUCK background music (Yuma/Spotify)
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                        .setAudioAttributes(audioAttributes)
                        .setAcceptsDelayedFocusGain(false)
                        .setWillPauseWhenDucked(false)
                        .setOnAudioFocusChangeListener(focusChangeListener)
                        .build();
                audioManager.requestAudioFocus(focusRequest);
            } else {
                audioManager.requestAudioFocus(focusChangeListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
            }

            mediaPlayer = new MediaPlayer();
            mediaPlayer.setAudioAttributes(audioAttributes);
            mediaPlayer.setDataSource(url);

            mediaPlayer.setOnPreparedListener(mp -> {
                try {
                    mp.start();
                    Log.d(TAG, "MediaPlayer started speech");
                } catch (Exception e) {
                    Log.e(TAG, "Error starting MediaPlayer", e);
                    cleanupPlayer(audioManager);
                    resumeMusic(audioManager);
                }
            });

            mediaPlayer.setOnCompletionListener(mp -> {
                Log.d(TAG, "MediaPlayer speech completed");
                cleanupPlayer(audioManager);
                resumeMusic(audioManager);
            });

            mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                Log.e(TAG, "MediaPlayer error: " + what + ", " + extra);
                cleanupPlayer(audioManager);
                resumeMusic(audioManager);
                return true;
            });

            mediaPlayer.prepareAsync();

        } catch (Exception e) {
            Log.e(TAG, "Error in playVoiceInternal", e);
        }
    }

    private void cleanupPlayer(AudioManager audioManager) {
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

            if (audioManager != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
                    audioManager.abandonAudioFocusRequest(focusRequest);
                    focusRequest = null;
                } else if (focusChangeListener != null) {
                    audioManager.abandonAudioFocus(focusChangeListener);
                    focusChangeListener = null;
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error in cleanupPlayer", e);
        }
    }

    private void resumeMusic(AudioManager am) {
        // Abandon focus immediately so Android system sends AUDIOFOCUS_GAIN to Yuma
        cleanupPlayer(am);

        // Send a Play media key event 250ms later to unpause Yuma if it was paused
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            try {
                long now = SystemClock.uptimeMillis();
                KeyEvent down = new KeyEvent(now, now, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PLAY, 0);
                KeyEvent up = new KeyEvent(now, now, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PLAY, 0);
                if (am != null) {
                    am.dispatchMediaKeyEvent(down);
                    am.dispatchMediaKeyEvent(up);
                    Log.d(TAG, "Sent KEYCODE_MEDIA_PLAY to resume Yuma/background music");
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed dispatching media key", e);
            }
        }, 250);
    }
}
