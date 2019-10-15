NodeMCU for alarm.


It read motion sensor state, teperature/hummidity sensor (connected to GPIO pins) and publish states to MQTT-topic in JSON format.
Also it control 4kW heat blower for protect water pipes from freeze.

Openhab server receive data from it, and do all rest magic. 

It has been written on the spot, and it far from ideal. Sorry ;) 