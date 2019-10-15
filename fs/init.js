// alarm remeniv3
// test

load('api_config.js');
load('api_rpc.js');
load('api_dht.js');
load('api_events.js');
load('api_gpio.js');
load('api_mqtt.js');
load('api_net.js');
load('api_sys.js');
load('api_timer.js');


// pins & mqtt topics
let ON = 0;
let ARMED = 0;
let OFF = 1;
let INTRUSION = 1;
let led_pin = 2; // status led
let dht_pin = 5; // DHT22 sensor

let heater = {
    //states:
    off: 0,
    cooling: 1,
    heat: 2,
    //
    cooling_time: 10000,
    // pins
    blower_pin:13,
    heat_pin: 4,
    //vars
    timerid: 0,
    state: 0,
    //
    initialize: function() {
        GPIO.set_mode(heater.blower_pin, GPIO.MODE_OUTPUT);
        GPIO.write(heater.blower_pin, OFF);
        GPIO.set_mode(heater.heat_pin, GPIO.MODE_OUTPUT);
        GPIO.write(heater.heat_pin, OFF);
    },
    turn: function(msg) {
        if (msg === 'OFF') {
            // cooling and poweroff
            GPIO.write(heater.heat_pin, OFF);
            heater.state = heater.cooling;
            heater.timerid = Timer.set(heater.cooling_time, 0, function () {
                    GPIO.write(heater.blower_pin, OFF);
                    heater.state = heater.off;
                    MQTT.pub(heater_sta_topic, heater.state, 0, 1);
                }, null);
            }             
        if (msg === 'ON') {
            if (heater.state === heater.cooling) { Timer.del(heater.timerid) };
            GPIO.write(heater.blower_pin, ON);
            GPIO.write(heater.heat_pin, ON);
            heater.state = heater.heat;
        };
        MQTT.pub(heater_sta_topic, heater.state, 0, 1);
    }
};


// 1,5 zones used
// pin5 - DHT22
let alarm_pins = {
    zone1_pin: 12,
   // zone2_pin: 13,
   // zone3_pin: 5,
   // zone4_pin: 4,
   zone5_pin: 14
};


let state = {
    // armed: 1, // Initial state - alarm on
    zone1: 'OFF',
    zone2: 'OFF',
    zone3: 'OFF',
    zone4: 'OFF',
    zone5: 'OFF',
    temp: 0,
    hum: 0 
};

// Heater topics
let heater_cmd_topic = 'heater/cmnd'; // command topic (receive)
let heater_sta_topic = 'heater/stat'; // States: 0-'OFF', 1-'Cooling', 2-'Heating'

// Alarm topics
let event_topic = 'alarm/event'; // publish JSON on events with all zones states
let heartbeat_topic = 'alarm/heartbeat';  // publish something for keepalive
let evs = '???'; //network state
let pub_result = 1;


// Initialize pins
GPIO.set_mode(led_pin, GPIO.MODE_OUTPUT);
let dht_sensor = DHT.create(dht_pin, DHT.DHT22);


let init_pin = function(pin) {
    print('Initializing pin: ', pin);
    GPIO.set_mode(pin, GPIO.MODE_INPUT);
    GPIO.set_pull(pin, GPIO.PULL_UP);
};


init_pin(alarm_pins.zone1_pin);
// init_pin(alarm_pins.zone2_pin);
// used by DHT init_pin(alarm_pins.zone3_pin);
// init_pin(alarm_pins.zone4_pin);
// init_pin(alarm_pins.zone5_pin);


// alarm logic

// Functions
let led_flash = function(n) {
    // Flash led n-times
    for (let i = 0; i < n; i++) {
        GPIO.write(led_pin, ON);
        Sys.usleep(20000);
        GPIO.write(led_pin, OFF);
        Sys.usleep(40000);
    }
};

let getInfo = function() {
    let h = dht_sensor.getHumidity();
    let t = dht_sensor.getTemp();
    // DHT22 sometimes gives wrong values
    if (t < 100) {
        state.temp = t;
        state.hum = h;
    }
    return JSON.stringify(state);
};


heater.initialize();
// Subscribe for incoming heater commands
MQTT.sub(heater_cmd_topic, function(conn, topic, msg) {
    print('Heater recieved command:', topic, 'message:', msg);
    heater.turn(msg);
}, null);


// Blink built-in LED & publish heartbeat with states
// once - got IP
// twice - connecting
// 3-time - disconnected
GPIO.write(led_pin, OFF);

Timer.set(10000 /* 10 (sec) */ , Timer.REPEAT, function() {
    // check zone connection
    if ( GPIO.read(alarm_pins.zone1_pin) === ARMED ) {
        state.zone1 = 'OK';
    }
    // if ( GPIO.read(alarm_pins.zone5_pin) === ARMED ) {
    //     state.zone5 = 'OK';
    // }

    pub_result = MQTT.pub(heartbeat_topic, getInfo(), 0, 0);
    if (pub_result !== 1) { heater.turn('OFF') }; // force turn off heater when connection lost

    if (evs === 'GOT_IP') { led_flash(1) } else
    if (evs === 'CONNECTING') { led_flash(2) } else
    if (evs === 'DISCONNECTED') { led_flash(3) }
}, null);

// send state to event topic
let publish_event = function() {
    MQTT.pub(event_topic, getInfo(), 0, 0);
    GPIO.write(led_pin, ON);
};


// ZONE1 event handler
GPIO.set_button_handler(alarm_pins.zone1_pin, GPIO.PULL_UP, GPIO.INT_EDGE_POS, 400, function() {
        if (state.zone1 === 'ALARM') { return }
        state.zone1 = 'ALARM';
        publish_event();
        Timer.set(2000, 0, function() {
          state.zone1 = 'OK';
          MQTT.pub(event_topic, getInfo(), 0, 0);
        }, null);
    }, null);


// Monitor network connectivity.
Event.addGroupHandler(Net.EVENT_GRP, function(ev, evdata, arg) {
    if (ev === Net.STATUS_DISCONNECTED) {
        evs = 'DISCONNECTED';
    } else if (ev === Net.STATUS_CONNECTING) {
        evs = 'CONNECTING';
    } else if (ev === Net.STATUS_CONNECTED) {
        evs = 'CONNECTED';
    } else if (ev === Net.STATUS_GOT_IP) {
        evs = 'GOT_IP';
    }
    print('== Net event:', ev, evs);
}, null);
