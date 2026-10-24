import AppKit

let root = FileManager.default.currentDirectoryPath
let output = root + "/artifacts/poster/project-echo-poster-1920x1080.png"
let size = NSSize(width: 1920, height: 1080)

func image(_ relativePath: String) -> NSImage {
    guard let value = NSImage(contentsOfFile: root + "/" + relativePath) else {
        fatalError("Missing source image: \(relativePath)")
    }
    return value
}

func aspectFill(_ source: NSImage, in rect: NSRect, focusX: CGFloat = 0.5, focusY: CGFloat = 0.5) {
    let sourceSize = source.size
    let scale = max(rect.width / sourceSize.width, rect.height / sourceSize.height)
    let drawSize = NSSize(width: sourceSize.width * scale, height: sourceSize.height * scale)
    let x = rect.minX - (drawSize.width - rect.width) * focusX
    let y = rect.minY - (drawSize.height - rect.height) * focusY
    source.draw(in: NSRect(x: x, y: y, width: drawSize.width, height: drawSize.height),
                from: .zero, operation: .sourceOver, fraction: 1)
}

func clippedImage(_ source: NSImage, path: NSBezierPath, bounds: NSRect,
                  focusX: CGFloat = 0.5, focusY: CGFloat = 0.5) {
    NSGraphicsContext.saveGraphicsState()
    path.addClip()
    aspectFill(source, in: bounds, focusX: focusX, focusY: focusY)
    NSGraphicsContext.restoreGraphicsState()
}

func label(_ text: String, at point: NSPoint, size: CGFloat, weight: NSFont.Weight,
           color: NSColor, tracking: CGFloat = 0) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .left
    let attributes: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: size, weight: weight),
        .foregroundColor: color,
        .kern: tracking,
        .paragraphStyle: paragraph,
    ]
    NSAttributedString(string: text, attributes: attributes).draw(at: point)
}

guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: 1920, pixelsHigh: 1080,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bitmapFormat: [], bytesPerRow: 0, bitsPerPixel: 0
) else { fatalError("Could not create poster bitmap") }
let graphics = NSGraphicsContext(bitmapImageRep: bitmap)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = graphics
guard let context = NSGraphicsContext.current?.cgContext else { fatalError("No graphics context") }

NSColor.black.setFill()
NSRect(origin: .zero, size: size).fill()

let nevada = image("public/ending/ending-2.png")
let hamina = image("public/ending/ending-1.png")
let pacific = image("public/ending/ending-5.png")
let echo = image("artifacts/qa/echo-sky-spin-close.png")
let dataCenter = image("public/ending/ending-3.png")
print("source sizes", nevada.size, hamina.size, pacific.size, echo.size)

// Existing world captures arranged as five photographic planes.
let nevadaPath = NSBezierPath()
nevadaPath.move(to: NSPoint(x: 0, y: 168))
nevadaPath.line(to: NSPoint(x: 815, y: 168))
nevadaPath.line(to: NSPoint(x: 1010, y: 1080))
nevadaPath.line(to: NSPoint(x: 0, y: 1080))
nevadaPath.close()
clippedImage(nevada, path: nevadaPath, bounds: NSRect(x: 0, y: 168, width: 1010, height: 912), focusX: 0.5, focusY: 0.46)

let haminaPath = NSBezierPath()
haminaPath.move(to: NSPoint(x: 790, y: 168))
haminaPath.line(to: NSPoint(x: 1510, y: 168))
haminaPath.line(to: NSPoint(x: 1605, y: 1080))
haminaPath.line(to: NSPoint(x: 985, y: 1080))
haminaPath.close()
clippedImage(hamina, path: haminaPath, bounds: NSRect(x: 790, y: 168, width: 815, height: 912), focusX: 0.55, focusY: 0.5)

let pacificPath = NSBezierPath()
pacificPath.move(to: NSPoint(x: 1484, y: 168))
pacificPath.line(to: NSPoint(x: 1920, y: 168))
pacificPath.line(to: NSPoint(x: 1920, y: 1080))
pacificPath.line(to: NSPoint(x: 1580, y: 1080))
pacificPath.close()
clippedImage(pacific, path: pacificPath, bounds: NSRect(x: 1484, y: 168, width: 436, height: 912), focusX: 0.7, focusY: 0.5)

// Narrow factual archive strip: an existing data-center photograph.
let archiveRect = NSRect(x: 0, y: 0, width: 1920, height: 168)
aspectFill(dataCenter, in: archiveRect, focusX: 0.5, focusY: 0.54)
context.setFillColor(NSColor.black.withAlphaComponent(0.58).cgColor)
context.fill(archiveRect)

// Existing ECHO capture, cropped from its portrait screenshot.
let echoRect = NSRect(x: 1420, y: 620, width: 400, height: 325)
let echoPath = NSBezierPath(roundedRect: echoRect, xRadius: 162, yRadius: 162)
NSGraphicsContext.saveGraphicsState()
echoPath.addClip()
echo.draw(in: echoRect, from: NSRect(x: 435, y: 70, width: 410, height: 575),
          operation: .sourceOver, fraction: 1)
NSGraphicsContext.restoreGraphicsState()
NSColor.white.withAlphaComponent(0.72).setStroke()
echoPath.lineWidth = 2
echoPath.stroke()

// Dividers follow the photographic panel cuts.
context.setStrokeColor(NSColor.white.withAlphaComponent(0.82).cgColor)
context.setLineWidth(2)
context.move(to: CGPoint(x: 815, y: 168)); context.addLine(to: CGPoint(x: 1010, y: 1080))
context.move(to: CGPoint(x: 1510, y: 168)); context.addLine(to: CGPoint(x: 1605, y: 1080))
context.strokePath()

label("PROJECT", at: NSPoint(x: 92, y: 860), size: 34, weight: .medium,
      color: .white, tracking: 15)
label("ECHO", at: NSPoint(x: 82, y: 650), size: 218, weight: .black,
      color: .white, tracking: -8)
label("WHO OWNS THE MEMORY AFTER IT ENTERS THE CLOUD?", at: NSPoint(x: 96, y: 602),
      size: 22, weight: .semibold, color: NSColor.white.withAlphaComponent(0.9), tracking: 1.8)

label("NEVADA  /  PACIFIC OCEAN  /  HAMINA", at: NSPoint(x: 96, y: 86),
      size: 18, weight: .bold, color: .white, tracking: 4)
label("AN INTERACTIVE JOURNEY THROUGH DATA, MEMORY, AND INFRASTRUCTURE", at: NSPoint(x: 96, y: 48),
      size: 15, weight: .medium, color: NSColor.white.withAlphaComponent(0.72), tracking: 1.6)

label("01", at: NSPoint(x: 670, y: 222), size: 16, weight: .bold, color: .white, tracking: 2)
label("02", at: NSPoint(x: 1350, y: 222), size: 16, weight: .bold, color: .white, tracking: 2)
label("03", at: NSPoint(x: 1810, y: 222), size: 16, weight: .bold, color: .white, tracking: 2)

NSGraphicsContext.restoreGraphicsState()

guard let png = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Could not encode poster")
}
try FileManager.default.createDirectory(atPath: root + "/artifacts/poster",
                                        withIntermediateDirectories: true)
try png.write(to: URL(fileURLWithPath: output))
print(output)
