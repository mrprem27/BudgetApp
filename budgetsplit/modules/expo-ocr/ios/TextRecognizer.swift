import Vision
import UIKit
import ImageIO

final class TextRecognizer {

  enum RecognitionError: Error, LocalizedError {
    case invalidImageUri(String)
    case fileNotFound(String)
    case imageDecodeFailed(String)
    case recognitionFailed(String)

    var errorDescription: String? {
      switch self {
      case .invalidImageUri(let uri):
        return "Invalid image URI: \(uri)"
      case .fileNotFound(let path):
        return "No file exists at path: \(path)"
      case .imageDecodeFailed(let path):
        return "File exists but could not be decoded as an image (possibly not fully written yet, or an unsupported format): \(path)"
      case .recognitionFailed(let reason):
        return "Text recognition failed: \(reason)"
      }
    }
  }

  func recognize(
    imageUri: String,
    languages: [String],
    accurate: Bool
  ) async throws -> String {
    let (cgImage, orientation) = try loadCGImage(from: imageUri)
    let level: VNRequestTextRecognitionLevel = accurate ? .accurate : .fast

    return try await withCheckedThrowingContinuation { continuation in
      let request = VNRecognizeTextRequest { request, error in
        if let error = error {
          continuation.resume(throwing: RecognitionError.recognitionFailed(error.localizedDescription))
          return
        }

        guard let observations = request.results as? [VNRecognizedTextObservation] else {
          continuation.resume(returning: "")
          return
        }

        // Sort top-to-bottom (Vision uses bottom-left origin, so higher y = higher on page)
        // Within same line (y difference < 1%), sort left-to-right
        let sorted = observations.sorted { a, b in
          let yDiff = abs(a.boundingBox.origin.y - b.boundingBox.origin.y)
          if yDiff > 0.01 {
            return a.boundingBox.origin.y > b.boundingBox.origin.y
          }
          return a.boundingBox.origin.x < b.boundingBox.origin.x
        }

        let text = sorted
          .compactMap { $0.topCandidates(1).first?.string }
          .joined(separator: "\n")

        continuation.resume(returning: text)
      }

      request.recognitionLevel = level
      request.recognitionLanguages = languages
      request.usesLanguageCorrection = true

      // Orientation comes straight from EXIF (below) and is handed to Vision
      // directly — no UIGraphics redraw needed to "fix" it, which also removes
      // a silent-failure path large camera photos could hit.
      let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation, options: [:])

      do {
        try handler.perform([request])
      } catch {
        continuation.resume(throwing: RecognitionError.recognitionFailed(error.localizedDescription))
      }
    }
  }

  private func loadCGImage(from uri: String) throws -> (CGImage, CGImagePropertyOrientation) {
    let path: String

    if uri.hasPrefix("file://") {
      guard let url = URL(string: uri) else {
        throw RecognitionError.invalidImageUri(uri)
      }
      path = url.path
    } else if uri.hasPrefix("/") {
      path = uri
    } else {
      throw RecognitionError.invalidImageUri(uri)
    }

    guard FileManager.default.fileExists(atPath: path) else {
      throw RecognitionError.fileNotFound(path)
    }

    // CGImageSource is the lower-level, format-agnostic decoder underneath
    // most of Apple's own image loading (Photos, Vision's own convenience
    // initializers, etc.) — used directly here instead of
    // UIImage(contentsOfFile:) so a HEIC (the default iPhone camera format)
    // decode failure is reported distinctly from "file not found", rather
    // than both collapsing into the same ambiguous error.
    let fileURL = URL(fileURLWithPath: path)
    guard let source = CGImageSourceCreateWithURL(fileURL as CFURL, nil) else {
      throw RecognitionError.imageDecodeFailed(path)
    }
    guard let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
      throw RecognitionError.imageDecodeFailed(path)
    }

    let orientation: CGImagePropertyOrientation
    if let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
       let exifOrientation = properties[kCGImagePropertyOrientation] as? UInt32,
       let cgOrientation = CGImagePropertyOrientation(rawValue: exifOrientation) {
      orientation = cgOrientation
    } else {
      orientation = .up
    }

    return (cgImage, orientation)
  }
}
