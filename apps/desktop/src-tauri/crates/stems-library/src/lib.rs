//! Library: stem import, hashing, waveform peaks and analysis. Decoding arrives in M2.

use std::path::Path;

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
