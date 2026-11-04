use std::fmt;

pub type Result<T, E = EngineError> = std::result::Result<T, E>;

#[derive(Debug)]
pub enum EngineError {
    Io(std::io::Error),
    /// The file could not be probed or decoded.
    Decode(String),
    /// The audio device could not be found, configured or opened.
    Device(String),
    /// No output device is open, so there is no sample rate to load a song at.
    NotOpen,
    /// The command queue to the real-time thread is full.
    QueueFull,
    TooManyTracks(usize),
    /// The control thread is gone.
    Disconnected,
    /// A newer request replaced this one before it finished (or the device rate changed).
    Superseded,
    /// A routing document the mixer cannot use.
    Routing(String),
    Midi(String),
}

impl fmt::Display for EngineError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(f, "I/O error: {error}"),
            Self::Decode(message) => write!(f, "decode error: {message}"),
            Self::Device(message) => write!(f, "audio device error: {message}"),
            Self::NotOpen => write!(f, "no audio device is open"),
            Self::QueueFull => write!(f, "the engine command queue is full"),
            Self::TooManyTracks(count) => {
                write!(f, "{count} tracks is more than the limit of {}", crate::MAX_TRACKS)
            }
            Self::Disconnected => write!(f, "the engine thread has stopped"),
            Self::Superseded => write!(f, "replaced by a newer request"),
            Self::Routing(message) => write!(f, "routing error: {message}"),
            Self::Midi(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for EngineError {}

impl From<std::io::Error> for EngineError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<symphonia::core::errors::Error> for EngineError {
    fn from(error: symphonia::core::errors::Error) -> Self {
        Self::Decode(error.to_string())
    }
}

impl From<cpal::Error> for EngineError {
    fn from(error: cpal::Error) -> Self {
        Self::Device(error.to_string())
    }
}
