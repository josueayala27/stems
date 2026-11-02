//! Library: stem import, hashing, waveform peaks, tempo analysis and relinking
//! (docs/architecture/07-plan.md, M2). Media stays the user's own files; the database (in the
//! webview) stores paths and hashes, and this crate writes peak files next to it.

use std::path::Path;

pub mod analysis;
mod error;
pub mod hash;
pub mod import;
pub mod naming;
pub mod peaks;
pub mod relink;
#[cfg(test)]
pub(crate) mod testutil;

pub use error::{LibraryError, Result};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Audio file extensions Stems imports as stems (docs/architecture/01-product.md).
pub const STEM_EXTENSIONS: &[&str] = &["wav", "aiff", "aif", "flac", "mp3", "m4a"];

/// Whether a path looks like an importable stem, by extension (case-insensitive).
pub fn is_stem_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| STEM_EXTENSIONS.iter().any(|known| known.eq_ignore_ascii_case(ext)))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognises_stem_extensions() {
        assert!(is_stem_file(Path::new("/stems/Drums.WAV")));
        assert!(is_stem_file(Path::new("bass.flac")));
        assert!(!is_stem_file(Path::new("notes.txt")));
        assert!(!is_stem_file(Path::new("no-extension")));
    }
}
