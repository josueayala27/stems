//! Buses and the routing matrix (docs/architecture/02-audio-engine.md, "Tracks and routing").
//!
//! Every track plays into one bus. A bus has a gain, a mute and a list of device channels. The
//! routing belongs to the rig, never to the song: songs pick a bus, the rig maps buses to channels.
//!
//! Fold rules, from a bus's channel list in order:
//! - channels at or past the device's channel count are dropped;
//! - the rest pair up: `[0, 1]` sends left to 0 and right to 1, `[0, 1, 4, 5]` feeds two pairs;
//! - a channel left over at the end gets the mono fold, `0.5 * (left + right)`;
//! - no channels: the bus is silent;
//! - buses that share a channel add up.

use serde::{Deserialize, Serialize};

use crate::EngineError;

/// Buses the mixer holds. Fixed so the real-time state has no heap.
pub const MAX_BUSES: usize = 16;
/// Device channels one bus can feed.
pub const MAX_BUS_CHANNELS: usize = 8;

/// One bus as the real-time thread reads it.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BusRoute {
    pub gain: f32,
    pub muted: bool,
    channels: [u16; MAX_BUS_CHANNELS],
    channel_count: usize,
}

impl BusRoute {
    pub fn new(gain: f32, muted: bool, channels: &[u16]) -> Self {
        let mut route = Self { gain: clean_gain(gain), muted, channels: [0; MAX_BUS_CHANNELS], channel_count: 0 };
        for &channel in channels.iter().take(MAX_BUS_CHANNELS) {
            route.channels[route.channel_count] = channel;
            route.channel_count += 1;
        }
        route
    }

    pub fn set_gain(&mut self, gain: f32) {
        self.gain = clean_gain(gain);
    }

    pub fn channels(&self) -> &[u16] {
        &self.channels[..self.channel_count]
    }

    /// Where this bus goes on a device with `device_channels` outputs, after the fold rules.
    pub fn targets(&self, device_channels: usize) -> Targets {
        let mut targets = Targets::default();
        let mut pending: Option<u16> = None;
        for &channel in self.channels() {
            if usize::from(channel) >= device_channels {
                continue;
            }
            match pending.take() {
                None => pending = Some(channel),
                Some(left) => targets.push(Target::Stereo { left, right: channel }),
            }
        }
        if let Some(channel) = pending {
            targets.push(Target::Mono(channel));
        }
        targets
    }

    /// The fader target: 0 when muted.
    pub fn level(&self) -> f32 {
        if self.muted {
            0.0
        } else {
            self.gain
        }
    }
}

/// One destination of a bus on the device.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Target {
    Stereo { left: u16, right: u16 },
    /// Left and right folded to one channel.
    Mono(u16),
}

/// A bus's destinations, at most `MAX_BUS_CHANNELS` of them. No heap.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Targets {
    items: [Option<Target>; MAX_BUS_CHANNELS],
    len: usize,
}

impl Targets {
    fn push(&mut self, target: Target) {
        if self.len < MAX_BUS_CHANNELS {
            self.items[self.len] = Some(target);
            self.len += 1;
        }
    }

    pub fn iter(&self) -> impl Iterator<Item = Target> + '_ {
        self.items[..self.len].iter().flatten().copied()
    }

    pub fn is_empty(&self) -> bool {
        self.len == 0
    }
}

/// Which bus each kind of sound plays into when a track names none.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RoleBuses {
    pub stem: usize,
    pub click: usize,
    pub guide: usize,
    pub pad: usize,
    /// LTC plays only into this bus; `None` keeps it silent.
    pub timecode: Option<usize>,
}

/// The whole routing table. Sent to the mixer in a `Box` and handed back when replaced.
#[derive(Debug, Clone, PartialEq)]
pub struct Routing {
    buses: [BusRoute; MAX_BUSES],
    bus_count: usize,
    pub roles: RoleBuses,
}

impl Routing {
    /// One stereo bus on channels 1 and 2 that every track plays into: the routing before a rig.
    pub fn stereo() -> Self {
        let mut buses = [BusRoute::new(1.0, false, &[]); MAX_BUSES];
        buses[0] = BusRoute::new(1.0, false, &[0, 1]);
        Self { buses, bus_count: 1, roles: RoleBuses { stem: 0, click: 0, guide: 0, pad: 0, timecode: None } }
    }

    pub fn from_doc(doc: &RoutingDoc) -> crate::Result<Self> {
        if doc.buses.is_empty() || doc.buses.len() > MAX_BUSES {
            return Err(EngineError::Routing(format!("a rig needs 1 to {MAX_BUSES} buses, not {}", doc.buses.len())));
        }
        let count = doc.buses.len();
        let pick = |bus: usize, what: &str| {
            if bus < count {
                Ok(bus)
            } else {
                Err(EngineError::Routing(format!("the {what} bus {bus} does not exist")))
            }
        };
        let roles = RoleBuses {
            stem: pick(doc.stem_bus, "stem")?,
            click: pick(doc.click_bus, "click")?,
            guide: pick(doc.guide_bus, "guide")?,
            pad: pick(doc.pad_bus, "pad")?,
            timecode: doc.timecode_bus.map(|bus| pick(bus, "timecode")).transpose()?,
        };
        let mut buses = [BusRoute::new(1.0, false, &[]); MAX_BUSES];
        for (slot, bus) in buses.iter_mut().zip(&doc.buses) {
            if bus.channels.len() > MAX_BUS_CHANNELS {
                return Err(EngineError::Routing(format!("a bus feeds at most {MAX_BUS_CHANNELS} channels")));
            }
            *slot = BusRoute::new(bus.gain, bus.mute, &bus.channels);
        }
        Ok(Self { buses, bus_count: count, roles })
    }

