package com.gatoescondido.runner;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.audiofx.LoudnessEnhancer;
import android.util.Log;

public class AudioEngine {
    private static final String TAG = "NS_AudioEngine";
    private static MediaPlayer mediaPlayer = null;
    private static LoudnessEnhancer loudnessEnhancer = null;
    private static boolean isPlaying = false;

    // Boost vocal guidance by +15 dB (1500 mB) over background audio/music
    private static final int TARGET_GAIN_MB = 1500;

    /**
     * Plays TTS audio URL:
     * - Uses USAGE_ASSISTANCE_NAVIGATION_GUIDANCE to route to Bluetooth headphones
     * - Does NOT request audio focus, ensuring background music players (Yuma/Spotify) NEVER pause
     * - Does NOT change STREAM_MUSIC master volume (which would attenuate both speech and music)
     * - Applies LoudnessEnhancer DSP gain (+15 dB) directly to the speech session so vocal guidance
     *   cuts through background music loudly, clearly, and intelligibly.
     */
    public static synchronized void playVoice(Context context, String url, Runnable onComplete) {
        try {
            cleanup();

            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();

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
                    Log.d(TAG, "Speech started via NAVIGATION_GUIDANCE with +15 dB loudness boost");
                } catch (Exception e) {
                    Log.e(TAG, "Error starting MediaPlayer", e);
                    cleanup();
                    if (onComplete != null) onComplete.run();
                }
            });

            mediaPlayer.setOnCompletionListener(mp -> {
                Log.d(TAG, "Speech finished cleanly");
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
