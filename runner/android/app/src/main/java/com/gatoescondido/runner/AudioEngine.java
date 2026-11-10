package com.gatoescondido.runner;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.audiofx.LoudnessEnhancer;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class AudioEngine {
    private static final String TAG = "NS_AudioEngine";
    private static MediaPlayer mediaPlayer = null;
    private static LoudnessEnhancer loudnessEnhancer = null;
    private static AudioFocusRequest audioFocusRequest = null;
    private static AudioManager audioManager = null;
    private static boolean isPlaying = false;
    private static final ExecutorService downloadExecutor = Executors.newSingleThreadExecutor();
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());

    // Boost vocal guidance by +15 dB (1500 mB) over background audio/music
    private static final int TARGET_GAIN_MB = 1500;

    /**
     * Plays vocal guidance:
     * 1. Buffers/downloads the audio in background while music keeps playing at 100% normal volume.
     * 2. Only ducks background music (Yuma/Spotify/Podcasts) the EXACT MILLISECOND audio is ready to speak.
     * 3. Zero latency between music ducking and speech onset.
     * 4. Abandons focus immediately on speech completion to restore music smoothly to 100%.
     */
    public static synchronized void playVoice(Context context, String url, Runnable onComplete) {
        cleanup();

        final Context appContext = context.getApplicationContext();
        audioManager = (AudioManager) appContext.getSystemService(Context.AUDIO_SERVICE);

        downloadExecutor.execute(() -> {
            File localFile = null;
            try {
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    localFile = new File(appContext.getCacheDir(), "ns_speech_temp.mp3");
                    URL u = new URL(url);
                    HttpURLConnection conn = (HttpURLConnection) u.openConnection();
                    conn.setConnectTimeout(8000);
                    conn.setReadTimeout(12000);
                    conn.setRequestProperty("User-Agent", "NS-Runner-Android");
                    conn.connect();

                    int responseCode = conn.getResponseCode();
                    if (responseCode != HttpURLConnection.HTTP_OK) {
                        Log.e(TAG, "TTS server returned HTTP " + responseCode);
                        conn.disconnect();
                        if (onComplete != null) mainHandler.post(onComplete);
                        return;
                    }

                    try (InputStream in = new BufferedInputStream(conn.getInputStream());
                         OutputStream out = new FileOutputStream(localFile)) {
                        byte[] buffer = new byte[8192];
                        int bytesRead;
                        while ((bytesRead = in.read(buffer)) != -1) {
                            out.write(buffer, 0, bytesRead);
                        }
                        out.flush();
                    }
                    conn.disconnect();
                }

                final File fileToPlay = localFile;

                mainHandler.post(() -> {
                    try {
                        synchronized (AudioEngine.class) {
                            mediaPlayer = new MediaPlayer();

                            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                                    .build();
                            mediaPlayer.setAudioAttributes(audioAttributes);

                            if (fileToPlay != null && fileToPlay.exists() && fileToPlay.length() > 0) {
                                FileInputStream fis = new FileInputStream(fileToPlay);
                                mediaPlayer.setDataSource(fis.getFD());
                                fis.close();
                            } else {
                                mediaPlayer.setDataSource(url);
                            }

                            mediaPlayer.setOnPreparedListener(mp -> {
                                try {
                                    // 1. Duck background music (Yuma/Spotify) ONLY AT THIS EXACT MOMENT!
                                    requestDuckingFocus(audioAttributes);

                                    // 2. Hardware LoudnessEnhancer +15 dB boost
                                    try {
                                        int sessionId = mp.getAudioSessionId();
                                        if (sessionId != 0) {
                                            loudnessEnhancer = new LoudnessEnhancer(sessionId);
                                            loudnessEnhancer.setTargetGain(TARGET_GAIN_MB);
                                            loudnessEnhancer.setEnabled(true);
                                            Log.d(TAG, "LoudnessEnhancer applied (+15 dB)");
                                        }
                                    } catch (Exception e) {
                                        Log.w(TAG, "Could not initialize LoudnessEnhancer", e);
                                    }

                                    // 3. Immediately start speech without any delay
                                    mp.setVolume(1.0f, 1.0f);
                                    mp.start();
                                    isPlaying = true;
                                    Log.d(TAG, "Speech started instantly alongside music ducking");
                                } catch (Exception e) {
                                    Log.e(TAG, "Error starting MediaPlayer in onPrepared", e);
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
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Exception initializing MediaPlayer", e);
                        cleanup();
                        if (onComplete != null) onComplete.run();
                    }
                });

            } catch (Exception e) {
                Log.e(TAG, "Error downloading TTS audio", e);
                cleanup();
                if (onComplete != null) mainHandler.post(onComplete);
            }
        });
    }

    private static void requestDuckingFocus(AudioAttributes audioAttributes) {
        if (audioManager == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                        .setAudioAttributes(audioAttributes)
                        .setAcceptsDelayedFocusGain(false)
                        .setWillPauseWhenDucked(false)
                        .setOnAudioFocusChangeListener(focusChange -> Log.d(TAG, "AudioFocus change: " + focusChange))
                        .build();
                int res = audioManager.requestAudioFocus(audioFocusRequest);
                Log.d(TAG, "AudioFocus requested (TRANSIENT_MAY_DUCK), result=" + res);
            } else {
                audioManager.requestAudioFocus(
                        focusChange -> Log.d(TAG, "AudioFocus change: " + focusChange),
                        AudioManager.STREAM_MUSIC,
                        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
                );
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed requesting audio focus ducking", e);
        }
    }

    public static synchronized void cleanup() {
        try {
            if (audioManager != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
                    audioManager.abandonAudioFocusRequest(audioFocusRequest);
                    audioFocusRequest = null;
                    Log.d(TAG, "Abandoned audio focus request (music volume restored)");
                } else if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
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
