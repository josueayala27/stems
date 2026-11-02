//! Find missing media again by hash in a folder the user picks.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::hash::hash_file;
use crate::is_stem_file;

const MAX_DEPTH: usize = 8;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Missing {
    pub hash: String,
    /// The old path, used to try files with the same name first.
    pub file: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Found {
    pub hash: String,
    pub file: PathBuf,
}

fn collect(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(kind) = entry.file_type() else { continue };
        if kind.is_dir() && depth < MAX_DEPTH {
            collect(&path, depth + 1, out);
        } else if kind.is_file() && is_stem_file(&path) {
            out.push(path);
        }
    }
}

/// Hash audio files under `folder` until every missing hash is found or the files run out.
/// Files whose name matches a missing file's old name are hashed first.
pub fn relink(missing: &[Missing], folder: &Path) -> Vec<Found> {
    let mut wanted: HashMap<&str, &Missing> = missing.iter().map(|m| (m.hash.as_str(), m)).collect();
    let names: Vec<_> = missing.iter().filter_map(|m| m.file.file_name()).collect();
    let mut candidates = Vec::new();
    collect(folder, 0, &mut candidates);
    candidates.sort_by_key(|path| !path.file_name().is_some_and(|name| names.contains(&name)));

    let mut found = Vec::new();
    for path in candidates {
        if wanted.is_empty() {
            break;
        }
        let Ok(hash) = hash_file(&path) else { continue };
        if wanted.remove(hash.as_str()).is_some() {
            found.push(Found { hash, file: path });
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::temp_dir;

    #[test]
    fn finds_moved_and_renamed_files_by_hash() {
        let dir = temp_dir("relink");
        std::fs::create_dir_all(dir.join("new/deeper")).unwrap();
        std::fs::write(dir.join("new/Drums.wav"), b"drums").unwrap();
        std::fs::write(dir.join("new/deeper/bass renamed.wav"), b"bass").unwrap();
        std::fs::write(dir.join("new/other.wav"), b"other").unwrap();
        let drums = hash_file(&dir.join("new/Drums.wav")).unwrap();
        let bass = hash_file(&dir.join("new/deeper/bass renamed.wav")).unwrap();

        let missing = vec![
            Missing { hash: drums.clone(), file: "/old/Drums.wav".into() },
            Missing { hash: bass.clone(), file: "/old/Bass.wav".into() },
            Missing { hash: "00".into(), file: "/old/Gone.wav".into() },
        ];
        let mut found = relink(&missing, &dir.join("new"));
        found.sort_by(|a, b| a.file.cmp(&b.file));
        assert_eq!(
            found,
            vec![
                Found { hash: drums, file: dir.join("new/Drums.wav") },
                Found { hash: bass, file: dir.join("new/deeper/bass renamed.wav") },
            ]
        );
    }
}
