import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TitleBar } from '@/components/TitleBar';
import { DropZone } from '@/components/DropZone';
import { SettingsPanel } from '@/components/SettingsPanel';
import { ProgressPanel } from '@/components/ProgressPanel';
import { TrackedFile, OutputFormat, OperationMode, BatchResult } from '@/types';
import './App.css';

function App() {
   // File state
   const [files, setFiles] = useState<TrackedFile[]>([]);

   // Settings state
   const [operationMode, setOperationMode] = useState<OperationMode>('optimize');
   const [outputFormat, setOutputFormat] = useState<OutputFormat>('webp');
   const [outputDir, setOutputDir] = useState('');
   const [overwrite, setOverwrite] = useState(true);
   const [quality, setQuality] = useState(75); // Default 75% for WebP, will be 90% for PNG
   const [maxWidth, setMaxWidth] = useState(0); // 0 means no resize
   const [maxHeight, setMaxHeight] = useState(0); // 0 means no resize
   const [keepAspectRatio, setKeepAspectRatio] = useState(true);

   // Adjust quality when format changes
   const handleFormatChange = (format: OutputFormat) => {
      setOutputFormat(format);
      // Set appropriate default quality for each format
      if (format === 'png') {
         setQuality(90); // PNG quality 90 for pngquant
      } else if (format === 'webp') {
         setQuality(75); // WebP quality 75
      }
   };

   // Processing state
   const [isProcessing, setIsProcessing] = useState(false);
   const [processedFiles, setProcessedFiles] = useState(0);
   const [successCount, setSuccessCount] = useState(0);
   const [failedCount, setFailedCount] = useState(0);

   const handleFilesAdded = useCallback(
      (newFiles: TrackedFile[]) => {
         // Set output directory to the directory of the first file if not already set
         if (files.length === 0 && newFiles.length > 0 && !outputDir) {
            const firstFilePath = newFiles[0].path;
            const lastSlashIndex = Math.max(firstFilePath.lastIndexOf('/'), firstFilePath.lastIndexOf('\\'));
            if (lastSlashIndex !== -1) {
               const directory = firstFilePath.substring(0, lastSlashIndex);
               setOutputDir(directory);
            }
         }

         setFiles((prev) => {
            const existingPaths = new Set(prev.map((f) => f.path));
            const uniqueNewFiles = newFiles.filter((f) => !existingPaths.has(f.path));
            const allFiles = [...prev, ...uniqueNewFiles];

            // If first time adding files, find max dimensions
            if (prev.length === 0 && uniqueNewFiles.length > 0) {
               const filesWithDims = uniqueNewFiles.filter((f) => f.width && f.height);
               if (filesWithDims.length > 0) {
                  const maxW = Math.max(...filesWithDims.map((f) => f.width!));
                  const maxH = Math.max(...filesWithDims.map((f) => f.height!));
                  setMaxWidth(maxW);
                  setMaxHeight(maxH);
               }
            }

            return allFiles;
         });
      },
      [files.length, outputDir]
   );

   const handleFileRemove = useCallback((id: string) => {
      setFiles((prev) => prev.filter((f) => f.id !== id));
   }, []);

   const handleClearAll = useCallback(() => {
      setFiles([]);
      setProcessedFiles(0);
      setSuccessCount(0);
      setFailedCount(0);
   }, []);

   const handleStart = async () => {
      if (files.length === 0) return;
      if (!overwrite && !outputDir) return;

      setIsProcessing(true);
      setProcessedFiles(0);
      setSuccessCount(0);
      setFailedCount(0);

      // Mark all files as pending
      setFiles((prev) => prev.map((f) => ({ ...f, status: 'pending' as const, error: undefined })));

      try {
         // If overwrite is true, use original file directory
         // Otherwise use the specified output directory
         const effectiveOutputDir = overwrite ? '' : outputDir;

         // Call Rust backend
         const result = await invoke<BatchResult>('optimize_batch', {
            request: {
               paths: files.map((f) => f.path),
               output_dir: effectiveOutputDir,
               format: operationMode === 'convert' ? outputFormat : undefined,
               overwrite,
               operation_mode: operationMode,
               quality:
                  (operationMode === 'optimize' || operationMode === 'optimize_resize' || operationMode === 'all') &&
                  (outputFormat === 'webp' || outputFormat === 'png')
                     ? quality
                     : undefined,
               max_width:
                  (operationMode === 'resize' || operationMode === 'optimize_resize' || operationMode === 'all') &&
                  maxWidth > 0
                     ? maxWidth
                     : undefined,
               max_height:
                  (operationMode === 'resize' || operationMode === 'optimize_resize' || operationMode === 'all') &&
                  maxHeight > 0
                     ? maxHeight
                     : undefined,
               keep_aspect_ratio: keepAspectRatio,
            },
         });

         // Update file statuses based on results
         setFiles((prev) =>
            prev.map((f) => {
               const fileResult = result.results.find((r) => r.path === f.path);
               if (fileResult) {
                  return {
                     ...f,
                     status: fileResult.status,
                     error: fileResult.error ?? undefined,
                     outputPath: fileResult.output_path ?? undefined,
                     outputSize: fileResult.output_size ?? undefined,
                  };
               }
               return f;
            })
         );

         setProcessedFiles(result.total);
         setSuccessCount(result.success_count);
         setFailedCount(result.failed_count);
      } catch (error) {
         console.error('Batch optimization failed:', error);
         // Mark all files as failed
         setFiles((prev) =>
            prev.map((f) => ({
               ...f,
               status: 'failed' as const,
               error: String(error),
            }))
         );
         setProcessedFiles(files.length);
         setFailedCount(files.length);
      } finally {
         setIsProcessing(false);
      }
   };

   const handleCancel = () => {
      // Note: In a real app, you'd implement cancellation via Rust
      // For now, we just stop the UI
      setIsProcessing(false);
   };

   const canStart =
      files.length > 0 &&
      (overwrite || outputDir.length > 0) &&
      !isProcessing &&
      files.some((f) => f.status === 'pending' || f.status === 'failed');

   return (
      <div className='h-screen flex flex-col bg-background overflow-hidden'>
         {/* Custom Title Bar */}
         <TitleBar />

         {/* Main Content */}
         <main className='flex-1 flex overflow-hidden'>
            {/* Left Panel - File List */}
            <div className='flex-1 flex flex-col border-r border-border min-w-0'>
               {/* Toolbar */}
               <div className='h-9 px-3 flex items-center gap-2 border-b border-border bg-muted/30 shrink-0'>
                  <span className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
                     Source Files
                  </span>
                  {files.length > 0 && <span className='text-xs text-muted-foreground'>({files.length} items)</span>}
               </div>

               {/* Drop Zone & File List */}
               <div className='flex-1 overflow-hidden'>
                  <DropZone
                     files={files}
                     onFilesAdded={handleFilesAdded}
                     onFileRemove={handleFileRemove}
                     onClearAll={handleClearAll}
                     disabled={isProcessing}
                  />
               </div>
            </div>

            {/* Right Panel - Settings & Actions */}
            <div className='w-72 flex flex-col shrink-0 bg-muted/20'>
               {/* Settings Toolbar */}
               <div className='h-9 px-3 flex items-center border-b border-border bg-muted/30 shrink-0'>
                  <span className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
                     Output Settings
                  </span>
               </div>

               {/* Settings Content */}
               <div className='flex-1 overflow-y-auto'>
                  <SettingsPanel
                     operationMode={operationMode}
                     onOperationModeChange={setOperationMode}
                     outputFormat={outputFormat}
                     onFormatChange={handleFormatChange}
                     outputDir={outputDir}
                     onOutputDirChange={setOutputDir}
                     overwrite={overwrite}
                     onOverwriteChange={setOverwrite}
                     quality={quality}
                     onQualityChange={setQuality}
                     maxWidth={maxWidth}
                     onMaxWidthChange={setMaxWidth}
                     maxHeight={maxHeight}
                     onMaxHeightChange={setMaxHeight}
                     keepAspectRatio={keepAspectRatio}
                     onKeepAspectRatioChange={setKeepAspectRatio}
                     files={files}
                     disabled={isProcessing}
                  />
               </div>

               {/* Progress & Actions */}
               <div className='border-t border-border'>
                  <ProgressPanel
                     isProcessing={isProcessing}
                     totalFiles={files.length}
                     processedFiles={processedFiles}
                     successCount={successCount}
                     failedCount={failedCount}
                     outputDir={outputDir}
                     onStart={handleStart}
                     onCancel={handleCancel}
                     canStart={canStart}
                  />
               </div>
            </div>
         </main>

         {/* Status Bar */}
         <div className='h-6 px-3 flex items-center justify-between border-t border-border bg-muted/50 text-xs text-muted-foreground shrink-0'>
            <span>Ready</span>
            <span>Tauri v2 • Optimized Compression</span>
         </div>
      </div>
   );
}

export default App;
