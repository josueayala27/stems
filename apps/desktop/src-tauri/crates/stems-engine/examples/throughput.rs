//! How fast the disk side decodes, as a multiple of real time for all files together. Below 1×
//! the streams cannot keep up and playback underruns once the in-memory heads run out.
//!
//! cargo run [--release] -p stems-engine --example throughput -- DEVICE_RATE FILE...

use std::path::PathBuf;
use std::time::Instant;

use stems_engine::decode::FileReader;
use stems_engine::stream::FrameReader;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let rate: u32 = args.next().ok_or("usage: throughput DEVICE_RATE FILE...")?.parse()?;
    let files: Vec<PathBuf> = args.map(PathBuf::from).collect();
    let seconds = 20.0;
    let frames = (seconds * f64::from(rate)) as usize;
    let started = Instant::now();
    for file in &files {
        let mut reader = FileReader::open(file, rate)?;
        let mut buffer = vec![0.0; 1024 * 2];
        let mut done = 0;
        while done < frames {
            let read = reader.read(&mut buffer);
            if read == 0 {
                break;
            }
            done += read;
        }
    }
    let elapsed = started.elapsed().as_secs_f64();
    println!("{} files × {seconds} s at {rate} Hz decoded in {elapsed:.2} s: {:.1}× real time", files.len(), seconds / elapsed);
    Ok(())
}
