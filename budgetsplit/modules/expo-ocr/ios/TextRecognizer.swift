import Vision
import UIKit

final class TextRecognizer {

  enum RecognitionError: Error, LocalizedError {
    case invalidImageUri(String)
    case imageLoadFailed(String)
    case cgImageConversionFailed
    case recognitionFailed(String)

    var errorDescription: String? {
      switch self {
      case .invalidImageUri(let uri):
        return "Invalid image URI: \(uri)"
      case .imageLoadFailed(let path):
        return "Failed to load image at path: \(path)"
      case .cgImageConversionFailed:
        return "Failed to convert UIImage to CGImage"
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
    let cgImage = try loadCGImage(from: imageUri)
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

      let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

      do {
        try handler.perform([request])
      } catch {
        continuation.resume(throwing: RecognitionError.recognitionFailed(error.localizedDescription))
      }
    }
  }

  private func loadCGImage(from uri: String) throws -> CGImage {
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
      throw RecognitionError.imageLoadFailed(path)
    }

    guard let image = UIImage(contentsOfFile: path) else {
      throw RecognitionError.imageLoadFailed(path)
    }

    let corrected = image.fixedOrientation()

    guard let cgImage = corrected.cgImage else {
      throw RecognitionError.cgImageConversionFailed
    }

    return cgImage
  }
}

// MARK: - EXIF orientation fix for camera images
extension UIImage {
  func fixedOrientation() -> UIImage {
    guard imageOrientation != .up else { return self }

    UIGraphicsBeginImageContextWithOptions(size, false, scale)
    draw(in: CGRect(origin: .zero, size: size))
    let normalized = UIGraphicsGetImageFromCurrentImageContext() ?? self
    UIGraphicsEndImageContext()
    return normalized
  }
}
