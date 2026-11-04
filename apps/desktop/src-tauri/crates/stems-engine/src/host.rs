//! The control thread. It owns the device stream (not `Send` on every platform), the engine
//! handle and the songs' disk threads, publishes state at about 60 Hz and reopens a lost device.
//!
//! It never does slow work itself: songs and pads decode on worker threads and come back as
//! finished jobs, so commands are answered at once even while the next song loads. When requests
//! overlap, the newest wins and older ones are answered with `Superseded`.

use std::path::PathBuf;
use std::sync::mpsc::{self, RecvTimeoutError};
use std::thread;
use std::time::{Duration, Instant};

use crate::command::{At, Command, Transport};
use crate::device::{self, DeviceInfo, OpenedOutput, Output, OutputConfig};
use crate::engine::{self, Built, Engine, PerformOptions, SongDoc, SongInfo, TransitionDoc};
use crate::mixer::Mixer;
use crate::pad::Pad;
use crate::routing::{Routing, RoutingDoc};
use stems_control::midi::{self as midi_out, MidiOut};
use stems_control::MidiMessage;
use crate::state::EngineState;
use crate::EngineError;

const TICK: Duration = Duration::from_millis(16);
const REOPEN_INTERVAL: Duration = Duration::from_secs(1);
const MIXER_RETURN_TIMEOUT: Duration = Duration::from_secs(2);
/// How often the MIDI thread looks for fired cue events. Events leave at most this late after
/// the callback that crossed them.
const MIDI_POLL: Duration = Duration::from_millis(1);

type Reply<T> = mpsc::Sender<crate::Result<T>>;

/// A job a worker thread finished.
enum Finished {
    Song { tag: u64, built: crate::Result<Box<Built>>, doc: Box<SongDoc>, next: Option<TransitionDoc>, reply: Reply<SongInfo> },
    Pad { serial: u64, pad: crate::Result<Box<Pad>>, file: PathBuf, reply: Reply<()> },
}

enum Request {
    Devices(Reply<Vec<DeviceInfo>>),
    Open(OutputConfig, Reply<OpenedOutput>),
    Close(Reply<()>),
    LoadFiles(Vec<PathBuf>, Reply<SongInfo>),
    LoadSong(Box<SongDoc>, Reply<SongInfo>),
    PrepareNext(Box<SongDoc>, TransitionDoc, Reply<SongInfo>),
    ClearNext(Reply<()>),
    SetOptions(PerformOptions, Reply<()>),
    SetPad(Option<PathBuf>, Reply<()>),
    SetRouting(RoutingDoc, Reply<()>),
    MidiPorts(Reply<Vec<String>>),
    SetMidiOutput(Option<String>, Reply<()>),
    Command(Option<u64>, Transport, Reply<()>),
    State(Reply<Option<EngineState>>),
}

/// Handle to the control thread. Cheap to clone; every call is a message and a reply.
#[derive(Clone)]
pub struct EngineHost {
    requests: mpsc::Sender<Request>,
}

impl EngineHost {
    /// Start the control thread. `on_state` runs on it about 60 times a second once a device was opened.
    pub fn spawn(on_state: impl FnMut(&EngineState) + Send + 'static) -> crate::Result<Self> {
        let (requests, inbox) = mpsc::channel();
        thread::Builder::new().name("stems-control".into()).spawn(move || {
            Control::new(Box::new(on_state)).run(inbox);
        })?;
        Ok(Self { requests })
    }

    fn call<T>(&self, request: impl FnOnce(Reply<T>) -> Request) -> crate::Result<T> {
        let (reply, answer) = mpsc::channel();
        self.requests.send(request(reply)).map_err(|_| EngineError::Disconnected)?;
        answer.recv().map_err(|_| EngineError::Disconnected)?
    }

    pub fn devices(&self) -> crate::Result<Vec<DeviceInfo>> {
        self.call(Request::Devices)
    }

    pub fn open(&self, config: OutputConfig) -> crate::Result<OpenedOutput> {
        self.call(|reply| Request::Open(config, reply))
    }

    pub fn close(&self) -> crate::Result<()> {
        self.call(Request::Close)
    }

    /// Plain files as one song, no timeline.
    pub fn load_files(&self, paths: Vec<PathBuf>) -> crate::Result<SongInfo> {
        self.call(|reply| Request::LoadFiles(paths, reply))
    }

    pub fn load_song(&self, doc: SongDoc) -> crate::Result<SongInfo> {
        self.call(|reply| Request::LoadSong(Box::new(doc), reply))
    }

