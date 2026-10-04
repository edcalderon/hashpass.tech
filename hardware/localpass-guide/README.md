# LocalPass Guide

LocalPass Guide is a **wearable, programmable tourism badge** for human local guides.

It complements the fixed LocalPass Node.

- **Node**: fixed at a venue, tourism office, café, hostel, attraction or terminal.
- **Guide**: worn by a person and changes context throughout a tour.

## Product concept

The guide selects the current attraction or route from a phone/operator interface.

The wearable updates its e-ink screen to show:

- LocalPass identity;
- active attraction;
- dynamic QR;
- simple connectivity state;
- optional guide/credential indicator.

Example contexts:

- Peñol Rock;
- Guatapé Town Center;
- Lake Route;
- Coffee Experience;
- Custom stop.

## Why e-ink

E-ink is a strong fit because:

- a QR stays visible with almost no power between refreshes;
- it remains readable in bright outdoor conditions;
- the interface changes infrequently;
- battery life can be substantially better than an always-on LCD/OLED;
- the device retains a friendly “tamagotchi-like” identity without becoming a smartphone.

## MVP architecture

```text
Guide phone / LocalPass operator UI
            |
        BLE / Wi-Fi
            |
            v
+--------------------------+
| LocalPass Guide          |
|                          |
|  e-ink QR + attraction   |
|  ESP32-class MCU         |
|  local Wi-Fi fallback    |
|  device identity         |
|  battery + USB-C         |
+--------------------------+
            |
      tourist scans
            |
            v
     LocalPass experience
```

## Industrial design

Target:

- rounded-square badge;
- approximately 40–70 g target range after engineering validation;
- neck lanyard / clip;
- cream polymer shell;
- replaceable bamboo/wood accent plate;
- one side/action button;
- subtle status LED;
- 2–3 inch class e-ink display;
- USB-C charging.

The wooden appearance is a **brand skin**, not a handcrafted structural requirement.

## Manufacturing strategy

### Prototype

- 3D-printed shell;
- laser-cut veneer;
- off-the-shelf ESP32 board;
- e-ink dev module;
- USB battery.

### Pilot 20–100 units

- small-run molded/CNC/vacuum-cast shell;
- custom PCB;
- laser-cut faceplate;
- replaceable lanyard.

### 100–1,000 units

- standardized molded enclosure;
- custom PCB;
- production e-ink module;
- interchangeable destination faceplate.

### 1,000+

- injection molding;
- DFM redesign;
- regulatory testing by target market;
- controlled provisioning and device key injection.

## Commercial path

Guide device can be:

- purchased;
- sponsor-funded;
- loaned;
- earned-to-own.

Basic LocalPass QR software remains available without owning this device.

See:

- [Product specification](./PRODUCT_SPEC.md)
- [QR protocol](../../apps/localpass/docs/trust/qr-protocol.md)
- [Commercial model](../../apps/localpass/docs/commercial/business-model.md)
