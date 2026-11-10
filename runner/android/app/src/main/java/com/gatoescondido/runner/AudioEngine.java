package com.gatoescondido.runner;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.util.Log;

public class AudioEngine {
    private static final String TAG = "NS_AudioEngine";
    private static MediaPlayer mediaPlayer = null;
    private static int savedMusicVolume = -1;
    private static boolean isPlaying = false;

    /**
     * Ducks music volume to ~35% of current volume so voice is clearly heard over music.
     */
    public static synchronized void duckMusicVolume(Context context) {
        try {
            AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (am != null && savedMusicVolume < 0) {
                savedMusicVolume = am.getStreamVolume(AudioManager.STREAM_MUSIC);
                int duckedVol = Math.max(1, (int) Math.round(savedMusicVolume * 0.35));
                am.setStreamVolume(AudioManager.STREAM_MUSIC, duckedVol, 0);
                Log.d(TAG, "Ducked music volume " + savedMusicVolume + " -> " + duckedVol);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to duck volume", e);
        }
    }

    /**
     * Restores music volume to the level it was before speech.
     */
    public static synchronized void restoreMusicVolume(Context context) {
        try {
            if (savedMusicVolume >= 0) {
                AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    am.setStreamVolume(AudioManager.STREAM_MUSIC, savedMusicVolume, 0);
                    Log.d(TAG, "Restored music volume to " + savedMusicVolume);
                }
                savedMusicVolume = -1;
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to restore volume", e);
        }
    }

    /**
     * Plays TTS audio URL:
     * - Uses USAGE_ASSISTANCE_NAVIGATION_GUIDANCE to route to Bluetooth headphones
     * - Does NOT request exclusive audio focus, so background music (Yuma/Spotify) never pauses
     * - Ducks music volume right when playback starts, and restores it when speech ends
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
                    // Duck music volume right when speech is ready to play
                    duckMusicVolume(context);
                    mp.start();
                    isPlaying = true;
                    Log.d(TAG, "Speech started via NAVIGATION_GUIDANCE with music ducked");
                } catch (Exception e) {
                    Log.e(TAG, "Error starting MediaPlayer", e);
                    restoreMusicVolume(context);
                    cleanup();
                    if (onComplete != null) onComplete.run();
                }
            });

            mediaPlayer.setOnCompletionListener(mp -> {
                Log.d(TAG, "Speech finished cleanly");
                restoreMusicVolume(context);
                cleanup();
                if (onComplete != null) onComplete.run();
            });

            mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                Log.e(TAG, "MediaPlayer error: what=" + what + ", extra=" + extra);
                restoreMusicVolume(context);
                cleanup();
                if (onComplete != null) onComplete.run();
                return true;
            });

            mediaPlayer.prepareAsync();

        } catch (Exception e) {
            Log.e(TAG, "Exception in playVoice", e);
            restoreMusicVolume(context);
            cleanup();
            if (onComplete != null) onComplete.run();
        }
    }

    public static synchronized void cleanup() {
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
            Log.e(TAG, "Error in cleanup", e);
        }
        isPlaying = false;
    }

    public static synchronized boolean isPlaying() {
        return isPlaying;
    }
}
