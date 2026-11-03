#!/usr/bin/env bash
# Make a local folder of guide voices with macOS text-to-speech, for trying the guide.
# The files are for your own use: Stems does not ship them. Check the licence of the voice
# before sharing them with anyone.
#
#   scripts/make-guide-voices.sh [output-folder] [voice]
#
# Then choose the folder in Settings → Guide → Voices.
set -euo pipefail

out="${1:-$HOME/Music/Stems Guide Voices}"
voice="${2:-Samantha}"
mkdir -p "$out"

words=(intro verse prechorus chorus bridge instrumental interlude breakdown tag outro ending vamp)
for word in "${words[@]}"; do
  label="$word"
  [[ "$word" == "prechorus" ]] && label="pre chorus"
  say -v "$voice" -o "$out/$word.wav" --data-format=LEI16@48000 "$label"
done
counts=(two three four five six seven eight)
for i in "${!counts[@]}"; do
  say -v "$voice" -o "$out/$((i + 2)).wav" --data-format=LEI16@48000 "${counts[$i]}"
done
echo "Voices written to $out"
