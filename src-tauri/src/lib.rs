use image::{DynamicImage, ImageFormat, GenericImageView};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{Emitter, State, Manager};

// Global cancellation flag
pub struct CancellationFlag(Arc<AtomicBool>);

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
pub enum ResizeMode {
    #[serde(rename = "dimensions")]
    Dimensions, // Resize by specific dimensions
    #[serde(rename = "percentage")]
    Percentage, // Resize by percentage
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OutputFormat {
    #[serde(rename = "png")]
    Png,
    #[serde(rename = "webp")]
    Webp,
    #[serde(rename = "jpeg")]
    Jpeg,
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
            OutputFormat::Jpeg => "jpg",
            OutputFormat::Tiff => "tiff",
            OutputFormat::Qoi => "qoi",
            OutputFormat::Bmp => "bmp",
        }
    }

    fn to_image_format(&self) -> Option<ImageFormat> {
        match self {
            OutputFormat::Png => Some(ImageFormat::Png),
            OutputFormat::Jpeg => Some(ImageFormat::Jpeg),
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
            "jpg" | "jpeg" => Some(OutputFormat::Jpeg),
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
    pub resize_mode: Option<ResizeMode>, // Resize mode: dimensions or percentage
    pub resize_percentage: Option<f32>, // 1.0 - 100.0, percentage to resize
    pub max_width: Option<u32>, // Optional resize width (when resize_mode = dimensions)
    pub max_height: Option<u32>, // Optional resize height (when resize_mode = dimensions)
    pub keep_aspect_ratio: Option<bool>, // Keep aspect ratio when resizing, default true
    pub create_backup: Option<bool>, // Create backup before overwriting, default true when overwrite is true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupInfo {
    pub original_path: String,
    pub backup_path: String,
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
    pub output_width: Option<u32>,
    pub output_height: Option<u32>,
    pub error: Option<String>,
    pub backup_info: Option<BackupInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchResult {
    pub results: Vec<FileResult>,
    pub total: usize,
    pub success_count: usize,
    pub failed_count: usize,
    pub backups: Vec<BackupInfo>,
}

fn convert_image(
    input_path: &Path,
    output_dir: &Path,
    format: Option<&OutputFormat>,
    overwrite: bool,
    operation_mode: &OperationMode,
    quality: Option<f32>,
    resize_mode: Option<&ResizeMode>,
    resize_percentage: Option<f32>,
    max_width: Option<u32>,
    max_height: Option<u32>,
    keep_aspect_ratio: bool,
) -> Result<(PathBuf, u64, u32, u32), String> {
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
        match resize_mode {
            Some(ResizeMode::Percentage) => {
                // Resize by percentage
                if let Some(percentage) = resize_percentage {
                    let percentage_decimal = (percentage.clamp(1.0, 100.0)) / 100.0;
                    let (width, height) = img.dimensions();
                    let new_width = ((width as f32) * percentage_decimal) as u32;
                    let new_height = ((height as f32) * percentage_decimal) as u32;
                    
                    if new_width > 0 && new_height > 0 {
                        img = img.resize_exact(new_width, new_height, image::imageops::FilterType::Lanczos3);
                    }
                }
            }
            Some(ResizeMode::Dimensions) | None => {
                // Resize by dimensions (original behavior)
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
        OutputFormat::Jpeg => {
            if should_optimize {
                // Use JPEG with quality control
                let quality_val = quality.unwrap_or(85.0).clamp(0.0, 100.0) as u8;
                save_jpeg_with_quality(&img, &output_path, quality_val)?;
            } else {
                // Use standard JPEG encoder with high quality
                save_jpeg_with_quality(&img, &output_path, 95)?;
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

    // Get output file size and dimensions
    let output_size = fs::metadata(&output_path)
        .map(|m| m.len())
        .unwrap_or(0);
    
    let (output_width, output_height) = img.dimensions();

    Ok((output_path, output_size, output_width, output_height))
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

fn save_jpeg_with_quality(img: &DynamicImage, output_path: &Path, quality: u8) -> Result<(), String> {
    use std::io::BufWriter;
    use image::codecs::jpeg::JpegEncoder;
    
    let rgb = img.to_rgb8();
    let (width, height) = rgb.dimensions();
    
    let file = fs::File::create(output_path)
        .map_err(|e| format!("Failed to create JPEG file: {}", e))?;
    let mut writer = BufWriter::new(file);
    
    let mut encoder = JpegEncoder::new_with_quality(&mut writer, quality);
    encoder.encode(rgb.as_raw(), width, height, image::ExtendedColorType::Rgb8)
        .map_err(|e| format!("Failed to encode JPEG: {}", e))?;
    
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressUpdate {
    pub current: usize,
    pub total: usize,
    pub success_count: usize,
    pub failed_count: usize,
    pub current_file: Option<String>,
}

#[tauri::command]
async fn optimize_batch(request: OptimizeBatchRequest, app: tauri::AppHandle, cancel_flag: State<'_, CancellationFlag>) -> Result<BatchResult, String> {
    let cancel_flag = cancel_flag.0.clone();
    
    tokio::task::spawn_blocking(move || {
        let mut results = Vec::new();
        let mut success_count = 0;
        let mut failed_count = 0;
        let total = request.paths.len();


        for (index, path_str) in request.paths.iter().enumerate() {
            // Check if cancellation was requested
            if cancel_flag.load(Ordering::Relaxed) {
                // Mark remaining files as failed with cancellation message
                for remaining_path in request.paths.iter().skip(index) {
                    results.push(FileResult {
                        path: remaining_path.clone(),
                        status: FileStatus::Failed,
                        output_path: None,
                        output_size: None,
                        output_width: None,
                        output_height: None,
                        error: Some("Processing cancelled by user".to_string()),
                        backup_info: None,
                    });
                    failed_count += 1;
                }
                break;
            }

            let input_path = Path::new(path_str);
            
            // Emit progress event before processing
            let _ = app.emit("progress-update", ProgressUpdate {
                current: index,
                total,
                success_count,
                failed_count,
                current_file: Some(path_str.clone()),
            });
        
        // No backup needed
        
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
            request.resize_mode.as_ref(),
            request.resize_percentage,
            request.max_width,
            request.max_height,
            request.keep_aspect_ratio.unwrap_or(true),
        ) {
            Ok((output_path, output_size, output_width, output_height)) => {
                results.push(FileResult {
                    path: path_str.clone(),
                    status: FileStatus::Success,
                    output_path: Some(output_path.to_string_lossy().to_string()),
                    output_size: Some(output_size),
                    output_width: Some(output_width),
                    output_height: Some(output_height),
                    error: None,
                    backup_info: None,
                });
                success_count += 1;
            }
            Err(e) => {
                results.push(FileResult {
                    path: path_str.clone(),
                    status: FileStatus::Failed,
                    output_path: None,
                    output_size: None,
                    output_width: None,
                    output_height: None,
                    error: Some(e),
                    backup_info: None,
                });
                failed_count += 1;
            }
        }
        
        // Emit progress event after processing
        let _ = app.emit("progress-update", ProgressUpdate {
            current: index + 1,
            total,
            success_count,
            failed_count,
            current_file: None,
        });
    }

    BatchResult {
        total: request.paths.len(),
        results,
        success_count,
        failed_count,
        backups: Vec::new(),
    }
    })
    .await
    .map_err(|e| format!("Failed to execute batch processing: {}", e))
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

#[tauri::command]
fn scan_folder_for_images(folder_path: String) -> Result<Vec<String>, String> {
    use std::fs;
    
    let supported_extensions = ["png", "jpg", "jpeg", "webp", "tiff", "tif", "qoi", "bmp"];
    let mut image_paths = Vec::new();
    
    fn scan_directory(dir: &Path, extensions: &[&str], paths: &mut Vec<String>) -> Result<(), String> {
        if !dir.is_dir() {
            return Err("Path is not a directory".to_string());
        }
        
        let entries = fs::read_dir(dir)
            .map_err(|e| format!("Failed to read directory: {}", e))?;
        
        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let path = entry.path();
            
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if let Some(ext_str) = ext.to_str() {
                        if extensions.contains(&ext_str.to_lowercase().as_str()) {
                            if let Some(path_str) = path.to_str() {
                                paths.push(path_str.to_string());
                            }
                        }
                    }
                }
            } else if path.is_dir() {
                // Recursive scan
                scan_directory(&path, extensions, paths)?;
            }
        }
        
        Ok(())
    }
    
    let folder = Path::new(&folder_path);
    scan_directory(folder, &supported_extensions, &mut image_paths)?;
    
    Ok(image_paths)
}

#[tauri::command]
fn create_backup(file_path: String) -> Result<BackupInfo, String> {
    let original = Path::new(&file_path);

    
    if !original.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }
    
    // Create backup in a .optisnap_backups folder in the same directory
    let parent = original.parent().ok_or("Cannot get parent directory")?;
    let backup_dir = parent.join(".optisnap_backups");
    
    
    fs::create_dir_all(&backup_dir)
        .map_err(|e| format!("Failed to create backup directory: {}", e))?;
    
    
    // Create unique backup filename with timestamp
    let filename = original.file_name().ok_or("Invalid filename")?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Failed to get timestamp: {}", e))?
        .as_secs();
    
    let backup_filename = format!("{}_{}", timestamp, filename.to_string_lossy());
    let backup_path = backup_dir.join(backup_filename);
    
    
    // Copy file to backup location
    let bytes_copied = fs::copy(original, &backup_path)
        .map_err(|e| format!("Failed to create backup: {}", e))?;
    
    
    // Verify backup exists
    if !backup_path.exists() {
        return Err("Backup file was not created successfully".to_string());
    }
    
    Ok(BackupInfo {
        original_path: file_path,
        backup_path: backup_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn restore_from_backup(backup_path: String, restore_path: String) -> Result<String, String> {
    let backup = Path::new(&backup_path);
    let restore = Path::new(&restore_path);
    
    if !backup.exists() {
        return Err(format!("Backup does not exist: {}", backup_path));
    }
    
    // Restore the backup to the original location
    fs::copy(backup, restore)
        .map_err(|e| format!("Failed to restore backup: {}", e))?;
    
    // Optionally delete the backup file after restoration
    fs::remove_file(backup)
        .map_err(|e| format!("Failed to remove backup: {}", e))?;
    
    Ok(format!("Restored: {}", restore_path))
}

#[tauri::command]
fn delete_backup(backup_path: String) -> Result<String, String> {
    let backup = Path::new(&backup_path);
    
    if backup.exists() {
        fs::remove_file(backup)
            .map_err(|e| format!("Failed to delete backup: {}", e))?;
    }
    
    Ok(format!("Deleted backup: {}", backup_path))
}

#[tauri::command]
fn cancel_batch(cancel_flag: State<CancellationFlag>) -> Result<String, String> {
    cancel_flag.0.store(true, Ordering::Relaxed);
    Ok("Batch processing cancellation requested".to_string())
}

#[tauri::command]
fn reset_cancel_flag(cancel_flag: State<CancellationFlag>) -> Result<String, String> {
    cancel_flag.0.store(false, Ordering::Relaxed);
    Ok("Cancel flag reset".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(CancellationFlag(Arc::new(AtomicBool::new(false))))
        .invoke_handler(tauri::generate_handler![
            optimize_batch,
            cancel_batch,
            reset_cancel_flag,
            get_supported_formats,
            get_image_dimensions,
            scan_folder_for_images,
            create_backup,
            restore_from_backup,
            delete_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