    pub fn buses(&self) -> &[BusRoute] {
        &self.buses[..self.bus_count]
    }

    pub fn bus_count(&self) -> usize {
        self.bus_count
    }

    pub fn bus_mut(&mut self, bus: usize) -> Option<&mut BusRoute> {
        self.buses[..self.bus_count].get_mut(bus)
    }

    /// The bus a track plays into: its own if it names a valid one, else its role's.
    pub fn resolve(&self, bus: Option<usize>, role_bus: usize) -> usize {
        match bus {
            Some(bus) if bus < self.bus_count => bus,
            _ => role_bus,
        }
    }
}

impl Default for Routing {
    fn default() -> Self {
        Self::stereo()
    }
}

fn clean_gain(gain: f32) -> f32 {
    if gain.is_finite() {
        gain.clamp(0.0, 4.0)
    } else {
        0.0
    }
}

// ── Documents (`engine_set_routing`) ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BusDoc {
    #[serde(default = "unity")]
    pub gain: f32,
    #[serde(default)]
    pub mute: bool,
    /// Zero-based device channels, in order: pairs are left and right, a last odd one is mono.
    #[serde(default)]
    pub channels: Vec<u16>,
}

fn unity() -> f32 {
    1.0
}

/// The rig's buses by index, as the UI resolves them from bus names.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutingDoc {
    pub buses: Vec<BusDoc>,
    #[serde(default)]
    pub stem_bus: usize,
    #[serde(default)]
    pub click_bus: usize,
    #[serde(default)]
    pub guide_bus: usize,
    #[serde(default)]
    pub pad_bus: usize,
    /// The LTC bus. `None`: timecode plays nowhere.
    #[serde(default)]
    pub timecode_bus: Option<usize>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn targets(channels: &[u16], device: usize) -> Vec<Target> {
        BusRoute::new(1.0, false, channels).targets(device).iter().collect()
    }

    #[test]
    fn pairs_are_stereo_and_a_trailing_channel_is_mono() {
        assert_eq!(targets(&[0, 1], 2), vec![Target::Stereo { left: 0, right: 1 }]);
        assert_eq!(targets(&[2], 8), vec![Target::Mono(2)]);
        assert_eq!(
            targets(&[0, 1, 4, 5, 7], 8),
            vec![Target::Stereo { left: 0, right: 1 }, Target::Stereo { left: 4, right: 5 }, Target::Mono(7)]
        );
        assert!(targets(&[], 8).is_empty());
    }

    #[test]
    fn channels_the_device_lacks_are_dropped_before_pairing() {
        // A stereo bus on a mono device folds to channel 0.
        assert_eq!(targets(&[0, 1], 1), vec![Target::Mono(0)]);
        // IEM on 2/3 with only two outputs: nothing to send.
        assert!(targets(&[2, 3], 2).is_empty());
        // 0 and 5 survive on a 6-out device and pair up.
        assert_eq!(targets(&[0, 8, 5], 6), vec![Target::Stereo { left: 0, right: 5 }]);
    }

    #[test]
    fn documents_validate_bus_counts_and_role_buses() {
        let bus = BusDoc { gain: 1.0, mute: false, channels: vec![0, 1] };
        let doc = RoutingDoc { buses: vec![bus.clone(), bus.clone()], stem_bus: 0, click_bus: 1, guide_bus: 1, pad_bus: 0, timecode_bus: None };
        let routing = Routing::from_doc(&doc).unwrap();
        assert_eq!(routing.bus_count(), 2);
        assert_eq!(routing.roles.click, 1);
        assert!(Routing::from_doc(&RoutingDoc { click_bus: 2, ..doc.clone() }).is_err());
        assert!(Routing::from_doc(&RoutingDoc { timecode_bus: Some(2), ..doc.clone() }).is_err());
        assert!(Routing::from_doc(&RoutingDoc { buses: vec![], ..doc.clone() }).is_err());
        assert!(Routing::from_doc(&RoutingDoc { buses: vec![bus; MAX_BUSES + 1], ..doc }).is_err());
    }

    #[test]
    fn a_track_falls_back_to_its_role_bus() {
        let doc = RoutingDoc {
            buses: vec![BusDoc { gain: 1.0, mute: false, channels: vec![] }; 3],
            stem_bus: 0,
            click_bus: 2,
            guide_bus: 2,
            pad_bus: 0,
            timecode_bus: Some(1),
        };
        let routing = Routing::from_doc(&doc).unwrap();
        assert_eq!(routing.resolve(Some(1), 0), 1);
        assert_eq!(routing.resolve(Some(9), 2), 2);
        assert_eq!(routing.resolve(None, 2), 2);
    }

    #[test]
    fn gains_are_clamped_and_mute_zeroes_the_level() {
        let route = BusRoute::new(f32::NAN, false, &[0]);
        assert_eq!(route.gain, 0.0);
        assert_eq!(BusRoute::new(9.0, false, &[0]).gain, 4.0);
        assert_eq!(BusRoute::new(0.5, true, &[0]).level(), 0.0);
    }
}
