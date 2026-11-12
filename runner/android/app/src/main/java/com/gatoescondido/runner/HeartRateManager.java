package com.gatoescondido.runner;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanRecord;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@SuppressLint("MissingPermission")
public class HeartRateManager {
    private static final String TAG = "HeartRateManager";

    public static final UUID UUID_HR_SERVICE = UUID.fromString("0000180d-0000-1000-8000-00805f9b34fb");
    public static final UUID UUID_HR_MEASUREMENT = UUID.fromString("00002a37-0000-1000-8000-00805f9b34fb");
    public static final UUID UUID_CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private static volatile HeartRateManager instance = null;
    private final Context appContext;
    private final Handler mainHandler;

    private BluetoothGatt bluetoothGatt = null;
    private BluetoothDevice connectedDevice = null;
    private boolean isScanning = false;
    private boolean isConnected = false;
    private int latestBpm = 0;
    private long lastReadingTime = 0;
    private String connectedDeviceName = "";

    public interface HeartRateListener {
        void onHeartRateUpdate(int bpm, String deviceName);
        void onConnectionStateChange(boolean connected, String deviceName);
    }

    private final List<HeartRateListener> listeners = new ArrayList<>();

    public static HeartRateManager getInstance(Context context) {
        if (instance == null) {
            synchronized (HeartRateManager.class) {
                if (instance == null) {
                    instance = new HeartRateManager(context.getApplicationContext());
                }
            }
        }
        return instance;
    }

    private HeartRateManager(Context context) {
        this.appContext = context;
        this.mainHandler = new Handler(Looper.getMainLooper());
    }

    public synchronized void addListener(HeartRateListener listener) {
        if (listener != null && !listeners.contains(listener)) {
            listeners.add(listener);
        }
    }

    public synchronized void removeListener(HeartRateListener listener) {
        listeners.remove(listener);
    }

    public int getLatestBpm() {
        if (System.currentTimeMillis() - lastReadingTime > 60000) {
            return 0;
        }
        return latestBpm;
    }

    public boolean isConnected() {
        return isConnected && bluetoothGatt != null;
    }

    public String getConnectedDeviceName() {
        return connectedDeviceName;
    }

    /**
     * Starts discovering Heart Rate peripherals:
     * Broadcasts discovered devices in real time to WebView.
     */
    public synchronized void startConnect(String preferredName) {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            Log.w(TAG, "Bluetooth not enabled");
            notifyState(false, "Bluetooth Desativado");
            return;
        }

        // Notify bonded devices first for quick display in UI list
        Set<BluetoothDevice> bonded = adapter.getBondedDevices();
        if (bonded != null) {
            for (BluetoothDevice dev : bonded) {
                String name = dev.getName();
                if (name != null && !name.isEmpty()) {
                    boolean isFitness = name.toUpperCase().contains("HUAWEI") ||
                                       name.toUpperCase().contains("WATCH") ||
                                       name.toUpperCase().contains("GT") ||
                                       name.toUpperCase().contains("POLAR") ||
                                       name.toUpperCase().contains("GARMIN") ||
                                       name.toUpperCase().contains("HRM");
                    MainActivity.notifyDiscoveredDevice(name, dev.getAddress(), -50, isFitness);
                }
            }
        }

