const LOGIN = {
    account: {
        account_id: 1000001,
        account_verification_required: false,
        amazon_account_linked: false,
        client_id: 1000002,
        client_trusted: true,
        client_verification_required: false,
        country_required: false,
        new_account: false,
        phone_verification_required: false,
        region: 'ap',
        require_trust_client_device: true,
        tier: 'prod',
        user: {country: 'CA', user_id: 1000003},
        user_id: 1000003,
        verification_channel: 'phone',
    },
    allow_pin_resend_seconds: 90,
    auth: {token: 'XXXX9999'},
    force_password_reset: false,
    lockout_time_remaining: 0,
    phone: {country_calling_code: '1', last_4_digits: '3387', number: '+1******3387', valid: true},
    verification: {email: {required: false}, phone: {channel: 'sms', required: true}},
};

const LOGIN_INVALID = {code: 200, message: 'Invalid credentials'};

const LOGIN_CLIENT_DELETED = {
    allow_pin_resend_seconds: 90, code: 242, force_password_reset: false, lockout_time_remaining: 0,
    message: 'Client already deleted. Please re-login',
};

const LOGIN_INVALID_PIN = {valid: false, require_new_pin: false, code: 1621, message: 'Invalid PIN'};

const LOGIN_VALID_PIN = {code: 1626, message: 'Client has been successfully verified', require_new_pin: false, valid: true};

const LOGIN_RESEND_PIN = {allow_pin_resend_seconds: 90, code: 211, message: 'Verification Email Sent'};

const LOGOUT = {message: 'logout'};

const ACCOUNT = {
    id: 1000003, name: '', account_id: 1000001, updated_at: '2022-03-17T02:31:50+00:00',
    created_at: '2016-02-13T19:15:54+00:00', country_calling_code: '1', country_id: 'CA',
    email: 'user@example.com', force_password_reset: false, locale: 'en_US', owner: true,
    phone_number: '5555555555', phone_verification_channel: 'sms', phone_verification_required: true,
    phone_verified: true, pin_created_at: null, pin_failures: 0, reset_expiration: null, temp_units: 'f',
    time_zone: 'US/Eastern', timezone_id: 213, type: 'regular', user_access: 'write',
    verification_channel: 'phone', verification_required: true, verified: true,
};

const ACCOUNT_NOTIFICATIONS = {
    notifications: {
        accessory_connected: true, accessory_disconnected: true, accessory_low_battery: true, bandwidth: true,
        battery_dead: true, camera_offline: true, camera_usage: true, doorbell: true, general: true,
        lfr: true, local_storage: true, low_battery: true, motion: true, scheduling: true,
        sync_module_offline: true, temperature: true, wifi: true,
    },
};

const ACCOUNT_OPTIONS = {
    advanced_motion_regions: {
        cam_1448994: [
            0, 0, 0, 0, 0,
            0, 4095, 4095, 0, 0,
            0, 4095, 4095, 0, 0,
            0, 4095, 4095, 0, 0,
            0, 0, 0, 0, 0,
        ],
    },
    amazon_account_linking: 'unavailable',
    amazon_account_linking_enabled: false,
    breadcrumbs: [],
    c2s_clip_list_limit: 1000,
    catalina_app_enabled: true,
    legacy_account_mini: true,
    owl_app_enabled: true,
    sm2_app_enabled: true,
    snapshot_app_enabled: true,
    trial_cancellation_enabled: true,
};

const ACCOUNT_STATUS = {
    account: {id: 1000001, verification_required: false}, client: {id: 1000002, verification_required: false},
};

const BLINK_APP_VERSION = {code: 103, message: 'OK', update_available: false, update_required: false};

const BLINK_REGIONS = {
    mode: 'manual',
    preferred: 'usu017',
    regions: {
        e007: {display_order: 4, dns: 'e007', friendly_name: 'Europe', registration: true},
        sg: {display_order: 5, dns: 'prsg', friendly_name: 'Southeast Asia', registration: true},
        usu006: {display_order: 3, dns: 'u006', friendly_name: 'United States - WEST', registration: true},
        usu007: {display_order: 2, dns: 'u007', friendly_name: 'United States - CENTRAL', registration: true},
        usu017: {display_order: 1, dns: 'u017', friendly_name: 'United States - EAST', registration: true},
    },
};

