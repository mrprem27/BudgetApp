require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoOcr'
  s.version        = package['version']
  s.summary        = 'On-device OCR using Apple Vision framework'
  s.description    = 'Expo module for text recognition from images using VNRecognizeTextRequest'
  s.license        = { :type => 'MIT' }
  s.author         = 'BudgetSplit'
  s.homepage       = 'https://github.com/prem-bhati/BudgetApp'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
