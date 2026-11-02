use std::fs::File;
use std::io::Read;
use std::path::Path;

/// BLAKE3 of a file's bytes, lowercase hex. Relinking finds moved files by this hash.
pub fn hash_file(path: &Path) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = blake3::Hasher::new();
    let mut buffer = vec![0; 1 << 20];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher.finalize().to_hex().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes_match_the_reference_and_change_with_content() {
        let dir = crate::testutil::temp_dir("hash");
        let a = dir.join("a.bin");
        std::fs::write(&a, b"abc").unwrap();
        // BLAKE3 test vector for "abc".
        assert_eq!(hash_file(&a).unwrap(), "6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85");
        let b = dir.join("b.bin");
        std::fs::write(&b, b"abd").unwrap();
        assert_ne!(hash_file(&a).unwrap(), hash_file(&b).unwrap());
    }
}
