fn main() {
    println!("cargo:rerun-if-env-changed=TAURI_ENV_NAME");
    println!("cargo:rerun-if-env-changed=TAURI_ENV_URL");
    println!("cargo:rerun-if-env-changed=TAURI_ENV_KEY");
    println!("cargo:rerun-if-env-changed=TAURI_DEVTOOLS_ENABLED");
    println!("cargo:rerun-if-env-changed=TAURI_PRODUCT_NAME");
    println!("cargo:rerun-if-env-changed=TAURI_BUNDLE_IDENTIFIER");
    tauri_build::build()
}

