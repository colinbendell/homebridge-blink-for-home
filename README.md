# homebridge-blink-for-home

## Overview

This enables Blink Cameras to the HomeBridge platform. This includes:
* Security System Arm / Disarming
* Home / Away Switch
* Camera Thumbnails (Liveview WIP)
* Temperature Sensors
* Alerts

## Setup

To configure this set it up as a platform in your homebridge config.json file.
```
"platforms" : [
  {
    "platform" : "Blink",
    "name"     : "Blink System",
    "username" : "<your blink email address>",
    "password" : "<your blink password>",
    "pin"      : "<pin>"
  }
]
```

### Configuration Parameters

* _name_: Only necessary if you want to support multiple Blink accounts
* _username_: Your blink username
* _password_: Your blink password
* _pin_: After 2FA email, this is the PIN provided

### 2FA support
If you have 2FA enabled, you will need to first set the username / password to force the system to attempt to login. On first attempt it will trigger the email validation. With the PIN provided from the 2FA email, update the pin field to proceed. The pin is only needed once per account.

NB: The Device in the email 2FA will appear to be an iPad Mini. This is intentional to increase masquerading.