    pub fn prepare_next(&self, doc: SongDoc, transition: TransitionDoc) -> crate::Result<SongInfo> {
        self.call(|reply| Request::PrepareNext(Box::new(doc), transition, reply))
    }

    pub fn clear_next(&self) -> crate::Result<()> {
        self.call(Request::ClearNext)
    }

    pub fn set_options(&self, options: PerformOptions) -> crate::Result<()> {
        self.call(|reply| Request::SetOptions(options, reply))
    }

    pub fn set_pad(&self, file: Option<PathBuf>) -> crate::Result<()> {
        self.call(|reply| Request::SetPad(file, reply))
    }

    /// Send a transport command, at once or at a frame of the engine clock.
    /// MIDI output ports (and the virtual `Stems` source on macOS).
    pub fn midi_ports(&self) -> crate::Result<Vec<String>> {
        self.call(Request::MidiPorts)
    }

    /// Send cue events to this MIDI port, or nowhere with `None`.
    pub fn set_midi_output(&self, port: Option<String>) -> crate::Result<()> {
        self.call(|reply| Request::SetMidiOutput(port, reply))
    }

    /// The rig's buses and routing. Kept across device reopens.
    pub fn set_routing(&self, doc: RoutingDoc) -> crate::Result<()> {
        self.call(|reply| Request::SetRouting(doc, reply))
    }

    pub fn command(&self, transport: Transport, at: Option<u64>) -> crate::Result<()> {
        self.call(|reply| Request::Command(at, transport, reply))
    }

    pub fn state(&self) -> crate::Result<Option<EngineState>> {
        self.call(Request::State)
    }
}

struct Control {
    on_state: Box<dyn FnMut(&EngineState) + Send>,
    engine: Option<Engine>,
    output: Option<Output>,
    config: Option<OutputConfig>,
    /// What is loaded, to rebuild after a sample-rate change.
    song: Option<SongDoc>,
    next: Option<(SongDoc, TransitionDoc)>,
    options: PerformOptions,
    pad: Option<PathBuf>,
    /// The rig's routing, sent again to a new mixer after a sample-rate change.
    routing: Option<RoutingDoc>,
    midi: mpsc::Sender<MidiCommand>,
    mixer_home: mpsc::Sender<Mixer>,
    mixers: mpsc::Receiver<Mixer>,
    /// The mixer while no stream holds it.
    parked: Option<Mixer>,
    last_reopen: Instant,
    /// The device failed and the control thread is reopening it.
    lost: bool,
    finished_tx: mpsc::Sender<Finished>,
    finished: mpsc::Receiver<Finished>,
    /// Tags of the newest current-song and next-song loads, and the newest pad request.
    latest_current: u64,
    latest_next: u64,
    latest_pad: u64,
}

impl Control {
    fn new(on_state: Box<dyn FnMut(&EngineState) + Send>) -> Self {
        let (mixer_home, mixers) = mpsc::channel();
        let (finished_tx, finished) = mpsc::channel();
        Self {
            on_state,
            engine: None,
            output: None,
            config: None,
            song: None,
            next: None,
            options: PerformOptions::default(),
            pad: None,
            routing: None,
            midi: spawn_midi(),
            mixer_home,
            mixers,
            parked: None,
            last_reopen: Instant::now(),
            lost: false,
            finished_tx,
            finished,
            latest_current: 0,
            latest_next: 0,
            latest_pad: 0,
        }
    }

