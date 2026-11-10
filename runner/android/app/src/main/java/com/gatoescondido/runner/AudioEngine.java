package com.gatoescondido.runner;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.audiofx.LoudnessEnhancer;
import android.os.Build;
import android.util.Log;

public class AudioEngine {
    private static final String TAG = "NS_AudioEngine";
    private static MediaPlayer mediaPlayer = null;
    private static LoudnessEnhancer loudnessEnhancer = null;
    private static AudioFocusRequest audioFocusRequest = null;
    private static AudioManager audioManager = null;
    private static boolean isPlaying = false;

    // Boost vocal guidance by +15 dB (1500 mB) over background audio/music
    private static final int TARGET_GAIN_MB = 1500;

    /**
     * Plays TTS audio URL:
     * - Requests AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK so Android OS and music players (Yuma/Spotify)
     *   automatically duck (lower) their volume during speech without stopping.
     * - Uses USAGE_ASSISTANCE_NAVIGATION_GUIDANCE to route to Bluetooth headphones
     * - Applies LoudnessEnhancer DSP gain (+15 dB) to speech session for punchy, articulate guidance.
     * - Abandons audio focus on completion so music volume smoothly returns to 100%.
     */
    public static synchronized void playVoice(Context context, String url, Runnable onComplete) {
        try {
            cleanup();

            audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);

            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();

            // Request transient audio focus with ducking hint (Yuma/Spotify lower volume during speech)
            if (audioManager != null) {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                                .setAudioAttributes(audioAttributes)
                                .setAcceptsDelayedFocusGain(false)
                                .setWillPauseWhenDucked(false)
                                .setOnAudioFocusChangeListener(focusChange -> {
                                    Log.d(TAG, "Audio focus changed: " + focusChange);
                                })
                                .build();
                        int res = audioManager.requestAudioFocus(audioFocusRequest);
                        Log.d(TAG, "AudioFocus requested (TRANSIENT_MAY_DUCK), result=" + res);
                    } else {
                        audioManager.requestAudioFocus(
                                focusChange -> Log.d(TAG, "Audio focus changed: " + focusChange),
                                AudioManager.STREAM_MUSIC,
                                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
                        );
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Failed requesting audio focus ducking", e);
                }
            }

            mediaPlayer = new MediaPlayer();
            mediaPlayer.setAudioAttributes(audioAttributes);
            mediaPlayer.setDataSource(url);

            mediaPlayer.setOnPreparedListener(mp -> {
                try {
                    // Apply hardware/DSP LoudnessEnhancer boost to the MediaPlayer session
                    try {
                        int sessionId = mp.getAudioSessionId();
                        if (sessionId != 0) {
                            loudnessEnhancer = new LoudnessEnhancer(sessionId);
                            loudnessEnhancer.setTargetGain(TARGET_GAIN_MB);
                            loudnessEnhancer.setEnabled(true);
                            Log.d(TAG, "LoudnessEnhancer applied with target gain: " + TARGET_GAIN_MB + " mB (+15 dB)");
                        }
                    } catch (Exception e) {
                        Log.w(TAG, "Could not initialize LoudnessEnhancer", e);
                    }

                    mp.setVolume(1.0f, 1.0f);
                    mp.start();
                    isPlaying = true;
                    Log.d(TAG, "Speech started with music ducked and +15 dB loudness boost");
                } catch (Exception e) {
                    Log.e(TAG, "Error starting MediaPlayer", e);
                    cleanup();
                    if (onComplete != null) onComplete.run();
                }
            });

            mediaPlayer.setOnCompletionListener(mp -> {
                Log.d(TAG, "Speech finished cleanly - restoring music volume");
                cleanup();
                if (onComplete != null) onComplete.run();
            });

            mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                Log.e(TAG, "MediaPlayer error: what=" + what + ", extra=" + extra);
                cleanup();
                if (onComplete != null) onComplete.run();
                return true;
            });

            mediaPlayer.prepareAsync();

        } catch (Exception e) {
            Log.e(TAG, "Exception in playVoice", e);
            cleanup();
            if (onComplete != null) onComplete.run();
        }
    }

    public static synchronized void cleanup() {
        try {
            if (audioManager != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
                    audioManager.abandonAudioFocusRequest(audioFocusRequest);
                    audioFocusRequest = null;
                    Log.d(TAG, "Abandoned audio focus request (music volume restored)");
                } else {
                    audioManager.abandonAudioFocus(null);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Error abandoning audio focus", e);
        }

        try {
            if (loudnessEnhancer != null) {
                try {
                    loudnessEnhancer.setEnabled(false);
                    loudnessEnhancer.release();
                } catch (Exception ignored) {}
                loudnessEnhancer = null;
            }
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
            Log.e(TAG, "Error in cleanup", e);
        }
        isPlaying = false;
    }

    public static synchronized boolean isPlaying() {
        return isPlaying;
    }
}
