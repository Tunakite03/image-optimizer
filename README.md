# Bulk Image Optimizer

A desktop application built with Tauri v2 for bulk image processing. Drag and drop multiple images to optimize, resize, convert, or combine operations losslessly.

## Features

-  **Optimize Only**: Compress images (WebP, PNG) while maintaining original size
-  **Resize Only**: Change image dimensions with high-quality Lanczos3 filtering
-  **Convert Only**: Lossless format conversion (PNG, WebP, TIFF, QOI, BMP)
-  **Optimize + Resize**: Combine compression and resizing
-  **Resize + Convert**: Resize and convert in one operation
-  **Optimize + Convert**: Compress and change format
-  **All-in-One**: Full processing pipeline
-  Drag & drop interface
-  Progress tracking
-  Windows-first support (macOS planned)

## Installation

### Prerequisites

-  [Node.js](https://nodejs.org/) >= 18
-  [Rust](https://rustup.rs/)
-  Visual Studio Build Tools with C++ desktop development and Windows SDK (for Windows)

### Setup

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd image-optimizer
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm run tauri dev
   ```

## Usage

1. Launch the application
2. Drag and drop image files into the drop zone
3. Select processing mode and configure settings
4. Click "Process" to start optimization
5. Monitor progress and view results

Supported input formats: PNG, WebP, JPEG, TIFF, BMP, QOI

## Development

### Building

```bash
npm run build
npm run tauri build
```

### Project Structure

-  `src/`: React frontend with TypeScript
-  `src-tauri/`: Rust backend with Tauri
-  `src-tauri/src/`: Main Rust application logic

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

[MIT License](LICENSE)