const BLINK_STATUS = {
    check_interval: 60,
    message: 'The Blink Cloud service is operating normally.',
    message_code: 0,
    message_params: [],
    monitor_last_update: '2022-03-17T20:47:52Z',
    next_check_time: '2022-03-17T20:47:57Z',
    url: '',
};

const BLINK_SUPPORT = {
    phone_number: '7813325465', start_day: 1, start_hour_utc: 15, stop_day: 5, stop_hour_utc: 23,
};

const HOMESCREEN = {
    account: {
        id: 1000001,
        email_verified: true,
        email_verification_required: true,
        amazon_account_linked: false,
    },
    networks: [
        {
            id: 2000001, name: '82 Downing',
            created_at: '2016-02-13T19:15:54+00:00', updated_at: '2022-03-06T18:05:40+00:00',
            time_zone: 'America/Toronto', dst: true,
            armed: true, lv_save: false,
        },
        {
            id: 2000002, name: '82b Downing',
            created_at: '2016-02-13T19:15:54+00:00', updated_at: '2022-03-06T18:05:40+00:00',
            time_zone: 'America/Toronto', dst: true,
            armed: true, lv_save: false,
        },
        {
            id: 2000003, name: '82b Downing',
            created_at: '2017-05-05T23:23:49+00:00', updated_at: '2020-11-10T15:12:01+00:00',
            time_zone: 'America/Toronto', dst: true,
            armed: false, lv_save: false,
        },
    ],
    sync_modules: [
        {
            id: 3000001, name: 'Blink SM', type: 'sm1', subtype: 'none',
            network_id: 2000001,
            created_at: '2016-02-13T19:17:57+00:00', updated_at: '2022-03-13T15:26:12+00:00',
            onboarded: true,
            status: 'online',
            serial: 'A0000001',
            fw_version: '4.4.8',
            last_hb: '2022-03-13T20:09:20+00:00',
            wifi_strength: 3,
            enable_temp_alerts: true,
            local_storage_enabled: false,
            local_storage_compatible: true,
            local_storage_status: 'unavailable',
            revision: '00',
        },
        {
            id: 3000002, name: 'My Blink Sync Module', type: 'sm2', subtype: 'vinnie',
            network_id: 312885,
            created_at: '2022-02-16T00:08:56+00:00', updated_at: '2022-03-13T20:03:20+00:00',
            onboarded: true,
            status: 'online',
            serial: 'A0000002',
            fw_version: '4.4.8',
            last_hb: '2022-03-13T20:09:25+00:00',
            wifi_strength: 1,
            enable_temp_alerts: true,
            local_storage_enabled: false,
            local_storage_compatible: true,
            local_storage_status: 'unavailable',
            revision: '00',
        },
    ],
    cameras: [
        {
            id: 4000001, name: 'Alpha', type: 'white',
            network_id: 2000001,
            created_at: '2016-02-13T19:21:09+00:00', updated_at: '2022-03-13T19:57:49+00:00',
            serial: 'B0000001',
            fw_version: '2.151',
            enabled: true,
            // eslint-disable-next-line max-len
            thumbnail: '/media/production/account/1000001/network/2000001/camera/4000001/clip_8mpxqvts_2020_01_01__01_01AM',
            status: 'done',
            battery: 'low',
            usage_rate: false,
            issues: [],
            signals: {lfr: 5, wifi: 1, temp: 62, battery: 2},
            local_storage_enabled: false,
            local_storage_compatible: false,
            snooze: false,
            snooze_time_remaining: null,
            revision: null,
        },
        {
            id: 4000002, name: 'Beta', type: 'catalina',
            network_id: 2000002,
            created_at: '2022-02-16T00:13:43+00:00', updated_at: '2022-03-13T18:57:49+00:00',
            serial: 'B0000002',
            fw_version: '10.53',
            enabled: true,
            // eslint-disable-next-line max-len
            thumbnail: '/api/v3/media/production/account/1000001/network/2000001/catalina/4000002/thumbnail/thumbnail.jpg?ts=1648473188&ext=',
            status: 'done',
            battery: 'ok',
            usage_rate: false,
            issues: [],
            signals: {lfr: 5, wifi: 5, temp: 23, battery: 3},
            local_storage_enabled: false,
            local_storage_compatible: true,
            snooze: false,
            snooze_time_remaining: null,
            revision: '00',
        },
    ],
    sirens: [],
    chimes: [],
    video_stats: {
        storage: 2,
        auto_delete_days: 60,
        auto_delete_day_options: [3, 7, 14, 30, 60],
    },
    doorbell_buttons: [],
    owls: [
        {
            id: 5000001, name: 'Gamma', type: 'owl',
            network_id: 2000003,
            created_at: '2020-04-17T21:42:56+00:00', updated_at: '2020-11-02T19:50:09+00:00',
            onboarded: true,
            serial: 'B0000003',
            fw_version: '9.63',
            enabled: true,
            // eslint-disable-next-line max-len
            thumbnail: '/media/production/account/116756/network/2000003/owl/5000001/thumbnail/fw_9.63__IokPTqZ2_2020_10_28__11_43AM',
            status: 'online',
            local_storage_enabled: false,
            local_storage_compatible: false,
        },
    ],
    doorbells: [],
    app_updates: {message: 'OK', code: 103, update_available: false, update_required: false},
    device_limits: {camera: 10, chime: 5, doorbell: 10, doorbell_button: 2, owl: 10, siren: 5, total_devices: 20},
    whats_new: {updated_at: 20210204, url: 'https://updates.blinkforhome.com/'},
    subscriptions: {updated_at: '2022-03-01T01:50:27+00:00'},
    entitlements: {updated_at: '2022-03-01T01:50:27+00:00'},
    tiv_lock_enable: true,
    tiv_lock_status: {locked: true},
    accessories: {storm: [], rosie: []},
};

