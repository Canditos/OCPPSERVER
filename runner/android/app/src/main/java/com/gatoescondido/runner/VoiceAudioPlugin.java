package com.gatoescondido.runner;

import android.content.Intent;
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

    @PluginMethod
    public void startWorkout(PluginCall call) {
        int interval = call.getInt("intervalMinutes", 2);
        String lang = call.getString("language", "pt-PT");
        String apiBase = call.getString("apiBase", "https://runner.gatoescondido.com");
        int targetMin = call.getInt("targetMin", 110);
        int targetMax = call.getInt("targetMax", 170);

        getActivity().runOnUiThread(() -> {
            try {
                Intent serviceIntent = new Intent(getContext(), RunnerService.class);
                serviceIntent.putExtra(RunnerService.EXTRA_INTERVAL, interval);
                serviceIntent.putExtra(RunnerService.EXTRA_LANG, lang);
                serviceIntent.putExtra(RunnerService.EXTRA_API_BASE, apiBase);
                serviceIntent.putExtra(RunnerService.EXTRA_TARGET_MIN, targetMin);
                serviceIntent.putExtra(RunnerService.EXTRA_TARGET_MAX, targetMax);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    getContext().startForegroundService(serviceIntent);
                } else {
                    getContext().startService(serviceIntent);
                }
                Log.d(TAG, "RunnerService started via VoiceAudioPlugin with interval=" + interval + "m, lang=" + lang);
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
                RunnerService.stopServiceDirect(getContext());
                Log.d(TAG, "RunnerService stopped via VoiceAudioPlugin");
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

        Log.d(TAG, "VoiceAudioPlugin.play called with url: " + url);

        getActivity().runOnUiThread(() -> {
            AudioEngine.playVoice(getContext(), url, () -> {
                JSObject ret = new JSObject();
                ret.put("completed", true);
                call.resolve(ret);
            });
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            AudioEngine.cleanup();
            JSObject ret = new JSObject();
            ret.put("stopped", true);
            call.resolve(ret);
        });
    }
}