        // Always run active BLE scan to find the live HR broadcast
        startBleScan(preferredName);
    }

    public synchronized void connectDeviceByAddress(String address) {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !adapter.isEnabled() || address == null || address.isEmpty()) return;
        try {
            stopBleScan();
            BluetoothDevice device = adapter.getRemoteDevice(address);
            if (device != null) {
                connectToDevice(device);
            }
        } catch (Exception e) {
            Log.e(TAG, "connectDeviceByAddress error", e);
            notifyState(false, "Erro ao ligar ao dispositivo selecionado");
        }
    }

    private synchronized void connectToDevice(BluetoothDevice device) {
        disconnect();
        connectedDevice = device;
        connectedDeviceName = device.getName() != null ? device.getName() : "Sensor Cardíaco";
        Log.d(TAG, "Connecting to GATT on: " + connectedDeviceName + " [" + device.getAddress() + "]");
        notifyState(false, "A ligar a " + connectedDeviceName + "...");

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                bluetoothGatt = device.connectGatt(appContext, false, gattCallback, BluetoothDevice.TRANSPORT_LE);
            } else {
                bluetoothGatt = device.connectGatt(appContext, false, gattCallback);
            }
        } catch (Exception e) {
            Log.e(TAG, "connectGatt error", e);
            notifyState(false, "Erro na ligação GATT");
        }
    }

    private void startBleScan(String preferredName) {
        if (isScanning) return;
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !adapter.isEnabled()) return;

        BluetoothLeScanner scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) {
            Log.w(TAG, "BluetoothLeScanner not available");
            return;
        }

        isScanning = true;
        Log.d(TAG, "Starting BLE scan for Heart Rate devices...");
        notifyState(false, "A pesquisar dispositivos Bluetooth...");

        // Scan without restrictive filters so we receive all advertising wearables
        List<ScanFilter> filters = new ArrayList<>();

        ScanSettings settings = new ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .build();

        try {
            scanner.startScan(filters, settings, scanCallback);
            // Stop scanning after 18 seconds if user doesn't pick
            mainHandler.postDelayed(() -> {
                if (isScanning) {
                    stopBleScan();
                    if (!isConnected) {
                        notifyState(false, "Pesquisa concluída. Verifica se a 'Transmissão da FC' está ligada no relógio.");
                    }
                }
            }, 18000);
        } catch (Exception e) {
            Log.e(TAG, "startScan error", e);
            isScanning = false;
        }
    }

    public synchronized void stopBleScan() {
        if (!isScanning) return;
        isScanning = false;
        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter != null && adapter.getBluetoothLeScanner() != null) {
                adapter.getBluetoothLeScanner().stopScan(scanCallback);
            }
        } catch (Exception ignored) {}
    }

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            if (result == null || result.getDevice() == null) return;
            BluetoothDevice device = result.getDevice();
            ScanRecord record = result.getScanRecord();

            String name = device.getName();
            if (name == null && record != null) {
                name = record.getDeviceName();
            }
            if (name == null || name.trim().isEmpty()) {
                return; // skip unnamed raw beacons
            }
            name = name.trim();

            boolean hasHrService = false;
            if (record != null && record.getServiceUuids() != null) {
                for (ParcelUuid pu : record.getServiceUuids()) {
                    if (pu != null && UUID_HR_SERVICE.equals(pu.getUuid())) {
                        hasHrService = true;
                        break;
                    }
                }
            }

            int rssi = result.getRssi();
            MainActivity.notifyDiscoveredDevice(name, device.getAddress(), rssi, hasHrService);

            // Auto-connect if it explicitly broadcasts Heart Rate Service or is the Huawei Watch
            boolean isTargetWatch = name.toUpperCase().contains("HUAWEI") &&
                                   (name.toUpperCase().contains("WATCH") || name.toUpperCase().contains("GT"));
            if ((hasHrService || isTargetWatch) && !isConnected && bluetoothGatt == null) {
                Log.d(TAG, "Auto-connecting to candidate HR device: " + name + " [" + device.getAddress() + "]");
                stopBleScan();
                connectToDevice(device);
            }
        }

        @Override
        public void onScanFailed(int errorCode) {
            Log.w(TAG, "BLE scan failed with code: " + errorCode);
            isScanning = false;
            notifyState(false, "Falha ao iniciar pesquisa Bluetooth (" + errorCode + ")");
        }
    };

    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
            Log.d(TAG, "GATT connection state: status=" + status + ", newState=" + newState);
            if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
                Log.d(TAG, "Connected to GATT server, discovering services...");
                notifyState(false, "Ligado. A obter ritmo cardíaco...");
                mainHandler.postDelayed(() -> {
                    if (bluetoothGatt != null) {
                        bluetoothGatt.discoverServices();
                    }
                }, 400);
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                Log.d(TAG, "Disconnected from GATT");
                isConnected = false;
                latestBpm = 0;
                notifyState(false, "Desconectado");
                try {
                    gatt.close();
                } catch (Exception ignored) {}
                if (bluetoothGatt == gatt) {
                    bluetoothGatt = null;
                }
            }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt gatt, int status) {
            Log.d(TAG, "Services discovered with status: " + status);
            if (status == BluetoothGatt.GATT_SUCCESS) {
                BluetoothGattCharacteristic hrChar = null;

                // 1. Look under official Heart Rate service 0x180D
                BluetoothGattService hrService = gatt.getService(UUID_HR_SERVICE);
                if (hrService != null) {
                    hrChar = hrService.getCharacteristic(UUID_HR_MEASUREMENT);
                }

                // 2. Search all services for 0x2A37 if not found under 0x180D
                if (hrChar == null) {
                    for (BluetoothGattService s : gatt.getServices()) {
                        for (BluetoothGattCharacteristic c : s.getCharacteristics()) {
                            if (UUID_HR_MEASUREMENT.equals(c.getUuid())) {
                                hrChar = c;
                                break;
                            }
                        }
                        if (hrChar != null) break;
                    }
                }

                if (hrChar != null) {
                    enableHrNotifications(gatt, hrChar);
                    isConnected = true;
                    notifyState(true, connectedDeviceName);
                } else {
                    Log.w(TAG, "Heart Rate measurement characteristic 0x2A37 not found on " + connectedDeviceName);
                    notifyState(false, "Ativa 'Transmissão da FC' no relógio!");
                    disconnect();
                    // Resume scanning to catch the watch once broadcast is started on the watch
                    mainHandler.postDelayed(() -> {
                        if (!isConnected && !isScanning) {
                            startBleScan("");
                        }
                    }, 2500);
                }
            } else {
                Log.w(TAG, "discoverServices failed with status=" + status);
                notifyState(false, "Erro ao descobrir serviços");
                disconnect();
            }
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
            if (UUID_HR_MEASUREMENT.equals(characteristic.getUuid())) {
                parseHeartRateData(characteristic.getValue());
            }
        }

        // Android 13+ (API 33+) callback override
        public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, byte[] value) {
            if (UUID_HR_MEASUREMENT.equals(characteristic.getUuid())) {
                parseHeartRateData(value);
            }
        }
    };

    private void enableHrNotifications(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
        boolean success = gatt.setCharacteristicNotification(characteristic, true);
        Log.d(TAG, "setCharacteristicNotification success=" + success);

        BluetoothGattDescriptor descriptor = characteristic.getDescriptor(UUID_CCCD);
        if (descriptor != null) {
            descriptor.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
            gatt.writeDescriptor(descriptor);
            Log.d(TAG, "Wrote CCCD descriptor to enable HR streaming");
        }
    }

    private void parseHeartRateData(byte[] data) {
        if (data == null || data.length < 2) return;
        int flags = data[0] & 0xFF;
        int bpm;
        if ((flags & 0x01) != 0) {
            bpm = (data[1] & 0xFF) | ((data[2] & 0xFF) << 8);
        } else {
            bpm = data[1] & 0xFF;
        }

        if (bpm > 30 && bpm < 255) {
            latestBpm = bpm;
            lastReadingTime = System.currentTimeMillis();
            notifyHeartRate(bpm, connectedDeviceName);
        }
    }

    private void notifyState(boolean connected, String deviceName) {
        mainHandler.post(() -> {
            for (HeartRateListener l : listeners) {
                try { l.onConnectionStateChange(connected, deviceName); } catch (Exception ignored) {}
            }
            MainActivity.notifyHeartRateStatus(connected, deviceName, latestBpm);
        });
    }

    private void notifyHeartRate(int bpm, String deviceName) {
        mainHandler.post(() -> {
            for (HeartRateListener l : listeners) {
                try { l.onHeartRateUpdate(bpm, deviceName); } catch (Exception ignored) {}
            }
            MainActivity.notifyHeartRate(bpm, deviceName);
        });
    }

    public synchronized void disconnect() {
        if (bluetoothGatt != null) {
            try {
                bluetoothGatt.disconnect();
                bluetoothGatt.close();
            } catch (Exception ignored) {}
            bluetoothGatt = null;
        }
        connectedDevice = null;
        isConnected = false;
        latestBpm = 0;
    }

    public JSONObject getStatusJson() {
        JSONObject obj = new JSONObject();
        try {
            obj.put("connected", isConnected());
            obj.put("bpm", getLatestBpm());
            obj.put("deviceName", connectedDeviceName);
        } catch (Exception ignored) {}
        return obj;
    }
}