const NETWORKS = {
    networks: [
        {
            id: 2000002, name: 'Fortress of Solitude', account_id: 1000001, updated_at: '2022-02-16T00:08:31+00:00',
            created_at: '2022-02-16T00:08:31+00:00', arm_string: 'Disarmed', armed: false,
            autoarm_geo_enable: false, autoarm_time_enable: false, busy: false, camera_error: false,
            description: '', dst: true, encryption_key: null, feature_plan_id: null, lfr_channel: 0,
            locale: '', location_id: null, lv_mode: 'relay', network_key: 'k3Y39BqYR-aw5NjL',
            network_origin: 'normal', ping_interval: 60, sm_backup_enabled: false, storage_total: 0,
            storage_used: 0, sync_module_error: false, time_zone: 'America/New_York', video_count: 0,
            video_destination: 'server', video_history_count: 4000,
        },
        {
            id: 2000001, name: 'BatCave', account_id: 1000001, updated_at: '2022-03-17T12:49:51+00:00',
            created_at: '2016-02-13T19:15:54+00:00', arm_string: 'Armed', armed: true, autoarm_geo_enable: false,
            autoarm_time_enable: false, busy: false, camera_error: false, description: '', dst: true,
            encryption_key: null, feature_plan_id: null, lfr_channel: 0, locale: '', location_id: null,
            lv_mode: 'relay', network_key: 'hifSnlicp+k4bLA=', network_origin: 'normal', ping_interval: 60,
            sm_backup_enabled: false, storage_total: 0, storage_used: 0, sync_module_error: false,
            time_zone: 'America/Toronto', video_count: 0, video_destination: 'server', video_history_count: 4000,
        },
    ],
    summary: {2000001: {name: 'BatCave', onboarded: true}, 2000002: {name: 'Fortress of Solitude', onboarded: true}},
};

HOMESCREEN.NETWORK_OG = HOMESCREEN.networks[0];
HOMESCREEN.SYNCMODULE_OG = HOMESCREEN.sync_modules[0];
HOMESCREEN.CAMERA_OG = HOMESCREEN.cameras[0];
HOMESCREEN.CAMERA_G2 = HOMESCREEN.cameras[1];
HOMESCREEN.MINI = HOMESCREEN.owls[0];

const DEVICE = {fw_target: 'sync_module', region: 'north_america', subtype: 'sm1', type: 'sync_module'};

