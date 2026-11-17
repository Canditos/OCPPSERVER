package com.gatoescondido.runner;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.AudioPlaybackConfiguration;
import android.media.MediaPlayer;
import android.media.audiofx.LoudnessEnhancer;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public class AudioEngine {
    private static final String TAG = "NS_AudioEngine";
    private static MediaPlayer mediaPlayer = null;
    private static LoudnessEnhancer loudnessEnhancer = null;
    private static AudioFocusRequest audioFocusRequest = null;
    private static AudioManager audioManager = null;
    private static boolean isPlaying = false;
    private static final ExecutorService downloadExecutor = Executors.newCachedThreadPool();
    private static Future<?> currentDownloadTask = null;
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());

    // Boost vocal guidance by +15 dB (1500 mB) over background audio/music
    private static final int TARGET_GAIN_MB = 1500;

    /**
     * Checks if another voice app (e.g. Huawei Health watch voice cue, assistant, phone call,
     * or navigation guidance) is currently speaking over the audio system.
     * Pure background music (Spotify, YouTube Music, etc.) is NOT treated as voice.
     */
    public static boolean isOtherVoiceOrCallActive(Context context) {
        if (audioManager == null && context != null) {
            audioManager = (AudioManager) context.getApplicationContext().getSystemService(Context.AUDIO_SERVICE);
        }
        if (audioManager == null) return false;

        // 1. Check if device is in a call or communication mode (e.g. Bluetooth SCO from watch)
        try {
            int mode = audioManager.getMode();
            if (mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_IN_COMMUNICATION) {
                Log.i(TAG, "Device in communication/call mode (" + mode + "), other voice active");
                return true;
            }
        } catch (Exception ignored) {}

        // 2. Check active playback configurations for another speech/guidance/notification session
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                List<AudioPlaybackConfiguration> configs = audioManager.getActivePlaybackConfigurations();
                if (configs != null) {
                    for (AudioPlaybackConfiguration apc : configs) {
                        AudioAttributes attrs = apc.getAudioAttributes();
                        if (attrs != null) {
                            int usage = attrs.getUsage();
                            int contentType = attrs.getContentType();

                            // Speech or vocal guidance/notifications from watch or system
                            boolean isSpeech = (contentType == AudioAttributes.CONTENT_TYPE_SPEECH);
                            boolean isGuidanceOrAssistant = (usage == AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE
                                    || usage == AudioAttributes.USAGE_ASSISTANT
                                    || usage == AudioAttributes.USAGE_VOICE_COMMUNICATION
                                    || usage == AudioAttributes.USAGE_NOTIFICATION
                                    || usage == AudioAttributes.USAGE_ASSISTANCE_SONIFICATION
                                    || usage == AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY);

                            // Background music (Spotify, YouTube Music) has usage USAGE_MEDIA and contentType MUSIC
                            boolean isPureMusic = (usage == AudioAttributes.USAGE_MEDIA && contentType == AudioAttributes.CONTENT_TYPE_MUSIC);

                            if ((isSpeech || isGuidanceOrAssistant) && !isPureMusic) {
                                Log.i(TAG, "Another vocal session detected: usage=" + usage + ", contentType=" + contentType);
                                return true;
                            }
                        }
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Error checking active playback configurations", e);
            }
        }
        return false;
    }

    /**
     * Plays vocal guidance:
     * 1. Detects if Huawei Watch or other voice cue is speaking: postpones instead of overlapping.
     * 2. Auto-resolves relative URLs to full HTTPS.
     * 3. Checks disk cache first: if already downloaded, plays in 5ms without network delay.
     * 4. Buffers/downloads audio in background while background music plays at 100% normal volume.
     * 5. Ducks background music smoothly (Spotify/Yuma) only when speech starts.
     * 6. Pauses gracefully if watch interrupts mid-sentence, resumes after watch finishes.
     * 7. Abandons focus immediately on speech completion to restore music smoothly to 100%.
     */
    public static synchronized void playVoice(Context context, String rawUrl, Runnable onComplete) {
        playVoiceWithRetry(context, rawUrl, onComplete, 0);
    }

    private static synchronized void playVoiceWithRetry(Context context, String rawUrl, Runnable onComplete, int retryCount) {
        cleanup();

        final Context appContext = context.getApplicationContext();
        audioManager = (AudioManager) appContext.getSystemService(Context.AUDIO_SERVICE);

        // Avoid speaking over Huawei watch or other speech cues: retry up to 5 times (total ~12.5s)
        if (isOtherVoiceOrCallActive(appContext)) {
            if (retryCount < 5) {
                Log.i(TAG, "Watch/system voice cue currently active! Postponing runner speech by 2.5s (retry " + (retryCount + 1) + "/5)");
                mainHandler.postDelayed(() -> playVoiceWithRetry(appContext, rawUrl, onComplete, retryCount + 1), 2500);
                return;
            } else {
                Log.w(TAG, "Max retries reached waiting for other voice to clear; proceeding cautiously.");
            }
        }

        // 1. Resolve relative URLs (e.g. /api/tts?...) to full HTTPS URL
        String resolved = rawUrl != null ? rawUrl.trim() : "";
        if (resolved.startsWith("/")) {
            resolved = "https://runner.gatoescondido.com" + resolved;
        }
        final String finalUrl = resolved;

        if (finalUrl.isEmpty()) {
            Log.w(TAG, "Empty URL passed to playVoice");
            if (onComplete != null) onComplete.run();
            return;
        }

        // 2. Check local disk cache
        String cacheKey = "tts_" + Math.abs(finalUrl.hashCode()) + ".mp3";
        final File cacheFile = new File(appContext.getCacheDir(), cacheKey);

        if (cacheFile.exists() && cacheFile.length() > 200) {
            Log.d(TAG, "Audio cache hit for: " + cacheFile.getName());
            startPlayback(appContext, cacheFile.getAbsolutePath(), onComplete);
            return;
        }

        // 3. Download in background while music keeps playing normally at 100%
        currentDownloadTask = downloadExecutor.submit(() -> {
            File tempFile = null;
            boolean downloaded = false;
            try {
                if (finalUrl.startsWith("http://") || finalUrl.startsWith("https://")) {
                    tempFile = new File(appContext.getCacheDir(), "dl_" + System.currentTimeMillis() + ".tmp");
                    URL u = new URL(finalUrl);
                    HttpURLConnection conn = (HttpURLConnection) u.openConnection();
                    conn.setConnectTimeout(6000);
                    conn.setReadTimeout(10000);
                    conn.setRequestProperty("User-Agent", "NS-Runner-Android");
                    conn.connect();

                    int responseCode = conn.getResponseCode();
                    if (responseCode == HttpURLConnection.HTTP_OK) {
                        try (InputStream in = new BufferedInputStream(conn.getInputStream());
                             OutputStream out = new FileOutputStream(tempFile)) {
                            byte[] buffer = new byte[8192];
                            int bytesRead;
                            while ((bytesRead = in.read(buffer)) != -1) {
                                out.write(buffer, 0, bytesRead);
                            }
                            out.flush();
                        }
                        if (tempFile.exists() && tempFile.length() > 200) {
                            if (tempFile.renameTo(cacheFile)) {
                                downloaded = true;
                            }
                        }
                    } else {
                        Log.e(TAG, "TTS server returned HTTP " + responseCode);
                    }
                    conn.disconnect();
                }
            } catch (Exception e) {
                Log.w(TAG, "Download error, will attempt direct streaming fallback", e);
                if (tempFile != null && tempFile.exists()) {
                    try { tempFile.delete(); } catch (Exception ignored) {}
                }
            }

            final String sourceToPlay = (downloaded && cacheFile.exists())
                    ? cacheFile.getAbsolutePath()
                    : finalUrl;

            mainHandler.post(() -> startPlayback(appContext, sourceToPlay, onComplete));
        });
    }

    private static synchronized void startPlayback(Context context, String source, Runnable onComplete) {
        try {
            cleanup();
            mediaPlayer = new MediaPlayer();

            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();
            mediaPlayer.setAudioAttributes(audioAttributes);
            mediaPlayer.setDataSource(source);

            mediaPlayer.setOnPreparedListener(mp -> {
                try {
                    // Double check before starting playback so we never speak over watch
                    if (isOtherVoiceOrCallActive(context)) {
                        Log.i(TAG, "Other voice became active before speech onset! Waiting 2s...");
                        mainHandler.postDelayed(() -> {
                            if (mediaPlayer != null) {
                                try {
                                    requestDuckingFocus(audioAttributes);
                                    mp.setVolume(1.0f, 1.0f);
                                    mp.start();
                                    isPlaying = true;
                                    Log.d(TAG, "Speech started after brief deferral");
                                } catch (Exception ex) {
                                    cleanup();
                                    if (onComplete != null) onComplete.run();
                                }
                            }
                        }, 2000);
                        return;
                    }

                    // 1. Duck background music (Spotify/Yuma) ONLY AT THIS EXACT MOMENT!
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

        } catch (Exception e) {
            Log.e(TAG, "Exception initializing MediaPlayer with source: " + source, e);
            cleanup();
            if (onComplete != null) onComplete.run();
        }
    }

    private static void requestDuckingFocus(AudioAttributes audioAttributes) {
        if (audioManager == null) return;
        try {
            AudioManager.OnAudioFocusChangeListener focusChangeListener = focusChange -> {
                Log.d(TAG, "AudioFocus change: " + focusChange);
                if (focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT || focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
                    // Another transient app (e.g. Huawei Watch) took focus mid-sentence!
                    // Pause playback so we never speak over the watch
                    try {
                        if (mediaPlayer != null && mediaPlayer.isPlaying()) {
                            mediaPlayer.pause();
                            Log.d(TAG, "Paused runner speech because another app took transient audio focus");
                        }
                    } catch (Exception ignored) {}
                } else if (focusChange == AudioManager.AUDIOFOCUS_GAIN) {
                    // Regained focus after watch finishes! Resume our speech cleanly
                    try {
                        if (mediaPlayer != null && !mediaPlayer.isPlaying() && isPlaying) {
                            mediaPlayer.start();
                            Log.d(TAG, "Resumed runner speech after regaining audio focus");
                        }
                    } catch (Exception ignored) {}
                } else if (focusChange == AudioManager.AUDIOFOCUS_LOSS) {
                    cleanup();
                }
            };

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                        .setAudioAttributes(audioAttributes)
                        .setAcceptsDelayedFocusGain(false)
                        .setWillPauseWhenDucked(false)
                        .setOnAudioFocusChangeListener(focusChangeListener)
                        .build();
                int res = audioManager.requestAudioFocus(audioFocusRequest);
                Log.d(TAG, "AudioFocus requested (TRANSIENT_MAY_DUCK), result=" + res);
            } else {
                audioManager.requestAudioFocus(
                        focusChangeListener,
                        AudioManager.STREAM_MUSIC,
                        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
                );
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed requesting audio focus ducking", e);
        }
    }

    public static synchronized void cleanup() {
        if (currentDownloadTask != null) {
            try {
                currentDownloadTask.cancel(true);
            } catch (Exception ignored) {}
            currentDownloadTask = null;
        }

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
