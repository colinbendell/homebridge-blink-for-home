const {describe, expect, test, afterAll} = require('@jest/globals');
const {setLogger} = require('./log');
const logger = {
    log: () => {},
    error: console.error,
};
setLogger(logger, false, false);
const BlinkAPI = require('./blink-api');

const DEFAULT_BLINK_CLIENT_UUID = 'A5BF5C52-56F3-4ADB-A7C2-A70619552084';

const blinkAPI = new BlinkAPI(DEFAULT_BLINK_CLIENT_UUID);

const withAuth = blinkAPI.auth.email ? describe : describe.skip;

const HOMESTREEN_KEYS = [
    'account', 'networks', 'sync_modules', 'cameras', 'sirens', 'chimes', 'video_stats', 'doorbell_buttons', 'owls',
    'doorbells', 'app_updates', 'device_limits', 'whats_new', 'subscriptions', 'entitlements', 'tiv_lock_enable',
    'tiv_lock_status', 'accessories',
];
const ACCOUNT_OBJECT_KEYS = [
    'id', 'created_at', 'updated_at', 'email', 'verified', 'verification_required', 'phone_verified',
    'phone_verification_required', 'verification_channel', 'phone_verification_channel', 'force_password_reset',
    'reset_expiration', 'time_zone', 'owner', 'name', 'user_access', 'temp_units', 'type', 'pin_created_at',
    'pin_failures', 'phone_number', 'country_calling_code', 'locale', 'country_id', 'account_id', 'timezone_id',
];
const ACCOUNT_SHORT_KEYS = ['id', 'email_verified', 'email_verification_required', 'amazon_account_linked'];
const ACCOUNT_OPTION_KEYS = [
    'catalina_app_enabled', 'sm2_app_enabled', 'snapshot_app_enabled', 'advanced_motion_regions',
    'owl_app_enabled', 'c2s_clip_list_limit', 'amazon_account_linking', 'legacy_account_mini',
    'trial_cancellation_enabled', 'amazon_account_linking_enabled', 'breadcrumbs',
];
const NOTIFICATION_KEYS = [
    'low_battery', 'camera_offline', 'camera_usage', 'scheduling', 'scheduling', 'motion',
    'sync_module_offline', 'temperature', 'doorbell', 'wifi', 'lfr', 'bandwidth', 'battery_dead',
    'local_storage', 'accessory_connected', 'accessory_disconnected', 'accessory_low_battery', 'general',
];
const NETWORK_KEYS = [
    'id', 'created_at', 'updated_at', 'name', 'network_key', 'description', 'network_origin', 'locale',
    'time_zone', 'dst', 'ping_interval', 'encryption_key', 'armed', 'autoarm_geo_enable', 'autoarm_time_enable',
    'lv_mode', 'lfr_channel', 'video_destination', 'storage_used', 'storage_total', 'video_count',
    'video_history_count', 'sm_backup_enabled', 'arm_string', 'busy', 'camera_error', 'sync_module_error',
    'feature_plan_id', 'location_id', 'account_id',
];
const NETWORK_SHORT_KEYS = ['id', 'created_at', 'updated_at', 'name', 'time_zone', 'dst', 'armed', 'lv_save'];
const SYNC_MODULE_KEYS = [
    'id', 'created_at', 'updated_at', 'onboarded', 'status', 'name', 'serial', 'fw_version', 'type', 'subtype',
    'last_hb', 'wifi_strength', 'network_id', 'enable_temp_alerts', 'local_storage_enabled', 'local_storage_compatible',
    'local_storage_status', 'revision',
];
const CAMERA_KEYS = [
    'id', 'serial', 'camera_key', 'fw_version', 'mac_address', 'ip_address', 'thumbnail', 'name',
    'liveview_enabled', 'siren_enable', 'siren_volume', 'onboarded', 'unit_number', 'motion_sensitivity', 'enabled',
    'armed', 'alert_tone_enable', 'alert_tone_volume', 'alert_repeat', 'alert_interval', 'video_length',
    'temp_alarm_enable', 'temp_interval', 'temp_adjust', 'temp_min', 'temp_max', 'temp_hysteresis',
    'illuminator_enable', 'illuminator_duration', 'illuminator_intensity', 'battery_alarm_enable',
    'battery_voltage_interval', 'battery_voltage_threshold', 'battery_voltage_hysteresis', 'last_battery_alert',
    'battery_alert_count', 'lfr_sync_interval', 'video_50_60hz', 'invert_image', 'flip_image', 'record_audio_enable',
    'clip_rate', 'liveview_rate', 'max_resolution', 'auto_test', 'wifi_timeout', 'retry_count', 'status',
    'wifi_strength', 'lfr_strength', 'temperature', 'battery_voltage', 'a1', 'last_temp_alert', 'temp_alert_count',
    'last_wifi_alert', 'wifi_alert_count', 'last_lfr_alert', 'lfr_alert_count', 'last_offline_alert',
    'offline_alert_count', 'temp_alert_state', 'battery_state', 'battery_check_time', 'last_snapshot_event',
    'motion_regions', 'mfg_main_type', 'mfg_main_range', 'mfg_mez_type', 'mfg_mez_range', 'type',
    'ring_device_id', 'first_boot', 'country_id', 'usage_alert_count', 'last_usage_alert', 'snooze_till',
    'local_connection_certificate_id', 'account_id', 'network_id', 'sync_module_id', 'account', 'network', 'camera_seq',
    'last_connect', 'motion_alert', 'record_audio', 'buzzer_on', 'early_termination', 'clip_bitrate',
    'liveview_bitrate', 'motion_regions_compatible', 'early_pir_compatible', 'early_notification_compatible',
    'night_vision_exposure_compatible', 'privacy_zones_compatible', 'video_quality_support', 'video_quality',
    'early_notification', 'night_vision_exposure', 'local_storage_enabled', 'local_storage_compatible',
    'clip_max_length', 'early_termination_supported', 'clip_warning_threshold', 'flip_video_compatible', 'flip_video',
    'video_recording_enable', 'video_recording_optional', 'snapshot_compatible', 'snapshot_enabled',
    'snapshot_period_minutes_options', 'snapshot_period_minutes', 'updated_at', 'created_at', 'deleted_at',
];
const CAMERA_SHORT_KEYS = [
    'id', 'created_at', 'updated_at', 'name', 'serial', 'fw_version', 'type', 'enabled', 'thumbnail', 'status',
    'battery', 'usage_rate', 'network_id', 'issues', 'signals', 'local_storage_enabled', 'local_storage_compatible',
    'snooze', 'snooze_time_remaining', 'revision',
];
const CAMERA_SIGNALS_KEYS = ['lfr', 'wifi', 'temp', 'battery', 'battery_state', 'updated_at'];
const CAMERA_USAGE_OBJECT_KEYS = ['range_days', 'reference', 'networks'];
const CAMERA_USAGE_KEYS = ['id', 'name', 'usage', 'lv_seconds', 'clip_seconds'];
const CAMERA_STATUS_KEYS = [
    'camera_id', 'created_at', 'updated_at', 'wifi_strength', 'lfr_strength', 'battery_voltage', 'temperature',
    'fw_version', 'fw_git_hash', 'mac', 'ipv', 'ip_address', 'error_codes', 'battery_alert_status', 'temp_alert_status',
    'ac_power', 'light_sensor_ch0', 'light_sensor_ch1', 'light_sensor_data_valid', 'light_sensor_data_new',
    'time_first_video', 'time_108_boot', 'time_wlan_connect', 'time_dhcp_lease', 'time_dns_resolve', 'lfr_108_wakeups',
    'total_108_wakeups', 'lfr_tb_wakeups', 'total_tb_wakeups', 'wifi_connect_failure_count', 'dhcp_failure_count',
    'socket_failure_count', 'dev_1', 'dev_2', 'dev_3', 'unit_number', 'serial', 'lifetime_count', 'lifetime_duration',
    'pir_rejections', 'sync_module_id', 'network_id', 'account_id', 'id', 'thumbnail',
];