const CAMERA_CONFIG = {
    camera: [
        {
            id: 3000001,
            name: 'Camera 1',
            network_id: 2000001,
            sync_module_id: 5000001,
            account_id: 1000001,
            updated_at: '2022-03-17T21:06:33+00:00',
            created_at: '2016-02-13T19:21:09+00:00',
            deleted_at: null,
            a1: false,
            account: 1000001,
            alert_interval: 10,
            alert_repeat: 'off',
            alert_tone_enable: true,
            alert_tone_volume: 0,
            armed: false,
            auto_test: false,
            battery_alarm_enable: false,
            battery_alert_count: 0,
            battery_check_time: '2021-06-15T20:38:31+00:00',
            battery_state: 'low',
            battery_voltage: 133,
            battery_voltage_hysteresis: 512,
            battery_voltage_interval: 0,
            battery_voltage_threshold: 512,
            buzzer_on: true,
            camera_key: '',
            camera_seq: 1,
            clip_bitrate: 0,
            clip_max_length: 60,
            clip_rate: 0,
            clip_warning_threshold: 15,
            country_id: null,
            early_notification: false,
            early_notification_compatible: false,
            early_pir_compatible: false,
            early_termination: true,
            early_termination_supported: true,
            enabled: true,
            first_boot: '2018-10-14T06:07:04+00:00',
            flip_image: false,
            flip_video: false,
            flip_video_compatible: false,
            fw_version: '2.151',
            illuminator_duration: 1,
            illuminator_enable: 0,
            illuminator_intensity: 1,
            invert_image: false,
            ip_address: null,
            last_battery_alert: null,
            last_connect: {
                network_id: 2000001, camera_id: 3000001, sync_module_id: 5000001, account_id: 1000001,
                updated_at: '2022-02-18T07:58:33+00:00', created_at: '2017-10-31T22:12:59+00:00', ac_power: false,
                battery_alert_status: false, battery_voltage: 133, dev_1: 2286899, dev_2: 26368,
                dev_3: 'B0000001', dhcp_failure_count: 0, error_codes: 0, fw_git_hash: null, fw_version: '2.151',
                ip_address: '10.0.0.142', ipv: 'ipv4', lfr_108_wakeups: 6, lfr_strength: -64, lfr_tb_wakeups: 6,
                lifetime_count: 0, lifetime_duration: 0, light_sensor_ch0: 0, light_sensor_ch1: 132,
                light_sensor_data_new: false, light_sensor_data_valid: false, mac: 'f4:b8:5e:8a:54:b1',
                pir_rejections: 0, serial: 'B0000001', socket_failure_count: 0, temp_alert_status: false,
                temperature: 73, time_108_boot: 89282, time_dhcp_lease: 2283350, time_dns_resolve: 0,
                time_first_video: 0, time_wlan_connect: 1095269, total_108_wakeups: 7, total_tb_wakeups: 26119,
                unit_number: 1, wifi_connect_failure_count: 0, wifi_strength: -51,
            },
            last_lfr_alert: null,
            last_offline_alert: '2020-09-17T04:41:44+00:00',
            last_snapshot_event: null,
            last_temp_alert: '2021-06-06T20:44:54+00:00',
            last_usage_alert: null,
            last_wifi_alert: null,
            lfr_alert_count: 0,
            lfr_strength: -68,
            lfr_sync_interval: 8,
            liveview_bitrate: 0,
            liveview_enabled: 'off',
            liveview_rate: 0,
            local_connection_certificate_id: null,
            local_storage_compatible: false,
            local_storage_enabled: false,
            mac_address: null,
            max_resolution: 'r720',
            mfg_main_range: 1601016399,
            mfg_main_type: 'MA',
            mfg_mez_range: 0,
            mfg_mez_type: '',
            motion_alert: true,
            motion_regions: 33554431,
            motion_regions_compatible: true,
            motion_sensitivity: 5,
            network: 2000001,
            night_vision_exposure: 1,
            night_vision_exposure_compatible: false,
            offline_alert_count: 3,
            onboarded: true,
            privacy_zones_compatible: false,
            record_audio: true,
            record_audio_enable: true,
            retry_count: 0,
            ring_device_id: null,
            serial: 'B0000001',
            siren_enable: false,
            siren_volume: null,
            snapshot_compatible: false,
            snapshot_enabled: false,
            snapshot_period_minutes: 60,
            snapshot_period_minutes_options: [60],
            snooze_till: null,
            status: 'done',
            temp_adjust: -15,
            temp_alarm_enable: false,
            temp_alert_count: 1,
            temp_alert_state: 'high',
            temp_hysteresis: null,
            temp_interval: 1,
            temp_max: 88,
            temp_min: 50,
            temperature: 78,
            thumbnail: '/media/production/account/10001/network/20001/camera/30001/clip_8mpxqvts_2021_06_15__20_38PM',
            type: 'white',
            unit_number: 1,
            usage_alert_count: 0,
            video_50_60hz: 'freq_60hz',
            video_length: 45,
            video_quality: 'standard',
            video_quality_support: ['saver', 'standard'],
            video_recording_enable: true,
            video_recording_optional: false,
            wifi_alert_count: 0,
            wifi_strength: -255,
            wifi_timeout: 30,
        },
    ],
    signals: {updated_at: '2022-02-18T07:58:33+00:00', battery: 2, battery_state: 'low', lfr: 5, temp: 63, wifi: 5},
};