    fn run(mut self, inbox: mpsc::Receiver<Request>) {
        loop {
            match inbox.recv_timeout(TICK) {
                Ok(request) => self.handle(request),
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
            while let Ok(job) = self.finished.try_recv() {
                self.finish(job);
            }
            self.tick();
        }
        self.stop_output();
    }

    fn handle(&mut self, request: Request) {
        match request {
            Request::Devices(reply) => {
                let _ = reply.send(device::list_output_devices());
            }
            Request::Open(config, reply) => {
                let result = self.open(config);
                let _ = reply.send(result);
            }
            Request::Close(reply) => {
                self.stop_output();
                self.config = None;
                self.lost = false;
                let _ = reply.send(Ok(()));
            }
            Request::LoadFiles(paths, reply) => {
                let result = self.with_engine(|engine| engine.load_files(&paths));
                if result.is_ok() {
                    self.song = Some(SongDoc::from_files(&paths, 0));
                }
                let _ = reply.send(result);
            }
            Request::LoadSong(doc, reply) => self.build(doc, None, reply),
            Request::PrepareNext(doc, transition, reply) => self.build(doc, Some(transition), reply),
            Request::ClearNext(reply) => {
                self.next = None;
                self.latest_next = 0;
                let _ = reply.send(self.with_engine(Engine::clear_next));
            }
            Request::SetOptions(options, reply) => {
                self.options = options.clone();
                let result = match self.engine.as_mut() {
                    Some(engine) => engine.set_options(options),
                    None => Ok(()),
                };
                let _ = reply.send(result);
            }
            Request::SetPad(file, reply) => {
                self.latest_pad += 1;
                let Some(engine) = self.engine.as_mut() else {
                    let _ = reply.send(Err(EngineError::NotOpen));
                    return;
                };
                match file {
                    None => {
                        let result = engine.install_pad(None);
                        if result.is_ok() {
                            self.pad = None;
                        }
                        let _ = reply.send(result);
                    }
                    Some(file) => {
                        let (serial, rate, done) = (self.latest_pad, engine.sample_rate(), self.finished_tx.clone());
                        spawn_worker(move || {
                            let pad = engine::decode_pad(&file, rate);
                            let _ = done.send(Finished::Pad { serial, pad, file, reply });
                        });
                    }
                }
            }
            Request::SetRouting(doc, reply) => {
                let result = match self.engine.as_mut() {
                    Some(engine) => engine.set_routing(&doc),
                    None => Routing::from_doc(&doc).map(drop),
                };
                if result.is_ok() {
                    self.routing = Some(doc);
                }
                let _ = reply.send(result);
            }
            Request::MidiPorts(reply) => {
                let _ = reply.send(midi_out::output_ports().map_err(|error| EngineError::Midi(error.to_string())));
            }
            Request::SetMidiOutput(port, reply) => {
                let result = match port {
                    None => Ok(None),
                    Some(name) => MidiOut::connect(&name).map(Some).map_err(|error| EngineError::Midi(error.to_string())),
                };
                let result = result.map(|output| {
                    let _ = self.midi.send(MidiCommand::Output(output));
                });
                let _ = reply.send(result);
            }
            Request::Command(at, transport, reply) => {
                self.remember(transport);
                let result = match self.engine.as_mut() {
                    Some(engine) => engine.schedule(at.map_or(At::Now, At::Clock), Command::from(transport)),
                    None => Err(EngineError::NotOpen),
                };
                let _ = reply.send(result);
            }
            Request::State(reply) => {
                let _ = reply.send(Ok(self.engine.as_mut().map(Engine::state)));
            }
        }
    }

    /// Keep bus fader moves in the stored routing, so a rebuilt mixer gets them back.
    fn remember(&mut self, transport: Transport) {
        let Some(routing) = self.routing.as_mut() else { return };
        match transport {
            Transport::BusGain { bus, gain } => {
                if let Some(doc) = routing.buses.get_mut(bus) {
                    doc.gain = gain;
                }
            }
            Transport::BusMute { bus, muted } => {
                if let Some(doc) = routing.buses.get_mut(bus) {
                    doc.mute = muted;
                }
            }
            _ => {}
        }
    }

    /// Start building a song on a worker thread. `next` is the transition when it is the next song.
    fn build(&mut self, doc: Box<SongDoc>, next: Option<TransitionDoc>, reply: Reply<SongInfo>) {
        let Some(engine) = self.engine.as_mut() else {
            let _ = reply.send(Err(EngineError::NotOpen));
            return;
        };
        let job = engine.build_job(&doc);
        let tag = job.tag();
        if next.is_some() {
            self.latest_next = tag;
        } else {
            self.latest_current = tag;
        }
        let done = self.finished_tx.clone();
        spawn_worker(move || {
            let built = job.run().map(Box::new);
            let _ = done.send(Finished::Song { tag, built, doc, next, reply });
        });
    }

    fn finish(&mut self, job: Finished) {
        match job {
            Finished::Song { tag, built, doc, next, reply } => {
                let latest = if next.is_some() { self.latest_next } else { self.latest_current };
                let result = match (built, self.engine.as_mut()) {
                    (_, _) if tag != latest => Err(EngineError::Superseded),
                    (Err(error), _) => Err(error),
                    (Ok(_), None) => Err(EngineError::NotOpen),
                    (Ok(built), Some(engine)) => engine.install(*built, next),
                };
                if result.is_ok() {
                    match next {
                        Some(transition) => self.next = Some((*doc, transition)),
                        None => self.song = Some(*doc),
                    }
                }
                let _ = reply.send(result);
            }
            Finished::Pad { serial, pad, file, reply } => {
                let result = match (pad, self.engine.as_mut()) {
                    (_, _) if serial != self.latest_pad => Err(EngineError::Superseded),
                    (Err(error), _) => Err(error),
                    (Ok(_), None) => Err(EngineError::NotOpen),
                    (Ok(pad), Some(engine)) => engine.install_pad(Some(pad)),
                };
                if result.is_ok() {
                    self.pad = Some(file);
                }
                let _ = reply.send(result);
            }
        }
    }

    fn with_engine<T>(&mut self, work: impl FnOnce(&mut Engine) -> crate::Result<T>) -> crate::Result<T> {
        match self.engine.as_mut() {
            Some(engine) => work(engine),
            None => Err(EngineError::NotOpen),
        }
    }

    /// Stop the stream and take the mixer back.
    fn stop_output(&mut self) {
        if self.output.take().is_some() {
            self.parked = self.mixers.recv_timeout(MIXER_RETURN_TIMEOUT).ok();
        }
    }

    fn open(&mut self, config: OutputConfig) -> crate::Result<OpenedOutput> {
        let resolved = device::resolve(&config)?;
        let rate = resolved.info.sample_rate;
        self.stop_output();

        let same_rate = self.engine.as_ref().is_some_and(|engine| engine.sample_rate() == rate);
        let mixer = match self.parked.take() {
            Some(mixer) if same_rate => mixer,
            _ => {
                // A new rate needs a new mixer, and the songs decoded again at that rate.
                let (mut engine, mixer) = engine::new(rate);
                if let Some(events) = engine.take_midi() {
                    let _ = self.midi.send(MidiCommand::Attach(events));
                }
                let _ = engine.set_options(self.options.clone());
                if let Some(doc) = &self.routing {
                    if engine.set_routing(doc).is_err() {
                        self.routing = None;
                    }
                }
                if let Some(doc) = &self.song {
                    if engine.load_song(doc).is_err() {
                        self.song = None;
                    }
                }
                if let Some((doc, transition)) = &self.next {
                    if engine.prepare_next(doc, *transition).is_err() {
                        self.next = None;
                    }
                }
                if self.pad.is_some() && engine.set_pad(self.pad.as_deref()).is_err() {
                    self.pad = None;
                }
                self.engine = Some(engine);
                mixer
            }
        };
        match device::open(resolved, mixer, self.mixer_home.clone()) {
            Ok(output) => {
                let info = output.info.clone();
                self.output = Some(output);
                self.config = Some(config);
                Ok(info)
            }
            Err(error) => {
                self.parked = self.mixers.recv_timeout(MIXER_RETURN_TIMEOUT).ok();
                Err(error)
            }
        }
    }

    fn tick(&mut self) {
        if self.output.as_ref().is_some_and(Output::failed) {
            // The device is gone. Take the mixer back and retry until it returns.
            self.stop_output();
            self.lost = true;
        }
        if self.lost && self.last_reopen.elapsed() >= REOPEN_INTERVAL {
            self.last_reopen = Instant::now();
            match self.config.clone() {
                Some(config) => self.lost = self.open(config).is_err(),
                None => self.lost = false,
            }
        }
        if let Some(engine) = self.engine.as_mut() {
            let state = engine.state();
            (self.on_state)(&state);
        }
    }
}

enum MidiCommand {
    /// The fired-event queue of a new mixer.
    Attach(rtrb::Consumer<MidiMessage>),
    Output(Option<MidiOut>),
}

/// The MIDI thread: sends each fired cue event as soon as it sees it. Off the control thread, so
/// a slow song load never delays MIDI.
fn spawn_midi() -> mpsc::Sender<MidiCommand> {
    let (sender, inbox) = mpsc::channel::<MidiCommand>();
    let _ = thread::Builder::new().name("stems-midi".into()).spawn(move || {
        let mut events: Option<rtrb::Consumer<MidiMessage>> = None;
        let mut output: Option<MidiOut> = None;
        loop {
            match inbox.recv_timeout(MIDI_POLL) {
                Ok(MidiCommand::Attach(queue)) => events = Some(queue),
                Ok(MidiCommand::Output(port)) => output = port,
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
            if let Some(queue) = events.as_mut() {
                while let Ok(message) = queue.pop() {
                    if let Some(port) = output.as_mut() {
                        let _ = port.send(&message);
                    }
                }
            }
        }
    });
    sender
}

fn spawn_worker(work: impl FnOnce() + Send + 'static) {
    // If the thread cannot start, `work` (and its reply sender) is dropped and the caller sees
    // `Disconnected` instead of waiting forever.
    let _ = thread::Builder::new().name("stems-load".into()).spawn(work);
}
