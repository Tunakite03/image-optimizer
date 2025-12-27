// Output formats supported by the optimizer
export type OutputFormat = 'png' | 'webp' | 'tiff' | 'qoi' | 'bmp';

// Operation modes
export type OperationMode = 'optimize' | 'resize' | 'convert' | 'optimize_resize' | 'all';

// File processing status
export type FileStatus = 'pending' | 'processing' | 'success' | 'failed';

// Request to optimize a batch of images
export interface OptimizeBatchRequest {
   paths: string[];
   output_dir: string;
   format?: OutputFormat; // Only required for 'convert' mode
   overwrite: boolean;
   operation_mode: OperationMode;
   quality?: number; // 0-100, default 75 for WebP, 90 for PNG
   max_width?: number; // Optional resize width
   max_height?: number; // Optional resize height
   keep_aspect_ratio?: boolean; // Default true
}

// Result of a single file conversion (matches Rust serde output)
export interface FileResult {
   path: string;
   status: FileStatus;
   output_path: string | null;
   output_size: number | null;
   error: string | null;
}

// Result of the entire batch operation (matches Rust serde output)
export interface BatchResult {
   results: FileResult[];
   total: number;
   success_count: number;
   failed_count: number;
}

// Tracked file in the UI
export interface TrackedFile {
   id: string;
   name: string;
   path: string;
   size: number;
   width?: number;
   height?: number;
   status: FileStatus;
   error?: string;
   outputPath?: string;
   outputSize?: number;
}

// Supported image extensions for filtering
export const SUPPORTED_EXTENSIONS = [
   '.png',
   '.jpg',
   '.jpeg',
   '.webp',
   '.tiff',
   '.tif',
   '.bmp',
   '.gif',
   '.qoi',
] as const;

// Format display names
export const FORMAT_OPTIONS: { value: OutputFormat; label: string }[] = [
   { value: 'png', label: 'PNG (Lossy - PngQuant)' },
   { value: 'webp', label: 'WebP (Lossy)' },
   { value: 'tiff', label: 'TIFF' },
   { value: 'qoi', label: 'QOI (Quite OK Image)' },
   { value: 'bmp', label: 'BMP' },
];

// Operation mode display names
export const OPERATION_MODE_OPTIONS: { value: OperationMode; label: string; description: string }[] = [
   {
      value: 'optimize',
      label: 'Optimize Only',
      description: 'Compress images to reduce file size',
   },
   {
      value: 'resize',
      label: 'Resize Only',
      description: 'Change image dimensions without compression',
   },
   {
      value: 'convert',
      label: 'Convert Only',
      description: 'Change format without optimization (lossless)',
   },
   {
      value: 'optimize_resize',
      label: 'Optimize + Resize',
      description: 'Compress and resize images together',
   },
   {
      value: 'all',
      label: 'All-in-One',
      description: 'Convert, optimize, and resize in one go',
   },
];
