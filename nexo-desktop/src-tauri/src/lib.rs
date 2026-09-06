/// Verifies that `origin` matches the window's own origin, so the frontend
/// cannot ask to reset WebView2 permissions for an arbitrary origin.
fn verify_origin(window: &tauri::WebviewWindow, origin: &str) -> Result<(), String> {
    let window_url: tauri::Url = window.url().map_err(|e| e.to_string())?;
    let expected = window_url.origin().ascii_serialization();
    if expected.trim() != origin.trim() {
        return Err("Origin mismatch.".into());
    }
    Ok(())
}

/// Resets the mic/camera permission WebView2 remembered for this app's origin back
/// to "ask", without touching cookies/localStorage — so the JWT session survives.
/// This is the only way to make WebView2 re-prompt after a user clicked "Block",
/// since there is no web API a page can call to reset its own permission state.
/// `origin` is passed from JS (`window.location.origin`) since it differs between
/// dev (http://localhost:1420) and the packaged build (http://tauri.localhost).
/// It is verified against the window's own origin before use, since a Tauri
/// command is callable from any script running in the webview.
#[cfg(windows)]
#[tauri::command]
async fn reset_media_permissions(window: tauri::WebviewWindow, origin: String) -> Result<(), String> {
    verify_origin(&window, &origin)?;

    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Profile4, ICoreWebView2_13, COREWEBVIEW2_PERMISSION_KIND_CAMERA,
        COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_STATE_DEFAULT,
    };
    use webview2_com::SetPermissionStateCompletedHandler;
    use windows::core::{Interface, HSTRING};

    let (tx, rx) = std::sync::mpsc::channel();

    window
        .with_webview(move |webview| {
            let run = || -> Result<(), String> {
                let core = unsafe { webview.controller().CoreWebView2() }
                    .map_err(|e| e.to_string())?;
                let core13 = core.cast::<ICoreWebView2_13>().map_err(|e| e.to_string())?;
                let profile = unsafe { core13.Profile() }.map_err(|e| e.to_string())?;
                let profile4 = profile
                    .cast::<ICoreWebView2Profile4>()
                    .map_err(|e| e.to_string())?;
                let origin = HSTRING::from(origin.as_str());

                for kind in [
                    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
                    COREWEBVIEW2_PERMISSION_KIND_CAMERA,
                ] {
                    let origin = origin.clone();
                    let profile4 = profile4.clone();
                    SetPermissionStateCompletedHandler::wait_for_async_operation(
                        Box::new(move |handler| unsafe {
                            profile4
                                .SetPermissionState(
                                    kind,
                                    &origin,
                                    COREWEBVIEW2_PERMISSION_STATE_DEFAULT,
                                    &handler,
                                )
                                .map_err(webview2_com::Error::WindowsError)
                        }),
                        Box::new(|_hresult| Ok(())),
                    )
                    .map_err(|e| e.to_string())?;
                }
                Ok(())
            };
            let _ = tx.send(run());
        })
        .map_err(|e| e.to_string())?;

    rx.recv().map_err(|e| e.to_string())?
}

#[cfg(not(windows))]
#[tauri::command]
async fn reset_media_permissions(window: tauri::WebviewWindow, origin: String) -> Result<(), String> {
    verify_origin(&window, &origin)?;

    Err("Restablecer permisos solo está disponible en Windows.".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![reset_media_permissions])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
