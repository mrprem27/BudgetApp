import ExpoModulesCore

public class ExpoOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoOcr")

    AsyncFunction("recognizeText") { (imageUri: String, options: RecognitionOptions) -> String in
      let recognizer = TextRecognizer()
      return try await recognizer.recognize(
        imageUri: imageUri,
        languages: options.languages ?? ["en"],
        accurate: options.accurate ?? true
      )
    }
  }
}

struct RecognitionOptions: Record {
  @Field var languages: [String]?
  @Field var accurate: Bool?
}
