//! The control thread. It owns the device stream (not `Send` on every platform), the engine
//! handle and the song's disk thread, publishes state at about 60 Hz and reopens a lost device.

use std::path::PathBuf;
use std::sync::mpsc::{self, RecvTimeoutError};
use std::thread;
use std::time::{Duration, Instant};

use crate::command::{At, Command, Transport};
use crate::device::{self, DeviceInfo, OpenedOutput, Output, OutputConfig};
use crate::engine::{self, Engine, PerformOptions, SongDoc, SongInfo, TransitionDoc};
use crate::mixer::Mixer;
use crate::state::EngineState;
use crate::EngineError;

const TICK: Duration = Duration::from_millis(16);
const REOPEN_INTERVAL: Duration = Duration::from_secs(1);
const MIXER_RETURN_TIMEOUT: Duration = Duration::from_secs(2);

type Reply<T> = mpsc::Sender<crate::Result<T>>;

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
    Command(Option<u64>, Transport, Reply<()>),
    State(Reply<Option<EngineState>>),
}

/// Handle to the control thread. Cheap to share; every call is a message and a reply.
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
    mixer_home: mpsc::Sender<Mixer>,
    mixers: mpsc::Receiver<Mixer>,
    /// The mixer while no stream holds it.
    parked: Option<Mixer>,
    last_reopen: Instant,
    /// The device failed and the control thread is reopening it.
    lost: bool,
}

impl Control {
    fn new(on_state: Box<dyn FnMut(&EngineState) + Send>) -> Self {
        let (mixer_home, mixers) = mpsc::channel();
        Self {
            on_state,
            engine: None,
            output: None,
            config: None,
            song: None,
            next: None,
            options: PerformOptions::default(),
            pad: None,
            mixer_home,
            mixers,
            parked: None,
            last_reopen: Instant::now(),
            lost: false,
        }
    }

    fn run(mut self, inbox: mpsc::Receiver<Request>) {
        loop {
            match inbox.recv_timeout(TICK) {
                Ok(request) => self.handle(request),
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
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
            Request::LoadSong(doc, reply) => {
                let result = self.with_engine(|engine| engine.load_song(&doc));
                if result.is_ok() {
                    self.song = Some(*doc);
                }
                let _ = reply.send(result);
            }
            Request::PrepareNext(doc, transition, reply) => {
                let result = self.with_engine(|engine| engine.prepare_next(&doc, transition));
                if result.is_ok() {
                    self.next = Some((*doc, transition));
                }
                let _ = reply.send(result);
            }
            Request::ClearNext(reply) => {
                self.next = None;
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
                let result = self.with_engine(|engine| engine.set_pad(file.as_deref()));
                if result.is_ok() {
                    self.pad = file;
                }
                let _ = reply.send(result);
            }
            Request::Command(at, transport, reply) => {
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
                let _ = engine.set_options(self.options.clone());
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