const CAMERA_MOTION_REGIONS = {
    advanced_motion_regions: [
        0, 0, 0, 0, 0,
        0, 4095, 4095, 0, 0,
        0, 4095, 4095, 0, 0,
        0, 4095, 4095, 0, 0,
        0, 0, 0, 0, 0,
    ],
    motion_regions: 1073944768,
};

const CAMERA_SIGNALS = {updated_at: '2022-03-17T21:06:33+00:00', battery: 3, lfr: 5, temp: 63, wifi: 5};

const CAMERA_STATUS = {
    camera_status: {
        camera_id: 4000001,
        created_at: '2021-02-16T00:13:59+00:00',
        updated_at: '2022-03-14T00:39:42+00:00',
        wifi_strength: -52,
        lfr_strength: -55,
        battery_voltage: 160,
        temperature: 23,
        fw_version: '10.53',
        fw_git_hash: 'release:612df6c0',
        mac: '34:af:af:af:af:af',
        ipv: 'ipv4',
        ip_address: '172.0.0.1',
        error_codes: 0,
        battery_alert_status: true,
        temp_alert_status: false,
        ac_power: false,
        light_sensor_ch0: 170,
        light_sensor_ch1: 61660,
        light_sensor_data_valid: true,
        light_sensor_data_new: true,
        time_first_video: 143541,
        time_108_boot: 89923,
        time_wlan_connect: 1000254,
        time_dhcp_lease: 1038858,
        time_dns_resolve: 543,
        lfr_108_wakeups: 0,
        total_108_wakeups: 64,
        lfr_tb_wakeups: 83,
        total_tb_wakeups: 0,
        wifi_connect_failure_count: 0,
        dhcp_failure_count: 0,
        socket_failure_count: 9153,
        dev_1: 8648672,
        dev_2: 8,
        dev_3: 655393,
        unit_number: 3,
        serial: 'B0000002',
        lifetime_count: 0,
        lifetime_duration: 0,
        pir_rejections: 0,
        sync_module_id: 3000001,
        network_id: 2000001,
        account_id: 1000001,
        id: 1,
        // eslint-disable-next-line max-len
        thumbnail: '/media/production/account/1000001/network/2000001/catalina/4000002/thumbnail/fw_10.53__FY_9_3HS_2020_01_01__01_01AM',
    },
};

const CAMERA_USAGE = {
    networks: [
        {
            name: 'BatCave',
            network_id: 2000001,
            cameras: [
                {id: 3000001, name: 'Camera 1', clip_seconds: 0, lv_seconds: 0, usage: 0},
                {id: 3000002, name: 'Camera 2', clip_seconds: 0, lv_seconds: 0, usage: 0},
                {id: 3000003, name: 'Camera 3', clip_seconds: 39, lv_seconds: 0, usage: 39},
            ],
        },
        {name: 'Fortress of Solitude', network_id: 2000002, cameras: []},
    ],
    range_days: 7,
    reference: {usage: 400},
};

const ENABLE_CAMERA = {
    account_id: 1000001, attempts: 0,
    by_whom: 'unknown - 6.1.1 (8854) #e06341d7f', camera_id: 4000002,
    command: 'device_motion_enable', created_at: '2022-03-17T02:34:29+00:00',
    debug: '', diagnostic: false, duration: null,
    execute_time: '2022-03-17T02:34:29+00:00', firmware_id: null,
    id: 999999999, lfr_ack: null, network_id: 2000001, opts_1: 0,
    parent_command_id: null, player_transaction: 'obK_cEz0utEaoLvp',
    sequence: null, server: null, siren_id: null, sm_ack: null,
    stage_cs_db: null, stage_cs_sent: null, stage_dev: null, stage_is: null,
    stage_lv: null, stage_rest: '2022-03-17T02:34:29+00:00', stage_sm: null,
    stage_vs: null, state_condition: 'new', state_stage: 'rest',
    sync_module_id: 3000001, target: 'camera', target_id: 4000002,
    transaction: 'i6UEwXGLlFEVY1l-', updated_at: '2022-03-17T02:34:29+00:00',
};

