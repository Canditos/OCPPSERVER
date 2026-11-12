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
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.util.Log;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
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
        // If reading is older than 30 seconds, consider stale
        if (System.currentTimeMillis() - lastReadingTime > 30000) {
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
     * Attempts to connect to a Heart Rate device:
     * 1. Checks bonded (paired) devices first (e.g. "HUAWEI WATCH GT 6 Pro").
     * 2. If not found among bonded, launches a BLE scan for Heart Rate Service 0x180D.
     */
    public synchronized void startConnect(String preferredName) {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            Log.w(TAG, "Bluetooth not enabled");
            notifyState(false, "Bluetooth Desativado");
            return;
        }

        // 1. Look for paired devices that match preferred name or known fitness wearables
        Set<BluetoothDevice> bonded = adapter.getBondedDevices();
        if (bonded != null) {
            for (BluetoothDevice dev : bonded) {
                String name = dev.getName();
                if (name != null) {
                    name = name.trim();
                    boolean match = false;
                    if (preferredName != null && !preferredName.isEmpty() && name.toLowerCase().contains(preferredName.toLowerCase())) {
                        match = true;
                    } else if (name.toUpperCase().contains("HUAWEI WATCH") ||
                               name.toUpperCase().contains("WATCH GT") ||
                               name.toUpperCase().contains("POLAR") ||
                               name.toUpperCase().contains("GARMIN") ||
                               name.toUpperCase().contains("HRM") ||
                               name.toUpperCase().contains("TICKR")) {
                        match = true;
                    }
                    if (match) {
                        Log.d(TAG, "Found paired candidate device: " + name + " [" + dev.getAddress() + "]");
                        connectToDevice(dev);
                        return;
                    }
                }
            }
        }

        // 2. Start BLE scan for devices advertising standard Heart Rate service
        startBleScan();
    }

    private synchronized void connectToDevice(BluetoothDevice device) {
        disconnect();
        connectedDevice = device;
        connectedDeviceName = device.getName() != null ? device.getName() : "Sensor Cardíaco";
        Log.d(TAG, "Connecting to GATT on: " + connectedDeviceName);
        notifyState(false, "A ligar a " + connectedDeviceName + "...");

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                bluetoothGatt = device.connectGatt(appContext, false, gattCallback, BluetoothDevice.TRANSPORT_LE);
            } else {
                bluetoothGatt = device.connectGatt(appContext, false, gattCallback);
            }
        } catch (Exception e) {
            Log.e(TAG, "connectGatt error", e);
            notifyState(false, "Erro ao ligar");
        }
    }

    private void startBleScan() {
        if (isScanning) return;
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !adapter.isEnabled()) return;

        BluetoothLeScanner scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) {
            Log.w(TAG, "BluetoothLeScanner not available");
            return;
        }

        isScanning = true;
        Log.d(TAG, "Starting BLE scan for Heart Rate Service...");
        notifyState(false, "A procurar sensor / relógio...");

        List<ScanFilter> filters = new ArrayList<>();
        filters.add(new ScanFilter.Builder().setServiceUuid(new ParcelUuid(UUID_HR_SERVICE)).build());

        ScanSettings settings = new ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .build();

        try {
            scanner.startScan(filters, settings, scanCallback);
            // Stop scanning after 12 seconds if nothing found
            mainHandler.postDelayed(() -> stopBleScan(scanner), 12000);
        } catch (Exception e) {
            Log.e(TAG, "startScan error", e);
            isScanning = false;
        }
    }

    private void stopBleScan(BluetoothLeScanner scanner) {
        if (!isScanning) return;
        isScanning = false;
        try {
            if (scanner != null) {
                scanner.stopScan(scanCallback);
            }
        } catch (Exception ignored) {}
        if (!isConnected) {
            notifyState(false, "Nenhum sensor encontrado");
        }
    }

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            if (result == null || result.getDevice() == null) return;
            BluetoothDevice device = result.getDevice();
            String name = device.getName();
            Log.d(TAG, "BLE scan found candidate: " + name + " [" + device.getAddress() + "]");
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter != null && adapter.getBluetoothLeScanner() != null) {
                stopBleScan(adapter.getBluetoothLeScanner());
            }
            connectToDevice(device);
        }

        @Override
        public void onScanFailed(int errorCode) {
            Log.w(TAG, "BLE scan failed with code: " + errorCode);
            isScanning = false;
            notifyState(false, "Falha na pesquisa Bluetooth");
        }
    };

    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
            Log.d(TAG, "GATT connection state: status=" + status + ", newState=" + newState);
            if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
                isConnected = true;
                notifyState(true, connectedDeviceName);
                Log.d(TAG, "Connected to GATT, discovering services...");
                // Delay discovery slightly for Huawei firmware stability
                mainHandler.postDelayed(() -> {
                    if (bluetoothGatt != null) {
                        bluetoothGatt.discoverServices();
                    }
                }, 300);
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                Log.d(TAG, "Disconnected from GATT");
                isConnected = false;
                latestBpm = 0;
                notifyState(false, "Desconectado");
                // Auto-reconnect attempt
                if (connectedDevice != null) {
                    mainHandler.postDelayed(() -> {
                        if (!isConnected && connectedDevice != null) {
                            Log.d(TAG, "Attempting auto-reconnect to " + connectedDevice.getName());
                            connectToDevice(connectedDevice);
                        }
                    }, 4000);
                }
            }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt gatt, int status) {
            Log.d(TAG, "Services discovered with status: " + status);
            if (status == BluetoothGatt.GATT_SUCCESS) {
                BluetoothGattService hrService = gatt.getService(UUID_HR_SERVICE);
                if (hrService != null) {
                    BluetoothGattCharacteristic hrChar = hrService.getCharacteristic(UUID_HR_MEASUREMENT);
                    if (hrChar != null) {
                        enableHrNotifications(gatt, hrChar);
                    } else {
                        Log.w(TAG, "Heart rate measurement characteristic not found in service");
                    }
                } else {
                    Log.w(TAG, "Heart rate service 0x180D not found on device");
                }
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
            // 16-bit UINT
            bpm = (data[1] & 0xFF) | ((data[2] & 0xFF) << 8);
        } else {
            // 8-bit UINT
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
