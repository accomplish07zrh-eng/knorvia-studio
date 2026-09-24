# Record browser evidence

Read `await browser.documentation()` and confirm recording is advertised before using it. The recording capability belongs to the chosen browser; it is not a system-wide screen recorder.

Use the BrowserRecordingAPI signatures in the API manifest to start a bounded recording of the intended tab and inspect status. Keep the output inside the current workspace, preserve existing files, and report the returned WebM path only after successful completion. Cancellation or a failed recording must remain visible. Avoid recording credentials or unrelated tabs. Playback or inspect the resulting artifact before claiming it captures the expected interaction.
