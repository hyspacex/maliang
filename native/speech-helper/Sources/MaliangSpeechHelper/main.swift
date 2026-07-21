@preconcurrency import AVFoundation
@preconcurrency import Speech
import Foundation

private struct Command: Decodable, Sendable {
    enum Kind: String, Decodable, Sendable {
        case start
        case stop
        case quit
    }

    let command: Kind
    let requestId: String
    let locale: String?
}

private struct HelperEvent: Encodable, Sendable {
    let type: String
    let requestId: String
    let transcript: String?
    let isFinal: Bool?
    let code: String?
}

private func emit(_ event: HelperEvent) {
    guard let data = try? JSONEncoder().encode(event) else { return }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0A]))
}

@MainActor
private final class SpeechSession {
    private let audioEngine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var requestId: String?

    func handle(_ command: Command) {
        switch command.command {
        case .start:
            start(requestId: command.requestId, localeIdentifier: command.locale ?? "en-US")
        case .stop:
            stop(requestId: command.requestId)
        case .quit:
            stop(requestId: command.requestId)
            exit(EXIT_SUCCESS)
        }
    }

    private func start(requestId: String, localeIdentifier: String) {
        stop(requestId: requestId, emitStopped: false)
        self.requestId = requestId
        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            Task { @MainActor in
                guard let self else { return }
                guard status == .authorized else {
                    emit(
                        HelperEvent(
                            type: "error",
                            requestId: requestId,
                            transcript: nil,
                            isFinal: nil,
                            code: "SPEECH_PERMISSION_REQUIRED"
                        )
                    )
                    return
                }
                self.beginAuthorizedRecognition(
                    requestId: requestId,
                    localeIdentifier: localeIdentifier
                )
            }
        }
    }

    private func beginAuthorizedRecognition(
        requestId: String,
        localeIdentifier: String
    ) {
        guard let recognizer = SFSpeechRecognizer(
            locale: Locale(identifier: localeIdentifier)
        ) else {
            emit(
                HelperEvent(
                    type: "error",
                    requestId: requestId,
                    transcript: nil,
                    isFinal: nil,
                    code: "LOCALE_UNAVAILABLE"
                )
            )
            return
        }
        guard recognizer.isAvailable, recognizer.supportsOnDeviceRecognition else {
            emit(
                HelperEvent(
                    type: "error",
                    requestId: requestId,
                    transcript: nil,
                    isFinal: nil,
                    code: "ON_DEVICE_SPEECH_UNAVAILABLE"
                )
            )
            return
        }

        let recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        recognitionRequest.requiresOnDeviceRecognition = true
        recognitionRequest.shouldReportPartialResults = true
        recognitionRequest.taskHint = .dictation
        request = recognitionRequest

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        inputNode.removeTap(onBus: 0)
        inputNode.installTap(
            onBus: 0,
            bufferSize: 1_024,
            format: format
        ) { buffer, _ in
            // Buffers are forwarded directly to Apple's on-device recognizer.
            // They are never serialized, logged, or written to a file.
            recognitionRequest.append(buffer)
        }

        task = recognizer.recognitionTask(with: recognitionRequest) {
            [weak self] result, error in
            guard let self else { return }
            if let result {
                emit(
                    HelperEvent(
                        type: "transcript",
                        requestId: requestId,
                        transcript: result.bestTranscription.formattedString,
                        isFinal: result.isFinal,
                        code: nil
                    )
                )
                if result.isFinal {
                    Task { @MainActor in
                        self.stop(requestId: requestId)
                    }
                }
            }
            if error != nil {
                emit(
                    HelperEvent(
                        type: "error",
                        requestId: requestId,
                        transcript: nil,
                        isFinal: nil,
                        code: "RECOGNITION_FAILED"
                    )
                )
                Task { @MainActor in
                    self.stop(requestId: requestId, emitStopped: false)
                }
            }
        }

        do {
            audioEngine.prepare()
            try audioEngine.start()
            emit(
                HelperEvent(
                    type: "started",
                    requestId: requestId,
                    transcript: nil,
                    isFinal: nil,
                    code: nil
                )
            )
        } catch {
            stop(requestId: requestId, emitStopped: false)
            emit(
                HelperEvent(
                    type: "error",
                    requestId: requestId,
                    transcript: nil,
                    isFinal: nil,
                    code: "MICROPHONE_UNAVAILABLE"
                )
            )
        }
    }

    private func stop(requestId: String, emitStopped: Bool = true) {
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        audioEngine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        self.requestId = nil
        if emitStopped {
            emit(
                HelperEvent(
                    type: "stopped",
                    requestId: requestId,
                    transcript: nil,
                    isFinal: nil,
                    code: nil
                )
            )
        }
    }
}

private let session = SpeechSession()

DispatchQueue.global(qos: .userInitiated).async {
    while let line = readLine() {
        guard let data = line.data(using: .utf8),
              let command = try? JSONDecoder().decode(Command.self, from: data)
        else {
            emit(
                HelperEvent(
                    type: "error",
                    requestId: "unknown",
                    transcript: nil,
                    isFinal: nil,
                    code: "INVALID_COMMAND"
                )
            )
            continue
        }
        Task { @MainActor in
            session.handle(command)
        }
    }
    Task { @MainActor in
        exit(EXIT_SUCCESS)
    }
}

RunLoop.main.run()
