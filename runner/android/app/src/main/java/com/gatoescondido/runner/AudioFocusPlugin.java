package com.gatoescondido.runner;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AudioFocusPlugin")
public class AudioFocusPlugin extends Plugin {
    private static final String TAG = "AudioFocusPlugin";
    private MediaPlayer mediaPlayer = null;
    private AudioFocusRequest focusRequest = null;
    private AudioManager.OnAudioFocusChangeListener focusChangeListener = null;

    @PluginMethod
    public void playVoice(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("URL is required");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                Context context = getContext();
                AudioManager audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
                if (audioManager == null) {
                    call.reject("AudioManager not available");
                    return;
                }

                // Cleanup any ongoing playback first
                cleanupPlayer(audioManager);

                focusChangeListener = focusChange -> {
                    Log.d(TAG, "Audio focus changed: " + focusChange);
                };

                // Navigation guidance & speech usage tells Android OS to DUCK background music (Yuma/Spotify/etc.)
                // rather than permanently killing the music player session.
                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build();

                int focusResult;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                            .setAudioAttributes(audioAttributes)
                            .setAcceptsDelayedFocusGain(false)
                            .setOnAudioFocusChangeListener(focusChangeListener)
                            .build();
                    focusResult = audioManager.requestAudioFocus(focusRequest);
                } else {
                    focusResult = audioManager.requestAudioFocus(
                            focusChangeListener,
                            AudioManager.STREAM_MUSIC,
                            AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
                    );
                }

                Log.d(TAG, "Requested audio focus result: " + focusResult);

                mediaPlayer = new MediaPlayer();
                mediaPlayer.setAudioAttributes(audioAttributes);
                mediaPlayer.setDataSource(url);

                mediaPlayer.setOnPreparedListener(mp -> {
                    try {
                        mp.start();
                    } catch (Exception e) {
                        Log.e(TAG, "Error starting MediaPlayer", e);
                        cleanupPlayer(audioManager);
                        call.reject("Failed to start MediaPlayer: " + e.getMessage());
                    }
                });

                mediaPlayer.setOnCompletionListener(mp -> {
                    cleanupPlayer(audioManager);
                    JSObject ret = new JSObject();
                    ret.put("status", "completed");
                    call.resolve(ret);
                });

                mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                    Log.e(TAG, "MediaPlayer error: " + what + ", " + extra);
                    cleanupPlayer(audioManager);
                    call.reject("MediaPlayer error: " + what);
                    return true;
                });

                mediaPlayer.prepareAsync();

            } catch (Exception e) {
                Log.e(TAG, "Exception in playVoice", e);
                call.reject("Failed to play: " + e.getMessage());
            }
        });
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
            Log.d(TAG, "Audio focus abandoned and player cleaned up - music should resume/unduck");
        } catch (Exception e) {
            Log.e(TAG, "Error in cleanupPlayer", e);
        }
    }
}
