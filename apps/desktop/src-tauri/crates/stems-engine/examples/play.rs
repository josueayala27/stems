//! Play files through the default output and print engine state every second. Used for the M1
//! exit check (16 stems, 30 minutes, 128-sample buffer, no xrun).
//!
//! cargo run --release -p stems-engine --example play -- [--buffer 128] FILE...

use std::path::PathBuf;
use std::thread;
use std::time::Duration;

use stems_engine::device::OutputConfig;
use stems_engine::host::EngineHost;
use stems_engine::Transport;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut buffer = 128;
    let mut files = Vec::new();
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == "--buffer" {
            buffer = args.next().ok_or("--buffer needs a value")?.parse()?;
        } else {
            files.push(PathBuf::from(arg));
        }
    }
    if files.is_empty() {
        return Err("usage: play [--buffer N] FILE...".into());
    }

    let host = EngineHost::spawn(|_| {})?;
    let output = host.open(OutputConfig { buffer_size: buffer, ..Default::default() })?;
    println!("{} at {} Hz, {} frames, {} channels", output.name, output.sample_rate, output.buffer_size, output.channels);
    let song = host.load_files(files)?;
    println!("{} tracks, {:.1} s", song.tracks.len(), song.length as f64 / f64::from(song.sample_rate));
    host.command(Transport::Play, None)?;

    loop {
        thread::sleep(Duration::from_secs(1));
        let Some(state) = host.state()? else { continue };
        println!(
            "{:8.1} s  xruns {}  underruns {}  cpu {:4.1}%",
            state.position as f64 / f64::from(state.sample_rate),
            state.xruns,
            state.underruns,
            state.cpu_load * 100.0
        );
        if !state.playing {
            return Ok(());
        }
    }
}