const DISABLE_CAMERA = {
    account_id: 1000001, attempts: 0,
    by_whom: 'unknown - 6.1.1 (8854) #e06341d7f', camera_id: 4000002,
    command: 'device_motion_disable', created_at: '2022-03-17T02:34:29+00:00',
    debug: '', diagnostic: false, duration: null,
    execute_time: '2022-03-17T02:34:29+00:00', firmware_id: null,
    id: 999999999, lfr_ack: null, network_id: 2000001, opts_1: 0,
    parent_command_id: null, player_transaction: 'obK_cEz0utEaoLvp',
    sequence: null, server: null, siren_id: null, sm_ack: null,
    stage_cs_db: null, stage_cs_sent: null, stage_dev: null, stage_is: null,
    stage_lv: null, stage_rest: '2022-03-17T02:34:29+00:00', stage_sm: null,
    stage_vs: null, state_condition: 'new', state_stage: 'rest',
    sync_module_id: 3000001, target: 'camera', target_id: 4000002,
    transaction: 'i6UEwXGLlFEVY1l-', updated_at: '2022-03-17T02:34:29+00:00',
};

const MEDIA_CHANGE = {
    limit: 500,
    purge_id: 2989164295,
    refresh_count: 0,
    media: [
        {
            id: 7000001,
            created_at: '2022-03-12T17:20:01+00:00',
            updated_at: '2022-03-12T21:51:35+00:00',
            deleted: false,
            device: 'catalina',
            device_id: 4000001,
            device_name: 'Alpha',
            network_id: 2000001,
            network_name: '82 Downing',
            type: 'video',
            source: 'snapshot',
            partial: false,
            watched: false,
            thumbnail: '/api/v3/media/accounts/1000001/networks/2000001/catalina/4000001/snapshot/3032353907.jpg?ext=',
            media: '/api/v3/media/accounts/1000001/networks/2000001/catalina/4000001/snapshot/3032353907.mp4',
            metadata: null,
            additional_devices: [],
            time_zone: 'America/Toronto',
        },
    ],
};

const UPDATE_THUMBNAIL = {
    account_id: 1000001, attempts: 0,
    by_whom: 'unknown - 6.1.1 (8854) #e06341d7f', camera_id: 4000002,
    command: 'thumbnail', created_at: '2022-03-16T01:16:38+00:00', debug: '',
    diagnostic: false, duration: null,
    execute_time: '2022-03-16T01:16:38+00:00', firmware_id: null,
    id: 999999999, lfr_ack: null, network_id: 2000001, opts_1: 0,
    parent_command_id: null, player_transaction: 'z2C8o4mH14kALHF9',
    sequence: null, server: null, siren_id: null, sm_ack: null,
    stage_cs_db: null, stage_cs_sent: null, stage_dev: null, stage_is: null,
    stage_lv: null, stage_rest: '2022-03-16T01:16:38+00:00', stage_sm: null,
    stage_vs: null, state_condition: 'new', state_stage: 'rest',
    sync_module_id: 3000001, target: 'camera', target_id: 4000002,
    transaction: '3eq8L6s57pDfTFtz', updated_at: '2022-03-16T01:16:38+00:00',
};

const UPDATE_CLIP = {
    account_id: 1000001, attempts: 0,
    by_whom: 'unknown - 6.1.1 (8854) #e06341d7f', camera_id: 4000002,
    command: 'clip', created_at: '2022-03-16T20:57:22+00:00', debug: '',
    diagnostic: false, duration: null,
    execute_time: '2022-03-16T20:57:22+00:00', firmware_id: null,
    id: 999999999, lfr_ack: null, network_id: 2000001, opts_1: 0,
    parent_command_id: null, player_transaction: 'L8NzBcFF_Sxn03qH',
    sequence: null, server: null, siren_id: null, sm_ack: null,
    stage_cs_db: null, stage_cs_sent: null, stage_dev: null, stage_is: null,
    stage_lv: null, stage_rest: '2022-03-16T20:57:22+00:00', stage_sm: null,
    stage_vs: null, state_condition: 'new', state_stage: 'rest',
    sync_module_id: 3000001, target: null, target_id: null,
    transaction: 'l4hfGumGEi8AboSN', updated_at: '2022-03-16T20:57:22+00:00',
};

