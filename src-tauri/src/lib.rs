use image::{DynamicImage, ImageFormat, GenericImageView};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OperationMode {
    #[serde(rename = "optimize")]
    Optimize, // Only compress (with quality)
    #[serde(rename = "resize")]
    Resize, // Only resize
    #[serde(rename = "convert")]
    Convert, // Only convert format (lossless)
    #[serde(rename = "optimize_resize")]
    OptimizeResize, // Optimize + Resize
    #[serde(rename = "all")]
    All, // Do all: Convert + Optimize + Resize
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OutputFormat {
    #[serde(rename = "png")]
    Png,
    #[serde(rename = "webp")]
    Webp,
    #[serde(rename = "tiff")]
    Tiff,
    #[serde(rename = "qoi")]
    Qoi,
    #[serde(rename = "bmp")]
    Bmp,
}

impl OutputFormat {
    fn extension(&self) -> &str {
        match self {
            OutputFormat::Png => "png",
            OutputFormat::Webp => "webp",
            OutputFormat::Tiff => "tiff",
            OutputFormat::Qoi => "qoi",
            OutputFormat::Bmp => "bmp",
        }
    }

    fn to_image_format(&self) -> Option<ImageFormat> {
        match self {
            OutputFormat::Png => Some(ImageFormat::Png),
            OutputFormat::Tiff => Some(ImageFormat::Tiff),
            OutputFormat::Bmp => Some(ImageFormat::Bmp),
            OutputFormat::Qoi => Some(ImageFormat::Qoi),
            OutputFormat::Webp => Some(ImageFormat::WebP),
        }
    }

    fn from_path(path: &Path) -> Option<OutputFormat> {
        let ext = path.extension()?.to_str()?.to_lowercase();
        match ext.as_str() {
            "png" => Some(OutputFormat::Png),
            "webp" => Some(OutputFormat::Webp),
            "tiff" | "tif" => Some(OutputFormat::Tiff),
            "qoi" => Some(OutputFormat::Qoi),
            "bmp" => Some(OutputFormat::Bmp),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizeBatchRequest {
    pub paths: Vec<String>,
    pub output_dir: String,
    pub format: Option<OutputFormat>, // Only for 'convert' mode, otherwise use original format
    pub overwrite: bool,
    pub operation_mode: OperationMode, // Operation mode
    pub quality: Option<f32>, // 0.0 - 100.0, default 75 for WebP, 80 for JPEG
    pub max_width: Option<u32>, // Optional resize width
    pub max_height: Option<u32>, // Optional resize height
    pub keep_aspect_ratio: Option<bool>, // Keep aspect ratio when resizing, default true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FileStatus {
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "processing")]
    Processing,
    #[serde(rename = "success")]
    Success,
    #[serde(rename = "failed")]
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileResult {
    pub path: String,
    pub status: FileStatus,
    pub output_path: Option<String>,
    pub output_size: Option<u64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchResult {
    pub results: Vec<FileResult>,
    pub total: usize,
    pub success_count: usize,
    pub failed_count: usize,
}

fn convert_image(
    input_path: &Path,
    output_dir: &Path,
    format: Option<&OutputFormat>,
    overwrite: bool,
    operation_mode: &OperationMode,
    quality: Option<f32>,
    max_width: Option<u32>,
    max_height: Option<u32>,
    keep_aspect_ratio: bool,
) -> Result<(PathBuf, u64), String> {
    // Load the image
    let mut img = image::open(input_path)
        .map_err(|e| format!("Failed to open image: {}", e))?;
    
    // Determine output format: use specified format or detect from original file
    let output_format = match format {
        Some(fmt) => fmt.clone(),
        None => OutputFormat::from_path(input_path)
            .ok_or_else(|| format!("Cannot detect format from: {:?}", input_path))?,
    };
    
    // Resize based on operation mode
    let should_resize = matches!(
        operation_mode,
        OperationMode::Resize | OperationMode::OptimizeResize | OperationMode::All
    );
    
    if should_resize {
        if let (Some(max_w), Some(max_h)) = (max_width, max_height) {
            let (width, height) = img.dimensions();
            if width > max_w || height > max_h {
                if keep_aspect_ratio {
                    // Resize with aspect ratio (fit within bounds)
                    img = img.resize(max_w, max_h, image::imageops::FilterType::Lanczos3);
                } else {
                    // Resize exact (may distort image)
                    img = img.resize_exact(max_w, max_h, image::imageops::FilterType::Lanczos3);
                }
            }
        }
    }

    // Get the filename without extension
    let stem = input_path
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("Invalid filename")?;

    // Create output path with appropriate suffix based on operation mode
    let suffix = match operation_mode {
        OperationMode::Optimize => "optimized",
        OperationMode::Resize => "resized",
        OperationMode::Convert => "converted",
        OperationMode::OptimizeResize => "optimized_resized",
        OperationMode::All => "processed",
    };
    
    let output_filename = if overwrite {
        format!("{}.{}", stem, output_format.extension())
    } else {
        format!("{}_{}.{}", stem, suffix, output_format.extension())
    };
    let output_path = output_dir.join(&output_filename);

    // Ensure output directory exists
    fs::create_dir_all(output_dir)
        .map_err(|e| format!("Failed to create output directory: {}", e))?;

    // Determine if we should apply optimization/quality settings
    let should_optimize = matches!(
        operation_mode,
        OperationMode::Optimize | OperationMode::OptimizeResize | OperationMode::All
    );

    // Save the image in the target format
    match &output_format {
        OutputFormat::Webp => {
            if should_optimize {
                // Use lossy WebP encoding with quality control
                let quality_val = quality.unwrap_or(75.0).clamp(0.0, 100.0);
                save_webp_lossy(&img, &output_path, quality_val)?;
            } else {
                // Use lossless for Convert mode
                save_webp_lossless(&img, &output_path)?;
            }
        }
        OutputFormat::Png => {
            if should_optimize {
                // Use PNG with pngquant compression
                let quality_val = quality.unwrap_or(90.0).clamp(0.0, 100.0) as u8;
                save_png_compressed(&img, &output_path, quality_val)?;
            } else {
                // Use standard PNG encoder
                img.save(&output_path)
                    .map_err(|e| format!("Failed to save PNG: {}", e))?;
            }
        }
        OutputFormat::Qoi => {
            // QOI format
            save_qoi(&img, &output_path)?;
        }
        _ => {
            // Use image crate for TIFF, BMP
            let image_format = output_format.to_image_format()
                .ok_or("Unsupported format")?;
            img.save_with_format(&output_path, image_format)
                .map_err(|e| format!("Failed to save image: {}", e))?;
        }
    }

    // Get output file size
    let output_size = fs::metadata(&output_path)
        .map(|m| m.len())
        .unwrap_or(0);

    Ok((output_path, output_size))
}

fn save_webp_lossy(img: &DynamicImage, output_path: &Path, quality: f32) -> Result<(), String> {
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    
    let encoder = webp::Encoder::from_rgba(&rgba, width, height);
    // Use lossy encoding with quality parameter (0-100)
    let webp_data = encoder.encode(quality);
    
    fs::write(output_path, &*webp_data)
        .map_err(|e| format!("Failed to write WebP file: {}", e))?;
    
    Ok(())
}

fn save_webp_lossless(img: &DynamicImage, output_path: &Path) -> Result<(), String> {
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    
    let encoder = webp::Encoder::from_rgba(&rgba, width, height);
    // Use lossless encoding
    let webp_data = encoder.encode_lossless();
    
    fs::write(output_path, &*webp_data)
        .map_err(|e| format!("Failed to write WebP file: {}", e))?;
    
    Ok(())
}

fn save_png_compressed(img: &DynamicImage, output_path: &Path, quality: u8) -> Result<(), String> {
    // Use pngquant algorithm (imagequant) for lossy compression with quality control
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    
    // Convert ImageBuffer to RGBA format for imagequant
    let rgba_data: Vec<imagequant::RGBA> = rgba.pixels()
        .map(|p| imagequant::RGBA::new(p[0], p[1], p[2], p[3]))
        .collect();
    
    // Create attributes for pngquant
    let mut liq = imagequant::new();
    
    // Set quality range (min 0, max quality)
    // Higher quality = more colors preserved
    liq.set_quality(0, quality)
        .map_err(|e| format!("Failed to set quality: {:?}", e))?;
    
    // Speed vs quality tradeoff (1-10, 1=best quality/slowest, 10=worst/fastest)
    liq.set_speed(5)
        .map_err(|e| format!("Failed to set speed: {:?}", e))?;
    
    // Create image for quantization
    let mut img_data = liq.new_image(
        rgba_data.into_boxed_slice(),
        width as usize,
        height as usize,
        0.0
    ).map_err(|e| format!("Failed to create image: {:?}", e))?;
    
    // Quantize (reduce colors)
    let mut result = liq.quantize(&mut img_data)
        .map_err(|e| format!("Failed to quantize: {:?}", e))?;
    
    // Set dithering level (0.0 - 1.0)
    result.set_dithering_level(1.0)
        .map_err(|e| format!("Failed to set dithering: {:?}", e))?;
    
    // Get quantized image data
    let (palette, pixels) = result.remapped(&mut img_data)
        .map_err(|e| format!("Failed to remap: {:?}", e))?;
    
    // Write PNG with oxipng optimization
    write_optimized_png(output_path, &pixels, &palette, width, height)?;
    
    Ok(())
}

fn write_optimized_png(
    output_path: &Path,
    pixels: &[u8],
    palette: &[imagequant::RGBA],
    width: u32,
    height: u32,
) -> Result<(), String> {
    use std::io::BufWriter;
    
    // First write to a temporary buffer
    let mut png_data = Vec::new();
    {
        let writer = BufWriter::new(&mut png_data);
        let mut encoder = png::Encoder::new(writer, width, height);
        encoder.set_color(png::ColorType::Indexed);
        encoder.set_depth(png::BitDepth::Eight);
        
        // Convert palette to PNG format
        let palette_rgb: Vec<u8> = palette.iter()
            .flat_map(|c| [c.r, c.g, c.b])
            .collect();
        encoder.set_palette(palette_rgb);
        
        // Set transparency if needed
        let has_alpha = palette.iter().any(|c| c.a < 255);
        if has_alpha {
            let trns: Vec<u8> = palette.iter().map(|c| c.a).collect();
            encoder.set_trns(trns);
        }
        
        let mut writer = encoder.write_header()
            .map_err(|e| format!("Failed to write PNG header: {}", e))?;
        writer.write_image_data(pixels)
            .map_err(|e| format!("Failed to write PNG data: {}", e))?;
    }
    
    // Optimize with oxipng
    let options = oxipng::Options {
        strip: oxipng::StripChunks::Safe,
        optimize_alpha: true,
        ..oxipng::Options::max_compression()
    };
    
    let optimized = oxipng::optimize_from_memory(&png_data, &options)
        .map_err(|e| format!("Failed to optimize PNG: {}", e))?;
    
    fs::write(output_path, optimized)
        .map_err(|e| format!("Failed to write optimized PNG: {}", e))?;
    
    Ok(())
}

fn save_qoi(img: &DynamicImage, output_path: &Path) -> Result<(), String> {
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    
    let qoi_data = qoi::encode_to_vec(
        rgba.as_raw(),
        width,
        height,
    ).map_err(|e| format!("Failed to encode QOI: {}", e))?;
    
    fs::write(output_path, qoi_data)
        .map_err(|e| format!("Failed to write QOI file: {}", e))?;
    
    Ok(())
}

#[tauri::command]
fn optimize_batch(request: OptimizeBatchRequest) -> BatchResult {
    let mut results = Vec::new();
    let mut success_count = 0;
    let mut failed_count = 0;

    for path_str in &request.paths {
        let input_path = Path::new(path_str);
        
        // If overwrite is true and output_dir is empty, use the input file's directory
        let output_dir = if request.overwrite && request.output_dir.is_empty() {
            input_path.parent().unwrap_or(Path::new("."))
        } else {
            Path::new(&request.output_dir)
        };
        
        match convert_image(
            input_path,
            output_dir,
            request.format.as_ref(),
            request.overwrite,
            &request.operation_mode,
            request.quality,
            request.max_width,
            request.max_height,
            request.keep_aspect_ratio.unwrap_or(true),
        ) {
            Ok((output_path, output_size)) => {
                results.push(FileResult {
                    path: path_str.clone(),
                    status: FileStatus::Success,
                    output_path: Some(output_path.to_string_lossy().to_string()),
                    output_size: Some(output_size),
                    error: None,
                });
                success_count += 1;
            }
            Err(e) => {
                results.push(FileResult {
                    path: path_str.clone(),
                    status: FileStatus::Failed,
                    output_path: None,
                    output_size: None,
                    error: Some(e),
                });
                failed_count += 1;
            }
        }
    }

    BatchResult {
        total: request.paths.len(),
        results,
        success_count,
        failed_count,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageDimensions {
    pub width: u32,
    pub height: u32,
}

#[tauri::command]
fn get_image_dimensions(path: String) -> Result<ImageDimensions, String> {
    let img = image::open(&path)
        .map_err(|e| format!("Failed to open image: {}", e))?;
    let (width, height) = img.dimensions();
    Ok(ImageDimensions { width, height })
}

#[tauri::command]
fn get_supported_formats() -> Vec<String> {
    vec![
        "png".to_string(),
        "webp".to_string(),
        "tiff".to_string(),
        "qoi".to_string(),
        "bmp".to_string(),
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![optimize_batch, get_supported_formats, get_image_dimensions])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
