//! Control-side handle to the mixer: sends commands, reads state, loads songs from disk.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::command::{At, Command, Scheduled};
use crate::decode::FileReader;
use crate::mixer::{Mixer, Song, SCHEDULE_CAPACITY};
use crate::source::Source;
use crate::state::EngineState;
use crate::stream::{self, Feeder, FrameReader, HEAD_SECONDS};
use crate::{EngineError, CHANNELS};

const GARBAGE_CAPACITY: usize = 16;

pub struct Engine {
    sample_rate: u32,
    commands: rtrb::Producer<Scheduled>,
    garbage: rtrb::Consumer<Box<Song>>,
    state: triple_buffer::Output<EngineState>,
    feeder: Option<Feeder>,
}

/// A connected control handle and real-time mixer at `sample_rate`. The mixer goes to the device
/// callback, or renders offline with [`Mixer::render`].
pub fn new(sample_rate: u32) -> (Engine, Mixer) {
    let (command_tx, command_rx) = rtrb::RingBuffer::new(SCHEDULE_CAPACITY);
    let (garbage_tx, garbage_rx) = rtrb::RingBuffer::new(GARBAGE_CAPACITY);
    let (state_in, state_out) = triple_buffer::triple_buffer(&EngineState::new(sample_rate));
    let engine = Engine { sample_rate, commands: command_tx, garbage: garbage_rx, state: state_out, feeder: None };
    (engine, Mixer::new(sample_rate, command_rx, garbage_tx, state_in))
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackInfo {
    pub path: PathBuf,
    /// Rate of the file. The engine resamples to the device rate when it differs.
    pub file_sample_rate: u32,
    pub channels: usize,
    /// Length in frames at the device rate.
    pub frames: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongInfo {
    pub sample_rate: u32,
    /// Frames at the device rate: the longest track.
    pub length: u64,
    pub tracks: Vec<TrackInfo>,
}

impl Engine {
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    pub fn send(&mut self, command: Command) -> crate::Result<()> {
        self.schedule(At::Now, command)
    }

    pub fn schedule(&mut self, at: At, command: Command) -> crate::Result<()> {
        self.commands.push(Scheduled { at, command }).map_err(|_| EngineError::QueueFull)
    }

    /// The latest published state. Also frees songs the mixer has replaced.
    pub fn state(&mut self) -> EngineState {
        self.collect_garbage();
        *self.state.read()
    }

    /// Free songs the mixer handed back. Returns how many.
    pub fn collect_garbage(&mut self) -> usize {
        let mut count = 0;
        while let Ok(song) = self.garbage.pop() {
            drop(song);
            count += 1;
        }
        count
    }

    /// Open the files as one song, start its disk thread and hand it to the mixer. Blocks while
    /// the first `HEAD_SECONDS` of every track decode.
    pub fn load_files(&mut self, paths: &[PathBuf]) -> crate::Result<SongInfo> {
        let mut sources = Vec::with_capacity(paths.len());
        let mut feeders = Vec::with_capacity(paths.len());
        let mut tracks = Vec::with_capacity(paths.len());
        for path in paths {
            let (source, feeder, info) = open_track(path, self.sample_rate)?;
            sources.push(Source::Stream(source));
            feeders.push(feeder);
            tracks.push(info);
        }
        let song = Song::new(sources)?;
        let info = SongInfo { sample_rate: self.sample_rate, length: song.length(), tracks };
        let feeder = Feeder::spawn(feeders)?;
        self.send(Command::LoadSong(Box::new(song)))?;
        // The old disk thread stops; the old song comes back through the garbage queue.
        self.feeder = Some(feeder);
        Ok(info)
    }

    pub fn unload(&mut self) -> crate::Result<()> {
        self.send(Command::UnloadSong)?;
        self.feeder = None;
        Ok(())
    }
}

fn open_track(path: &Path, sample_rate: u32) -> crate::Result<(stream::StreamSource, stream::StreamFeeder, TrackInfo)> {
    let mut reader = FileReader::open(path, sample_rate)?;
    let frames = reader.frames();
    let head_frames = (u64::from(sample_rate) * HEAD_SECONDS).min(frames) as usize;
    let mut head = vec![0.0; head_frames * CHANNELS];
    let mut filled = 0;
    while filled < head_frames {
        let read = reader.read(&mut head[filled * CHANNELS..]);
        if read == 0 {
            break;
        }
        filled += read;
    }
    head.truncate(filled * CHANNELS);
    let info = TrackInfo {
        path: path.to_path_buf(),
        file_sample_rate: reader.file_sample_rate(),
        channels: reader.channels(),
        frames,
    };
    let (source, feeder) = stream::stream(head, frames, Box::new(reader), stream::lookahead_blocks(sample_rate));
    Ok((source, feeder, info))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::decode::tests::{temp_dir, write_wav};

    #[test]
    fn loads_files_and_plays_their_sum() {
        let dir = temp_dir("load");
        let drums: Vec<i16> = (0..9_000).map(|i| (i % 1_000) as i16 * 10).collect();
        let bass: Vec<i16> = (0..6_000).flat_map(|i| [-(i as i16), i as i16]).collect();
        write_wav(&dir.join("drums.wav"), 48_000, 1, &drums);
        write_wav(&dir.join("bass.wav"), 48_000, 2, &bass[..6_000 * 2]);

        let (mut engine, mut mixer) = new(48_000);
        let info = engine.load_files(&[dir.join("drums.wav"), dir.join("bass.wav")]).unwrap();
        assert_eq!(info.length, 9_000);
        assert_eq!(info.tracks[0].channels, 1);
        assert_eq!(info.tracks[1].frames, 6_000);
        engine.send(Command::Play).unwrap();
        let out = mixer.render(9_000);

        let f = |s: i16| f32::from(s) / 32_768.0;
        for frame in [0, 1, 5_999, 6_000, 8_999] {
            let (bass_left, bass_right) =
                if frame < 6_000 { (f(bass[frame * 2]), f(bass[frame * 2 + 1])) } else { (0.0, 0.0) };
            assert_eq!(out[frame * CHANNELS], 0.0 + f(drums[frame]) + bass_left, "frame {frame}");
            assert_eq!(out[frame * CHANNELS + 1], 0.0 + f(drums[frame]) + bass_right, "frame {frame}");
        }
        assert_eq!(engine.state().underruns, 0);
    }
}
