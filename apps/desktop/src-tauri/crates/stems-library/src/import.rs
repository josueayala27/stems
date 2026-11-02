//! Stem import in two steps. `plan` probes the chosen files and checks them (fast, for the
//! import dialog). `import` hashes, optionally copies, computes peaks and analyses tempo, with one
//! worker per core.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use stems_engine::decode::{self, FileReader};
use stems_engine::stream::FrameReader;

use crate::analysis::{self, BpmSource, ClickDetector, EnvelopeBuilder, Tempo};
use crate::hash::hash_file;
use crate::naming::{self, TrackKind};
use crate::peaks::{PeakBuilder, Peaks};
use crate::{is_stem_file, LibraryError};

/// Stems may differ from the median length by this much (export tails, rounding).
pub const LENGTH_TOLERANCE_SECONDS: f64 = 0.5;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbedFile {
    pub path: PathBuf,
    pub name: String,
    pub kind: TrackKind,
    pub color: String,
    pub sample_rate: u32,
    pub channels: usize,
    pub frames: u64,
    pub seconds: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rejected {
    pub path: PathBuf,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPlan {
    /// Suggested song title: the folder name.
    pub title: String,
    pub files: Vec<ProbedFile>,
    pub rejected: Vec<Rejected>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ImportMode {
    /// Copy each file into the library's media folder (named by hash).
    Copy,
    /// Keep the files where they are.
    Reference,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedTrack {
    pub name: String,
    /// Where the track plays from: the copy in the library, or the original.
    pub file: PathBuf,
    pub hash: String,
    pub kind: TrackKind,
    pub color: String,
    pub sample_rate: u32,
    pub channels: usize,
    pub frames: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedSong {
    pub title: String,
    /// The most common file rate. The engine resamples other files to the device rate.
    pub sample_rate: u32,
    /// The longest track, at `sample_rate`.
    pub duration_samples: u64,
    pub tempo: Option<Tempo>,
    pub tracks: Vec<ImportedTrack>,
}

/// The library folder: `media/` for copies, `peaks/` for peak files named `<hash>.stpk`.
#[derive(Debug, Clone)]
pub struct Library {
    root: PathBuf,
}

impl Library {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn media_dir(&self) -> PathBuf {
        self.root.join("media")
    }

    pub fn peaks_dir(&self) -> PathBuf {
        self.root.join("peaks")
    }

    pub fn peaks_path(&self, hash: &str) -> Option<PathBuf> {
        // Hashes are hex; anything else could escape the folder.
        hash.chars().all(|c| c.is_ascii_hexdigit()).then(|| self.peaks_dir().join(format!("{hash}.stpk")))
    }
}

fn expand(paths: &[PathBuf]) -> (Vec<PathBuf>, Vec<Rejected>) {
    let mut files = Vec::new();
    let mut rejected = Vec::new();
    for path in paths {
        if path.is_dir() {
            let mut entries: Vec<PathBuf> = std::fs::read_dir(path)
                .map(|entries| entries.filter_map(|entry| entry.ok().map(|entry| entry.path())).collect())
                .unwrap_or_default();
            entries.sort();
            files.extend(entries.into_iter().filter(|entry| entry.is_file() && is_stem_file(entry)));
        } else if is_stem_file(path) {
            files.push(path.clone());
        } else {
            rejected.push(Rejected { path: path.clone(), reason: "not a WAV, AIFF, FLAC, MP3 or M4A file".into() });
        }
    }
    files.dedup();
    (files, rejected)
}

fn title_for(paths: &[PathBuf]) -> String {
    let folder = match paths {
        [single] if single.is_dir() => Some(single.as_path()),
        _ => paths.first().and_then(|first| first.parent()),
    };
    folder
        .and_then(Path::file_name)
        .or_else(|| paths.first().and_then(|first| first.file_stem()))
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Untitled".into())
}

fn format_seconds(seconds: f64) -> String {
    let tenths = (seconds * 10.0).round() as u64;
    format!("{}:{:02}.{}", tenths / 600, tenths % 600 / 10, tenths % 10)
}

/// Probe folders and files and say which can be imported.
pub fn plan(paths: &[PathBuf]) -> ImportPlan {
    let (candidates, mut rejected) = expand(paths);
    let mut files = Vec::new();
    for path in candidates {
        match decode::probe(&path) {
            Ok(info) => {
                let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
                let guess = naming::guess(&stem);
                files.push(ProbedFile {
                    seconds: info.frames as f64 / f64::from(info.sample_rate.max(1)),
                    path,
                    name: guess.name,
                    kind: guess.kind,
                    color: guess.color.into(),
                    sample_rate: info.sample_rate,
                    channels: info.channels,
                    frames: info.frames,
                });
            }
            Err(error) => rejected.push(Rejected { path, reason: error.to_string() }),
        }
    }
    if files.len() > 1 {
        let mut lengths: Vec<f64> = files.iter().map(|file| file.seconds).collect();
        lengths.sort_by(f64::total_cmp);
        let median = lengths[lengths.len() / 2];
        files.retain(|file| {
            let keep = (file.seconds - median).abs() <= LENGTH_TOLERANCE_SECONDS;
            if !keep {
                rejected.push(Rejected {
                    path: file.path.clone(),
                    reason: format!(
                        "length {} differs from the other stems ({})",
                        format_seconds(file.seconds),
                        format_seconds(median)
                    ),
                });
            }
            keep
        });
    }
    ImportPlan { title: title_for(paths), files, rejected }
}

struct Analysed {
    track: ImportedTrack,
    energy: Vec<f32>,
    click_bpm: Option<f64>,
}

fn copy_into(library: &Library, source: &Path, hash: &str) -> std::io::Result<PathBuf> {
    let extension = source.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    let target = library.media_dir().join(format!("{hash}.{extension}"));
    if !target.exists() {
        let partial = target.with_extension("partial");
        std::fs::copy(source, &partial)?;
        std::fs::rename(&partial, &target)?;
    }
    Ok(target)
}

fn analyse(file: &ProbedFile, library: &Library, mode: ImportMode) -> crate::Result<Analysed> {
    let hash = hash_file(&file.path)?;
    let played = match mode {
        ImportMode::Copy => copy_into(library, &file.path, &hash)?,
        ImportMode::Reference => file.path.clone(),
    };

    // Decode once at the file's own rate for peaks, the onset envelope and click onsets.
    let mut reader = FileReader::open(&file.path, file.sample_rate)?;
    let mut peaks = PeakBuilder::new(file.sample_rate);
    let mut envelope = EnvelopeBuilder::new();
    let mut click = (file.kind == TrackKind::Click).then(|| ClickDetector::new(file.sample_rate));
    let mut buffer = vec![0.0; 8_192 * 2];
    loop {
        let frames = reader.read(&mut buffer);
        if frames == 0 {
            break;
        }
        let chunk = &buffer[..frames * 2];
        peaks.push(chunk);
        envelope.push(chunk);
        if let Some(click) = click.as_mut() {
            click.push(chunk);
        }
    }
    let peaks: Peaks = peaks.finish();
    if let Some(path) = library.peaks_path(&hash) {
        if !path.exists() {
            peaks.write(&path)?;
        }
    }
    Ok(Analysed {
        track: ImportedTrack {
            name: file.name.clone(),
            file: played,
            hash,
            kind: file.kind,
            color: file.color.clone(),
            sample_rate: file.sample_rate,
            channels: file.channels,
            frames: peaks.frames,
        },
        energy: envelope.finish(),
        click_bpm: click.and_then(|click| click.bpm(file.sample_rate)),
    })
}

/// Import the planned files as one song.
pub fn import(plan: &ImportPlan, library: &Library, mode: ImportMode) -> crate::Result<ImportedSong> {
    if plan.files.is_empty() {
        return Err(LibraryError::NothingToImport);
    }
    std::fs::create_dir_all(library.peaks_dir())?;
    if mode == ImportMode::Copy {
        std::fs::create_dir_all(library.media_dir())?;
    }

    let results: Vec<Mutex<Option<crate::Result<Analysed>>>> = plan.files.iter().map(|_| Mutex::new(None)).collect();
    let next = AtomicUsize::new(0);
    let workers = std::thread::available_parallelism().map_or(4, |n| n.get()).min(plan.files.len());
    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| loop {
                let index = next.fetch_add(1, Ordering::Relaxed);
                let Some(file) = plan.files.get(index) else { break };
                let result = analyse(file, library, mode);
                *results[index].lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(result);
            });
        }
    });

    let mut analysed = Vec::with_capacity(plan.files.len());
    for slot in results {
        let result = slot.into_inner().unwrap_or_else(|poisoned| poisoned.into_inner());
        analysed.push(result.unwrap_or(Err(LibraryError::NothingToImport))?);
    }

    let mut rates: HashMap<u32, usize> = HashMap::new();
    for item in &analysed {
        *rates.entry(item.track.sample_rate).or_default() += 1;
    }
    let sample_rate = rates
        .into_iter()
        .max_by_key(|&(rate, count)| (count, rate))
        .map_or(48_000, |(rate, _)| rate);
    let duration_samples = analysed
        .iter()
        .map(|item| {
            let track = &item.track;
            (u128::from(track.frames) * u128::from(sample_rate) / u128::from(track.sample_rate.max(1))) as u64
        })
        .max()
        .unwrap_or(0);

    let tempo = tempo_of(&analysed, sample_rate);
    Ok(ImportedSong {
        title: plan.title.clone(),
        sample_rate,
        duration_samples,
        tempo,
        tracks: analysed.into_iter().map(|item| item.track).collect(),
    })
}

fn tempo_of(analysed: &[Analysed], sample_rate: u32) -> Option<Tempo> {
    if let Some(bpm) = analysed.iter().find_map(|item| item.click_bpm) {
        return Some(Tempo { bpm, source: BpmSource::Click });
    }
    // Sum the stems at the song rate; guide tracks are speech and would blur the beat.
    let mut energy = Vec::new();
    for item in analysed.iter().filter(|item| item.track.kind == TrackKind::Stem && item.track.sample_rate == sample_rate) {
        analysis::add_envelopes(&mut energy, &item.energy);
    }
    analysis::bpm_from_energy(&energy, sample_rate).map(|bpm| Tempo { bpm, source: BpmSource::Onsets })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::{click_samples, temp_dir, write_wav};

    fn tone(frames: usize, frequency: f32) -> Vec<i16> {
        (0..frames).map(|i| ((i as f32 * frequency * std::f32::consts::TAU / 48_000.0).sin() * 8_000.0) as i16).collect()
    }

    #[test]
    fn plans_a_folder_and_rejects_odd_files() {
        let dir = temp_dir("plan");
        let song = dir.join("Song A");
        std::fs::create_dir_all(&song).unwrap();
        write_wav(&song.join("01 Click.wav"), 48_000, 1, &click_samples(120.0, 48_000, 10.0));
        write_wav(&song.join("02 Bass.wav"), 48_000, 2, &tone(480_000 * 2, 55.0)[..480_000 * 2]);
        write_wav(&song.join("03 Short.wav"), 48_000, 1, &tone(48_000, 440.0));
        std::fs::write(song.join("notes.txt"), "setlist notes").unwrap();
        std::fs::write(song.join("broken.wav"), "not audio").unwrap();

        let plan = plan(std::slice::from_ref(&song));
        assert_eq!(plan.title, "Song A");
        let names: Vec<&str> = plan.files.iter().map(|file| file.name.as_str()).collect();
        assert_eq!(names, ["Click", "Bass"]);
        assert_eq!(plan.files[0].kind, TrackKind::Click);
        assert_eq!(plan.files[1].channels, 2);
        assert_eq!(plan.files[1].seconds, 10.0);
        let rejected: Vec<String> =
            plan.rejected.iter().map(|r| r.path.file_name().unwrap().to_string_lossy().into_owned()).collect();
        assert!(rejected.contains(&"broken.wav".to_string()));
        let short = plan.rejected.iter().find(|r| r.path.ends_with("03 Short.wav")).unwrap();
        assert_eq!(short.reason, "length 0:01.0 differs from the other stems (0:10.0)");
        // A text file inside a chosen folder is skipped silently; chosen directly, it is rejected.
        assert!(!rejected.contains(&"notes.txt".to_string()));
        assert_eq!(super::plan(&[song.join("notes.txt")]).rejected.len(), 1);
    }

    #[test]
    fn imports_with_copies_peaks_and_the_click_tempo() {
        let dir = temp_dir("import");
        let song = dir.join("Song B");
        std::fs::create_dir_all(&song).unwrap();
        write_wav(&song.join("Click.wav"), 48_000, 1, &click_samples(96.0, 48_000, 12.0));
        write_wav(&song.join("Keys.wav"), 48_000, 1, &tone(576_000, 220.0));
        let library = Library::new(dir.join("library"));

        let plan = plan(&[song]);
        let imported = import(&plan, &library, ImportMode::Copy).unwrap();
        assert_eq!(imported.title, "Song B");
        assert_eq!(imported.sample_rate, 48_000);
        assert_eq!(imported.duration_samples, 576_000);
        assert_eq!(imported.tempo, Some(Tempo { bpm: 96.0, source: BpmSource::Click }));
        for track in &imported.tracks {
            assert!(track.file.starts_with(library.media_dir()), "{}", track.file.display());
            assert_eq!(track.frames, 576_000);
            let peaks = Peaks::read(&library.peaks_path(&track.hash).unwrap()).unwrap();
            assert_eq!(peaks.frames, 576_000);
        }
        assert_eq!(imported.tracks[1].kind, TrackKind::Stem);
        assert_eq!(imported.tracks[1].color, "green");

        // Importing the same files again reuses the copies and peak files.
        let again = import(&plan, &library, ImportMode::Reference).unwrap();
        assert_eq!(again.tracks[0].hash, imported.tracks[0].hash);
        assert!(again.tracks[0].file.ends_with("Click.wav"));
    }

    #[test]
    fn rejects_hex_free_hashes_in_peak_paths() {
        let library = Library::new("/library");
        assert!(library.peaks_path("../../etc/passwd").is_none());
        assert!(library.peaks_path("ab12").is_some());
    }

    #[test]
    fn nothing_to_import_is_an_error() {
        let plan = ImportPlan { title: "Empty".into(), files: Vec::new(), rejected: Vec::new() };
        assert!(matches!(import(&plan, &Library::new("/tmp/x"), ImportMode::Reference), Err(LibraryError::NothingToImport)));
    }
}
