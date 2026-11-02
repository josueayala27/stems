//! Track kind, colour and display name guessed from a file name.

use serde::{Deserialize, Serialize};

/// Matches `trackKindSchema` in `@stems/schema`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TrackKind {
    Stem,
    Click,
    Guide,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Guess {
    pub name: String,
    pub kind: TrackKind,
    /// A `track.*` colour token name: violet, blue, red, amber, green or orange.
    pub color: &'static str,
}

/// Words in a file name and what they mean, most specific first.
const RULES: &[(&[&str], TrackKind, &str)] = &[
    (&["click", "clic", "metronome", "metro", "clk"], TrackKind::Click, "amber"),
    (&["guide", "cue", "cues", "count", "countin", "voiceover", "vo"], TrackKind::Guide, "violet"),
    (&["drum", "drums", "kick", "snare", "hat", "hats", "toms", "overhead", "overheads", "oh", "kit", "perc", "percussion", "loop", "loops"], TrackKind::Stem, "red"),
    (&["bass", "sub", "808"], TrackKind::Stem, "orange"),
    (&["key", "keys", "piano", "synth", "synths", "organ", "pad", "pads", "rhodes", "ep"], TrackKind::Stem, "green"),
    (&["gtr", "guitar", "guitars", "acoustic", "electric", "ag", "eg"], TrackKind::Stem, "amber"),
    (&["vox", "vocal", "vocals", "voice", "bgv", "bgvs", "choir", "harmony", "harmonies", "lead"], TrackKind::Stem, "blue"),
    (&["strings", "string", "orch", "orchestra", "brass", "horns"], TrackKind::Stem, "violet"),
];

fn words(stem: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut current = String::new();
    let mut previous_lower = false;
    for character in stem.chars() {
        if !character.is_alphanumeric() {
            if !current.is_empty() {
                words.push(std::mem::take(&mut current));
            }
            previous_lower = false;
            continue;
        }
        // Split camelCase: "BassDI" → "bass", "di".
        if character.is_uppercase() && previous_lower && !current.is_empty() {
            words.push(std::mem::take(&mut current));
        }
        previous_lower = character.is_lowercase();
        current.extend(character.to_lowercase());
    }
    if !current.is_empty() {
        words.push(current);
    }
    words
}

/// Display name: the file stem with separators as spaces and leading track numbers removed.
fn display_name(stem: &str) -> String {
    let spaced: String = stem.chars().map(|c| if c == '_' || c == '-' || c == '.' { ' ' } else { c }).collect();
    let trimmed = spaced.trim_start_matches(|c: char| c.is_ascii_digit() || c.is_whitespace());
    let name = trimmed.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() {
        stem.to_string()
    } else {
        name
    }
}

pub fn guess(file_stem: &str) -> Guess {
    let words = words(file_stem);
    let found = RULES
        .iter()
        .find(|(keys, _, _)| words.iter().any(|word| keys.contains(&word.as_str())));
    let (kind, color) = found.map_or((TrackKind::Stem, "blue"), |&(_, kind, color)| (kind, color));
    Guess { name: display_name(file_stem), kind, color }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guesses_kind_and_colour_from_the_name() {
        assert_eq!(guess("01_Click").kind, TrackKind::Click);
        assert_eq!(guess("Click Track 120").color, "amber");
        assert_eq!(guess("02 - Guide").kind, TrackKind::Guide);
        assert_eq!(guess("cues").kind, TrackKind::Guide);
        assert_eq!(guess("Drums_L").color, "red");
        assert_eq!(guess("BassDI").color, "orange");
        assert_eq!(guess("Keys 2").color, "green");
        assert_eq!(guess("AcousticGtr").color, "amber");
        assert_eq!(guess("BGVs").color, "blue");
        assert_eq!(guess("Strings").color, "violet");
        assert_eq!(guess("Mystery").kind, TrackKind::Stem);
    }

    #[test]
    fn whole_words_only() {
        // "basset" is not bass and "clicker" is not a click.
        assert_eq!(guess("basset").color, "blue");
        assert_eq!(guess("clicker").kind, TrackKind::Stem);
    }

    #[test]
    fn display_names_drop_numbers_and_separators() {
        assert_eq!(guess("03_Lead_Vox").name, "Lead Vox");
        assert_eq!(guess("12 - Pad.Wide").name, "Pad Wide");
        assert_eq!(guess("808").name, "808");
    }
}
