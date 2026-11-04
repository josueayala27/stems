// The song's start point: skip silence before the first sound, so bar 1 and Play start on it.
import type { Song } from '@stems/schema'
import { firstSound } from '~/audio/peaks'
import { setStart } from '~/workspaces/arrange/arrangement'
import { library } from './library'

/**
 * The file sample of the first sound in the song's stems (click and guide stems are ignored, a
 * click often starts before the music). Reads the peak files; 0 when none load.
 */
export async function detectStart(song: Song): Promise<number> {
  const stems = song.tracks.filter((track) => track.kind === 'stem')
  const peaks = await Promise.all(stems.map((track) => library.peaks(track.hash).catch(() => null)))
  return firstSound(peaks)
}

/** The song with its start point on the first sound. */
export async function skipLeadingSilence(song: Song): Promise<Song> {
  return setStart(song, await detectStart(song))
}
