package com.gatoescondido.runner;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;
import android.view.KeyEvent;
import android.webkit.JavascriptInterface;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.lang.ref.WeakReference;
import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "NS_MainActivity";
    private static WeakReference<MainActivity> currentActivityRef = null;
    private AudioDeviceCallback audioDeviceCallback = null;
    private SpeechRecognizer speechRecognizer = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VoiceAudioPlugin.class);
        super.onCreate(savedInstanceState);
        currentActivityRef = new WeakReference<>(this);

        requestPermissions();
        initAudioDeviceMonitoring();
        initSpeechRecognizer();

        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().addJavascriptInterface(new AudioBridge(), "AndroidVoice");
                getBridge().getWebView().setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                    } catch (Exception e) {
                        Log.e(TAG, "DownloadListener error", e);
                    }
                });
                Log.d(TAG, "AndroidVoice JavascriptInterface & DownloadListener registered successfully");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to register AndroidVoice interface", e);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        currentActivityRef = new WeakReference<>(this);
        broadcastAudioOutputStatus();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        try {
            if (audioDeviceCallback != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    am.unregisterAudioDeviceCallback(audioDeviceCallback);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error unregistering AudioDeviceCallback", e);
        }

        try {
            if (speechRecognizer != null) {
                speechRecognizer.destroy();
                speechRecognizer = null;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error destroying speechRecognizer", e);
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_MEDIA_NEXT ||
            keyCode == KeyEvent.KEYCODE_MEDIA_PREVIOUS ||
            keyCode == KeyEvent.KEYCODE_HEADSETHOOK ||
            keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) {
            Log.d(TAG, "Headset media button key event detected: " + keyCode);
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().post(() ->
                    getBridge().getWebView().evaluateJavascript("if(window._onHeadsetButton) window._onHeadsetButton();", null));
            }
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private void requestPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) { // Android 13+
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) { // Android 12+
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.BLUETOOTH_CONNECT}, 102);
            }
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.RECORD_AUDIO}, 103);
        }
    }

    private void initAudioDeviceMonitoring() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    audioDeviceCallback = new AudioDeviceCallback() {
                        @Override
                        public void onAudioDevicesAdded(AudioDeviceInfo[] addedDevices) {
                            Log.d(TAG, "Audio devices added, notifying webview");
                            broadcastAudioOutputStatus();
                        }

                        @Override
                        public void onAudioDevicesRemoved(AudioDeviceInfo[] removedDevices) {
                            Log.d(TAG, "Audio devices removed, notifying webview");
                            broadcastAudioOutputStatus();
                        }
                    };
                    am.registerAudioDeviceCallback(audioDeviceCallback, null);
                    Log.d(TAG, "Registered AudioDeviceCallback");
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to register AudioDeviceCallback", e);
            }
        }
    }

    public JSONObject getAudioOutputStatusJson() {
        JSONObject result = new JSONObject();
        boolean isBluetooth = false;
        boolean isWired = false;
        String deviceName = "";

        try {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    AudioDeviceInfo[] devices = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
                    if (devices != null) {
                        for (AudioDeviceInfo dev : devices) {
                            int type = dev.getType();
                            boolean bt = (type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP || 
                                          type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO);
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                if (type == AudioDeviceInfo.TYPE_BLE_HEADSET || 
                                    type == AudioDeviceInfo.TYPE_BLE_SPEAKER) {
                                    bt = true;
                                }
                            }
                            if (Build.VERSION.SDK_INT >= 33) {
                                if (type == AudioDeviceInfo.TYPE_BLE_BROADCAST) {
                                    bt = true;
                                }
                            }

                            if (bt) {
                                isBluetooth = true;
                                try {
                                    CharSequence name = dev.getProductName();
                                    if (name != null && name.length() > 0 && !name.toString().equalsIgnoreCase("speaker")) {
                                        deviceName = name.toString();
                                    }
                                } catch (Exception ignored) {}
                                break;
                            }

                            if (type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                                type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
                                type == AudioDeviceInfo.TYPE_USB_HEADSET) {
                                isWired = true;
                                try {
                                    CharSequence name = dev.getProductName();
                                    if (name != null && name.length() > 0) {
                                        deviceName = name.toString();
                                    }
                                } catch (Exception ignored) {}
                            }
                        }
                    }
                } else {
                    if (am.isBluetoothA2dpOn() || am.isBluetoothScoOn()) {
                        isBluetooth = true;
                    } else if (am.isWiredHeadsetOn()) {
                        isWired = true;
                    }
                }
            }

            result.put("connected", isBluetooth || isWired);
            result.put("isBluetooth", isBluetooth);
            result.put("isWired", isWired);
            result.put("deviceName", deviceName);
        } catch (Exception e) {
            Log.e(TAG, "Error checking audio output status", e);
        }
        return result;
    }

    public void broadcastAudioOutputStatus() {
        try {
            final JSONObject status = getAudioOutputStatusJson();
            runOnUiThread(() -> {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    String js = "if(window._onAudioOutputUpdate) { window._onAudioOutputUpdate(" + status.toString() + "); }";
                    getBridge().getWebView().evaluateJavascript(js, null);
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "broadcastAudioOutputStatus error", e);
        }
    }

    private void initSpeechRecognizer() {
        runOnUiThread(() -> {
            try {
                if (SpeechRecognizer.isRecognitionAvailable(this)) {
                    speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
                    speechRecognizer.setRecognitionListener(new RecognitionListener() {
                        @Override
                        public void onReadyForSpeech(Bundle params) {
                            Log.d(TAG, "SpeechRecognizer ready");
                            notifySpeechState("listening");
                        }
                        @Override
                        public void onBeginningOfSpeech() {}
                        @Override
                        public void onRmsChanged(float rmsdB) {}
                        @Override
                        public void onBufferReceived(byte[] buffer) {}
                        @Override
                        public void onEndOfSpeech() {
                            notifySpeechState("processing");
                        }
                        @Override
                        public void onError(int error) {
                            Log.w(TAG, "SpeechRecognizer error: " + error);
                            notifySpeechState("error");
                        }
                        @Override
                        public void onResults(Bundle results) {
                            ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                            if (matches != null && !matches.isEmpty()) {
                                String text = matches.get(0);
                                Log.d(TAG, "Speech recognized: " + text);
                                notifySpeechResult(text);
                            } else {
                                notifySpeechState("idle");
                            }
                        }
                        @Override
                        public void onPartialResults(Bundle partialResults) {}
                        @Override
                        public void onEvent(int eventType, Bundle params) {}
                    });
                    Log.d(TAG, "SpeechRecognizer initialized successfully");
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to initialize SpeechRecognizer", e);
            }
        });
    }

    public void startListening(String language) {
        runOnUiThread(() -> {
            try {
                if (speechRecognizer == null) {
                    initSpeechRecognizer();
                }
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language != null && !language.isEmpty() ? language : "pt-PT");
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                speechRecognizer.startListening(intent);
                notifySpeechState("listening");
            } catch (Exception e) {
                Log.e(TAG, "startListening error", e);
                notifySpeechState("error");
            }
        });
    }

    public void stopListening() {
        runOnUiThread(() -> {
            try {
                if (speechRecognizer != null) {
                    speechRecognizer.stopListening();
                }
                notifySpeechState("idle");
            } catch (Exception ignored) {}
        });
    }

    private void notifySpeechState(String state) {
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() -> {
                String js = "if(window._onSpeechState) window._onSpeechState('" + state + "');";
                getBridge().getWebView().evaluateJavascript(js, null);
            });
        }
    }

    private void notifySpeechResult(String text) {
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() -> {
                String escaped = JSONObject.quote(text);
                String js = "if(window._onSpeechResult) window._onSpeechResult(" + escaped + ");";
                getBridge().getWebView().evaluateJavascript(js, null);
            });
        }
    }

    public static void notifyReading(JSONObject readingData) {
        try {
            if (currentActivityRef != null && currentActivityRef.get() != null) {
                MainActivity act = currentActivityRef.get();
                if (act.getBridge() != null && act.getBridge().getWebView() != null) {
                    act.runOnUiThread(() -> {
                        String js = "if(window._onNativeWorkoutReading) { window._onNativeWorkoutReading(" + readingData.toString() + "); }";
                        act.getBridge().getWebView().evaluateJavascript(js, null);
                    });
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error in notifyReading", e);
        }
    }

    public static void notifyWorkoutStopped() {
        try {
            if (currentActivityRef != null && currentActivityRef.get() != null) {
                MainActivity act = currentActivityRef.get();
                if (act.getBridge() != null && act.getBridge().getWebView() != null) {
                    act.runOnUiThread(() -> {
                        String js = "if(window._onNativeWorkoutStopped) { window._onNativeWorkoutStopped(); }";
                        act.getBridge().getWebView().evaluateJavascript(js, null);
                    });
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error in notifyWorkoutStopped", e);
        }
    }

    public class AudioBridge {
        @JavascriptInterface
        public void playVoice(String url) {
            Log.d(TAG, "playVoice called via JavascriptInterface: " + url);
            runOnUiThread(() -> AudioEngine.playVoice(MainActivity.this, url, () -> {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().post(() ->
                            getBridge().getWebView().evaluateJavascript(
                                    "if(window._onNativeVoiceDone) window._onNativeVoiceDone();", null));
                }
            }));
        }

        @JavascriptInterface
        public void stopVoice() {
            runOnUiThread(AudioEngine::cleanup);
        }

        @JavascriptInterface
        public void startVoiceRecognition(String language) {
            Log.d(TAG, "startVoiceRecognition called via JavascriptInterface with lang=" + language);
            startListening(language);
        }

        @JavascriptInterface
        public void stopVoiceRecognition() {
            stopListening();
        }

        @JavascriptInterface
        public boolean isVoiceRecognitionAvailable() {
            return SpeechRecognizer.isRecognitionAvailable(MainActivity.this);
        }

        @JavascriptInterface
        public void startWorkoutService(int intervalMinutes, String language, String apiBase, int targetMin, int targetMax) {
            Log.d(TAG, "startWorkoutService called via JavascriptInterface with interval=" + intervalMinutes);
            try {
                Intent serviceIntent = new Intent(MainActivity.this, RunnerService.class);
                serviceIntent.putExtra(RunnerService.EXTRA_INTERVAL, intervalMinutes);
                serviceIntent.putExtra(RunnerService.EXTRA_LANG, language);
                serviceIntent.putExtra(RunnerService.EXTRA_API_BASE, apiBase);
                serviceIntent.putExtra(RunnerService.EXTRA_TARGET_MIN, targetMin);
                serviceIntent.putExtra(RunnerService.EXTRA_TARGET_MAX, targetMax);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(serviceIntent);
                } else {
                    startService(serviceIntent);
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to start RunnerService", e);
            }
        }

        @JavascriptInterface
        public void stopWorkoutService() {
            Log.d(TAG, "stopWorkoutService called via JavascriptInterface");
            try {
                RunnerService.stopServiceDirect(MainActivity.this);
            } catch (Exception e) {
                Log.e(TAG, "Failed to stop RunnerService", e);
            }
        }

        @JavascriptInterface
        public boolean isWorkoutRunning() {
            return RunnerService.isRunning();
        }

        @JavascriptInterface
        public String getAudioOutputStatus() {
            return getAudioOutputStatusJson().toString();
        }

        @JavascriptInterface
        public void openDownloadUrl(String url) {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (Exception e) {
                Log.e(TAG, "openDownloadUrl error", e);
            }
        }

        @JavascriptInterface
        public int getNativeVersionCode() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
            } catch (Exception e) {
                return 2;
            }
        }
    }
}
