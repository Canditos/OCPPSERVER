package com.gatoescondido.runner;

import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "VoiceAudio")
public class VoiceAudioPlugin extends Plugin {
    private static final String TAG = "VoiceAudioPlugin";
    private MediaPlayer mediaPlayer = null;

    @PluginMethod
    public void startWorkout(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                Intent serviceIntent = new Intent(getContext(), RunnerService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    getContext().startForegroundService(serviceIntent);
                } else {
                    getContext().startService(serviceIntent);
                }
                JSObject ret = new JSObject();
                ret.put("started", true);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Failed to start RunnerService in plugin", e);
                call.reject("Start service failed: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stopWorkout(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                Intent serviceIntent = new Intent(getContext(), RunnerService.class);
                serviceIntent.setAction("STOP");
                getContext().startService(serviceIntent);
                JSObject ret = new JSObject();
                ret.put("stopped", true);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Failed to stop RunnerService in plugin", e);
                call.reject("Stop service failed: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("URL is required");
            return;
        }

        getActivity().runOnUiThread(() -> {
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

                // Play as assistant sonification without requesting exclusive audio focus
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
                        Log.d(TAG, "Native MediaPlayer started speech seamlessly over music");
                    } catch (Exception e) {
                        Log.e(TAG, "Error starting MediaPlayer", e);
                        call.reject("Start failed: " + e.getMessage());
                    }
                });

                mediaPlayer.setOnCompletionListener(mp -> {
                    try {
                        mp.release();
                        mediaPlayer = null;
                    } catch (Exception ignored) {}
                    JSObject ret = new JSObject();
                    ret.put("completed", true);
                    call.resolve(ret);
                });

                mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                    try {
                        mp.release();
                        mediaPlayer = null;
                    } catch (Exception ignored) {}
                    call.reject("MediaPlayer error: " + what);
                    return true;
                });

                mediaPlayer.prepareAsync();

            } catch (Exception e) {
                Log.e(TAG, "Exception in play", e);
                call.reject("Play exception: " + e.getMessage());
            }
        });
    }
}