withAuth('blink-api', () => {
    afterAll(() => {
        blinkAPI.reset();
    });

    test('login', async () => {
        // const blinkAPI = new BlinkAPI(DEFAULT_BLINK_CLIENT_UUID, auth);
        expect(blinkAPI.token).toBeUndefined();
        expect(blinkAPI.accountID).toBeUndefined();
        expect(blinkAPI.clientID).toBeUndefined();
        expect(blinkAPI.region).toBe('prod');

        const res = await blinkAPI.login(true);
        // res.auth.token, res.account.account_id, res.account.client_id, res.account.tier
        expect(blinkAPI.token).toBeDefined();
        expect(blinkAPI.accountID).toBeDefined();
        expect(blinkAPI.clientID).toBeDefined();
        expect(blinkAPI.region).toBeDefined();

        expect(res?.auth?.token).toBe(blinkAPI.token);
        expect(res?.account?.account_id).toBe(blinkAPI.accountID);
        expect(res?.account?.client_id).toBe(blinkAPI.clientID);
        expect(res?.account?.tier).toBe(blinkAPI.region);
    });

    test('getClientOptions()', async () => {
        const res = await blinkAPI.getClientOptions();
        expect(res.options).toBeDefined();
    });
    test('getAccountHomescreen()', async () => {
        const res = await blinkAPI.getAccountHomescreen();
        expect(Object.keys(res)).toEqual(expect.arrayContaining(HOMESTREEN_KEYS));

        expect(Object.keys(res.account)).toEqual(expect.arrayContaining(ACCOUNT_SHORT_KEYS));

        for (const network of res.networks) {
            expect(Object.keys(network)).toEqual(expect.arrayContaining(NETWORK_SHORT_KEYS));
        }
        for (const syncmodule of res.sync_modules) {
            expect(Object.keys(syncmodule)).toEqual(expect.arrayContaining(SYNC_MODULE_KEYS));
        }
        for (const camera of res.cameras) {
            expect(Object.keys(camera)).toEqual(expect.arrayContaining(CAMERA_SHORT_KEYS));
            expect(CAMERA_SIGNALS_KEYS).toEqual(expect.arrayContaining(Object.keys(camera.signals)));
        }
    });
    test('getAccount()', async () => {
        const res = await blinkAPI.getAccount();
        expect(Object.keys(res)).toEqual(expect.arrayContaining(ACCOUNT_OBJECT_KEYS));
    });
    test('getAccountStatus()', async () => {
        await blinkAPI.getAccountStatus();
    });
    test('getAccountOptions()', async () => {
        const res = await blinkAPI.getAccountOptions();
        expect(Object.keys(res)).toEqual(expect.arrayContaining(ACCOUNT_OPTION_KEYS));
    });
    test('getAccountNotifications()', async () => {
        const res = await blinkAPI.getAccountNotifications();
        expect(res.notifications).toBeInstanceOf(Object);

        expect(Object.keys(res.notifications)).toEqual(expect.arrayContaining(NOTIFICATION_KEYS));
    });
    test('getMediaChange()', async () => {
        const res = await blinkAPI.getMediaChange();
        expect(res.media).toBeInstanceOf(Array);
    });
    test('getPrograms()', async () => {
        const home = await blinkAPI.getAccountHomescreen();
        const networkID = home.networks[0].id;
        const res = await blinkAPI.getPrograms(networkID);
        expect(res).toBeInstanceOf(Array);
    });
    test('getCameraConfig()', async () => {
        const home = await blinkAPI.getAccountHomescreen();
        for (const camera of home.cameras) {
            const networkID = camera.network_id;
            const cameraID = camera.id;
            const res = await blinkAPI.getCameraConfig(networkID, cameraID);
            for (const camera of res.camera) {
                expect(Object.keys(camera)).toEqual(expect.arrayContaining(CAMERA_KEYS));
            }
            expect(Object.keys(res.signals)).toEqual(expect.arrayContaining(CAMERA_SIGNALS_KEYS));
        }
    });
    test('getCameraUsage()', async () => {
        const res = await blinkAPI.getCameraUsage();
        expect(Object.keys(res)).toEqual(expect.arrayContaining(CAMERA_USAGE_OBJECT_KEYS));

        for (const network of res.networks) {
            for (const camera of network.cameras) {
                expect(Object.keys(camera)).toEqual(expect.arrayContaining(CAMERA_USAGE_KEYS));
            }
        }
    });
    test('getCameraSignals()', async () => {
        const home = await blinkAPI.getAccountHomescreen();
        for (const camera of home.cameras) {
            const networkID = camera.network_id;
            const cameraID = camera.id;
            const res = await blinkAPI.getCameraSignals(networkID, cameraID);
            expect(CAMERA_SIGNALS_KEYS).toEqual(expect.arrayContaining(Object.keys(res)));
        }
    });
    test('getCameraStatus()', async () => {
        const home = await blinkAPI.getAccountHomescreen();
        for (const camera of home.cameras) {
            const networkID = camera.network_id;
            const cameraID = camera.id;
            const res = await blinkAPI.getCameraStatus(networkID, cameraID);
            expect(Object.keys(res.camera_status)).toEqual(expect.arrayContaining(CAMERA_STATUS_KEYS));
        }
    });
    test('getNetworks()', async () => {
        const res = await blinkAPI.getNetworks();
        expect(res.summary).toBeInstanceOf(Object);
        expect(res.networks).toBeInstanceOf(Array);
        for (const network of res.networks) {
            expect(Object.keys(network)).toEqual(expect.arrayContaining(NETWORK_KEYS));
        }
        expect(res.networks.length).toBeGreaterThanOrEqual(1);
    });
    test('getDevice()', async () => {
        const home = await blinkAPI.getAccountHomescreen();
        const DEVICE_IDENTIFY_KEYS = ['type', 'subtype', 'region', 'placement', 'fw_target', 'region'];
        for (const camera of home.cameras) {
            const serial = camera.serial;
            const res = await blinkAPI.getDevice(serial);
            expect(Object.keys(res)).toEqual(expect.arrayContaining(DEVICE_IDENTIFY_KEYS));
        }
    });
    test('getBlinkStatus()', async () => {
        const res = await blinkAPI.getBlinkStatus();
        expect(res.message_code).toBe(0);
    });
    test('getBlinkSupport()', async () => {
        // deprecated?
        await blinkAPI.getBlinkSupport();
    });
    test('getBlinkAppVersion()', async () => {
        const res = await blinkAPI.getBlinkAppVersion();
        expect(res.message).toBe('OK');
    });
    test('getBlinkRegions()', async () => {
        const res = await blinkAPI.getBlinkRegions();
        expect(res.preferred).toBeDefined();
        expect(res.regions[res.preferred].dns).toBeDefined();
    });
    test('getSyncModuleFirmware()', async () => {
        const home = await blinkAPI.getAccountHomescreen();
        const serial = home.sync_modules[0].serial;
        const res = await blinkAPI.getSyncModuleFirmware(serial);
        expect(res).toBeInstanceOf(Buffer);
    });
    test('getAppStatus()', async () => {
        const serial = 'IOS_8854';
        await blinkAPI.getAppStatus(serial);
    });

    test('getSirens()', async () => {
    });
    test('getNetworkSirens()', async () => {
    });
    test('getOwlConfig()', async () => {
    });
    test('getOwlFirmware()', async () => {
    });
});
