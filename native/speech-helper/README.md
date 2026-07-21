# Maliang speech helper

This signed macOS helper owns microphone permission and Apple's Speech
framework. It accepts newline-delimited JSON commands over stdin and emits
transcript fragments over stdout.

Every recognition request sets `requiresOnDeviceRecognition = true`. Audio
buffers are appended directly to the recognizer and are never serialized,
logged, or written to disk. If on-device recognition is unavailable, the helper
fails closed with `ON_DEVICE_SPEECH_UNAVAILABLE`.

The release packager must embed `Info.plist`, sign the helper with the Maliang
application, and include the required microphone entitlement. The renderer
does not receive microphone permission.
