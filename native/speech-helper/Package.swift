// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "MaliangSpeechHelper",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "maliang-speech-helper", targets: ["MaliangSpeechHelper"])
    ],
    targets: [
        .executableTarget(
            name: "MaliangSpeechHelper",
            path: "Sources/MaliangSpeechHelper"
        )
    ]
)
