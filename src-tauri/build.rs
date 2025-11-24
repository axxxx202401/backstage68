fn main() {
    println!("cargo:rerun-if-env-changed=TAURI_ENV_NAME");
    println!("cargo:rerun-if-env-changed=TAURI_ENV_URL");
    println!("cargo:rerun-if-env-changed=TAURI_ENV_KEY");
    println!("cargo:rerun-if-env-changed=TAURI_DEVTOOLS_ENABLED");
    tauri_build::build()
}

