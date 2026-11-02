use std::fmt;

pub type Result<T, E = LibraryError> = std::result::Result<T, E>;

#[derive(Debug)]
pub enum LibraryError {
    Io(std::io::Error),
    Engine(stems_engine::EngineError),
    /// A peak file that is not in the expected format.
    BadPeaks(String),
    /// Nothing left to import after probing and length checks.
    NothingToImport,
}

impl fmt::Display for LibraryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(f, "I/O error: {error}"),
            Self::Engine(error) => write!(f, "{error}"),
            Self::BadPeaks(message) => write!(f, "peak file: {message}"),
            Self::NothingToImport => write!(f, "no audio files to import"),
        }
    }
}

impl std::error::Error for LibraryError {}

impl From<std::io::Error> for LibraryError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<stems_engine::EngineError> for LibraryError {
    fn from(error: stems_engine::EngineError) -> Self {
        Self::Engine(error)
    }
}