const DELETE_CLIP = {code: 711, message: 'Successfully deleted media'};

const OWL_CONFIG = {
    name: 'Gamma',
    updated_at: '2020-10-25T18:42:55+00:00',
    fw_version: 9.63,
    enabled: false,
    led_enabled: true,
    led_state: 'off',
    status: 'online',
    video_quality: 'best',
    clip_length_max: 30,
    clip_length: 30,
    retrigger_time: 10,
    motion_sensitivity: 5,
    motion_regions: 33554431,
    advanced_motion_regions: [4095, 4095, 4095, 4095, 4095, 4095, 4095, 4095, 4095, 4095, 4095, 4095],
    early_termination: false,
    night_vision_control: 'normal',
    early_notification: false,
    early_notification_compatible: true,
    early_termination_supported: true,
    illuminator_enable: 'auto',
    illuminator_enable_v2: 'auto',
    illuminator_duration: 1,
    illuminator_intensity: 4,
    record_audio_enable: false,
    volume_control: 7,
    wifi: 5,
    video_recording_enable: false,
    video_recording_optional: true,
    flip_video: false,
    flip_video_compatible: true,
    local_storage_enabled: false,
    local_storage_compatible: false,
};

const COMMAND_SENT = {
    commands: [
        {
            account_id: 1000001, attempts: 0,
            by_whom: 'unknown - 6.1.1 (8854) #e06341d7f', camera_id: 4000002,
            command: 'thumbnail', created_at: '2022-03-16T01:16:38+00:00',
            debug: '', diagnostic: false, duration: null,
            execute_time: '2022-03-16T01:16:38+00:00', firmware_id: null,
            id: 999999999, lfr_ack: null, network_id: 2000001, opts_1: 0,
            parent_command_id: null, player_transaction: 'z2C8o4mH14kALHF9',
            sequence: 1634, server: null, siren_id: null, sm_ack: null,
            stage_cs_db: '2022-03-16T01:16:38+00:00',
            stage_cs_sent: '2022-03-16T01:16:38+00:00', stage_dev: null,
            stage_is: null, stage_lv: null,
            stage_rest: '2022-03-16T01:16:38+00:00', stage_sm: null,
            stage_vs: null, state_condition: 'running', state_stage: 'cs_sent',
            sync_module_id: 3000001, target: 'camera', target_id: 4000002,
            transaction: '3eq8L6s57pDfTFtz',
            updated_at: '2022-03-16T01:16:38+00:00',
        },
    ],
    complete: false,
    media_id: null,
    status: 0,
    status_code: 908,
    status_msg: 'Command succeeded',
};

const COMMAND_RUNNING = {
    commands: [
        {
            account_id: 1000001, attempts: 0,
            by_whom: 'unknown - 6.1.1 (8854) #e06341d7f', camera_id: 4000002,
            command: 'thumbnail', created_at: '2022-03-16T01:16:38+00:00',
            debug: '', diagnostic: false, duration: null,
            execute_time: '2022-03-16T01:16:38+00:00', firmware_id: null,
            id: 999999999, lfr_ack: null, network_id: 2000001, opts_1: 0,
            parent_command_id: null, player_transaction: 'z2C8o4mH14kALHF9',
            sequence: 1634, server: null, siren_id: null, sm_ack: 1,
            stage_cs_db: '2022-03-16T01:16:38+00:00',
            stage_cs_sent: '2022-03-16T01:16:38+00:00', stage_dev: null,
            stage_is: null, stage_lv: null,
            stage_rest: '2022-03-16T01:16:38+00:00',
            stage_sm: '2022-03-16T01:16:38+00:00', stage_vs: null,
            state_condition: 'running', state_stage: 'sm', sync_module_id: 3000001,
            target: 'camera', target_id: 4000002, transaction: '3eq8L6s57pDfTFtz',
            updated_at: '2022-03-16T01:16:38+00:00',
        },
    ],
    complete: false,
    media_id: null,
    status: 0,
    status_code: 908,
    status_msg: 'Command succeeded',
};

