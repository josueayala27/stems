//! Time an import, for the M2 exit check (12 stems in under 5 s on Apple Silicon).
//!
//! cargo run --release -p stems-library --example import -- LIBRARY_DIR FOLDER_OR_FILES...

use std::path::PathBuf;
use std::time::Instant;

use stems_library::import::{import, plan, ImportMode, Library};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1).map(PathBuf::from);
    let library = Library::new(args.next().ok_or("usage: import LIBRARY_DIR FOLDER_OR_FILES...")?);
    let paths: Vec<PathBuf> = args.collect();

    let started = Instant::now();
    let plan = plan(&paths);
    println!("plan: {} files, {} rejected in {:?}", plan.files.len(), plan.rejected.len(), started.elapsed());
    for rejected in &plan.rejected {
        println!("  rejected {}: {}", rejected.path.display(), rejected.reason);
    }
    let song = import(&plan, &library, ImportMode::Reference)?;
    println!(
        "import: {} tracks, {:.1} s at {} Hz, tempo {:?} in {:?}",
        song.tracks.len(),
        song.duration_samples as f64 / f64::from(song.sample_rate),
        song.sample_rate,
        song.tempo,
        started.elapsed()
    );
    Ok(())
}