const COMMAND_COMPLETE = {
    commands: [
        {
            account_id: 1000001, attempts: 0,
            by_whom: 'unknown - 6.1.1 (8854) #e06341d7f', camera_id: 4000002,
            command: 'thumbnail', created_at: '2022-03-16T01:16:38+00:00',
            debug: '{"lfr_ok":[2000001,3,1634,197,146,164,133,0]}',
            diagnostic: false, duration: 0,
            execute_time: '2022-03-16T01:16:38+00:00', firmware_id: null,
            id: 999999999, lfr_ack: 0, network_id: 2000001, opts_1: 0,
            parent_command_id: null, player_transaction: 'z2C8o4mH14kALHF9',
            sequence: 1634, server: 'immis://44.195.129.67:443', siren_id: null,
            sm_ack: 1, stage_cs_db: '2022-03-16T01:16:38+00:00',
            stage_cs_sent: '2022-03-16T01:16:38+00:00',
            stage_dev: '2022-03-16T01:16:40+00:00', stage_is: null,
            stage_lv: null, stage_rest: '2022-03-16T01:16:38+00:00',
            stage_sm: '2022-03-16T01:16:38+00:00',
            stage_vs: '2022-03-16T01:16:41+00:00', state_condition: 'done',
            state_stage: 'vs', sync_module_id: 3000001, target: 'camera',
            target_id: 4000002, transaction: '3eq8L6s57pDfTFtz',
            updated_at: '2022-03-16T01:16:41+00:00',
        },
    ],
    complete: true,
    media_id: null,
    status: 0,
    status_code: 908,
    status_msg: 'Command succeeded',
};

const ARM_NETWORK = {
    command: 'arm',
    commands: [
        // one per camera running
        {command: 'config_lfr', id: 9999999990, network_id: 2000001, state: 'running'},
        {command: 'config_lfr', id: 9999999992, network_id: 2000001, state: 'running'},
        {command: 'config_lfr', id: 9999999995, network_id: 2000001, state: 'running'},
    ],
    id: 999999999,
    network_id: 2000001,
    state: 'new',
};

const DISARM_NETWORK = {
    command: 'disarm',
    commands: [
        // one per camera running
        {command: 'config_lfr', id: 9999999990, network_id: 2000001, state: 'running'},
        {command: 'config_lfr', id: 9999999992, network_id: 2000001, state: 'running'},
        {command: 'config_lfr', id: 9999999995, network_id: 2000001, state: 'running'},
    ],
    id: 999999999,
    network_id: 2000001,
    state: 'new',
};
const CAMERA_LIVE_VIEW = {
    command_id: 999999999, join_available: true, join_state: 'available',
    server: 'rtsps://lv2-app-prod.immedia-semi.com:443/NIE5YSJGOOOn__IMDS_B0000001?client_id=208&blinkRTSP=true',
    duration: 300, continue_interval: 30, continue_warning: 10, submit_logs: true, new_command: true,
    network_id: 2000001, media_id: null, options: {},
};

module.exports = {
    LOGIN,
    LOGIN_INVALID,
    LOGIN_CLIENT_DELETED,
    LOGIN_RESEND_PIN,
    LOGIN_VALID_PIN,
    LOGIN_INVALID_PIN,
    LOGOUT,
    ACCOUNT,
    ACCOUNT_OPTIONS,
    ACCOUNT_STATUS,
    ACCOUNT_NOTIFICATIONS,
    BLINK_APP_VERSION,
    BLINK_REGIONS,
    BLINK_STATUS,
    BLINK_SUPPORT,
    HOMESCREEN,
    NETWORKS,
    CAMERA_USAGE,
    CAMERA_CONFIG,
    CAMERA_MOTION_REGIONS,
    CAMERA_SIGNALS,
    CAMERA_STATUS,
    CAMERA_LIVE_VIEW,
    DEVICE,
    MEDIA_CHANGE,
    COMMAND_SENT,
    COMMAND_RUNNING,
    COMMAND_COMPLETE,
    UPDATE_THUMBNAIL,
    UPDATE_CLIP,
    DELETE_CLIP,
    DISABLE_CAMERA,
    ENABLE_CAMERA,
    ARM_NETWORK,
    DISARM_NETWORK,
    OWL_CONFIG,
};
