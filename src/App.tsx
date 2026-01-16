import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useTranslation } from 'react-i18next';
import { TitleBar } from '@/components/TitleBar';
import { DropZone } from '@/components/DropZone';
import { SettingsPanel } from '@/components/SettingsPanel';
import { ProgressPanel } from '@/components/ProgressPanel';

import { ResizablePanel } from '@/components/ResizablePanel';
import {
   TrackedFile,
   OutputFormat,
   OperationMode,
   ResizeMode,
   BatchResult,
   ProgressUpdate,
} from '@/types';
import './App.css';
import { config } from './config';

function App() {
   const { t } = useTranslation();
   // File state
   const [files, setFiles] = useState<TrackedFile[]>([]);

   // Settings state
   const [operationMode, setOperationMode] =
      useState<OperationMode>('optimize');
   const [outputFormat, setOutputFormat] = useState<OutputFormat>('webp');
   const [outputDir, setOutputDir] = useState('');
   const [overwrite, setOverwrite] = useState(true);
   const [quality, setQuality] = useState(90); // Default 75% for WebP, will be 90% for PNG
   const [resizeMode, setResizeMode] = useState<ResizeMode>('percentage');
   const [resizePercentage, setResizePercentage] = useState(75); // Default 75%
   const [maxWidth, setMaxWidth] = useState(0); // 0 means no resize
   const [maxHeight, setMaxHeight] = useState(0); // 0 means no resize
   const [keepAspectRatio, setKeepAspectRatio] = useState(true);

   // Handle width change with aspect ratio
   const handleMaxWidthChange = (width: number) => {
      setMaxWidth(width);
      if (keepAspectRatio && width > 0 && maxHeight > 0) {
         // Find the original aspect ratio from files
         const filesWithDims = files.filter((f) => f.width && f.height);
         if (filesWithDims.length > 0) {
            const maxOriginalWidth = Math.max(
               ...filesWithDims.map((f) => f.width!),
            );
            const maxOriginalHeight = Math.max(
               ...filesWithDims.map((f) => f.height!),
            );
            const aspectRatio = maxOriginalWidth / maxOriginalHeight;
            setMaxHeight(Math.round(width / aspectRatio));
         }
      }
   };

   // Handle height change with aspect ratio
   const handleMaxHeightChange = (height: number) => {
      setMaxHeight(height);
      if (keepAspectRatio && height > 0 && maxWidth > 0) {
         // Find the original aspect ratio from files
         const filesWithDims = files.filter((f) => f.width && f.height);
         if (filesWithDims.length > 0) {
            const maxOriginalWidth = Math.max(
               ...filesWithDims.map((f) => f.width!),
            );
            const maxOriginalHeight = Math.max(
               ...filesWithDims.map((f) => f.height!),
            );
            const aspectRatio = maxOriginalWidth / maxOriginalHeight;
            setMaxWidth(Math.round(height * aspectRatio));
         }
      }
   };

   // Adjust quality when format changes
   const handleFormatChange = (format: OutputFormat) => {
      setOutputFormat(format);
      // Set appropriate default quality for each format
      if (format === 'png') {
         setQuality(90); // PNG quality 90 for pngquant
      } else if (format === 'webp') {
         setQuality(75); // WebP quality 75
      } else if (format === 'jpeg') {
         setQuality(85); // JPEG quality 85
      }
   };

   // Processing state
   const [isProcessing, setIsProcessing] = useState(false);
   const [processedFiles, setProcessedFiles] = useState(0);
   const [successCount, setSuccessCount] = useState(0);
   const [failedCount, setFailedCount] = useState(0);

   // Listen to progress events from Rust backend
   useEffect(() => {
      const unlisten = listen<ProgressUpdate>('progress-update', (event) => {
         setProcessedFiles(event.payload.current);
         setSuccessCount(event.payload.success_count);
         setFailedCount(event.payload.failed_count);
      });

      return () => {
         unlisten.then((fn) => fn());
      };
   }, []);

   const handleFilesAdded = useCallback(
      (newFiles: TrackedFile[]) => {
         // Set output directory to the directory of the first file if not already set
         if (files.length === 0 && newFiles.length > 0 && !outputDir) {
            const firstFilePath = newFiles[0].path;
            const lastSlashIndex = Math.max(
               firstFilePath.lastIndexOf('/'),
               firstFilePath.lastIndexOf('\\'),
            );
            if (lastSlashIndex !== -1) {
               const directory = firstFilePath.substring(0, lastSlashIndex);
               setOutputDir(directory);
            }
         }

         setFiles((prev) => {
            const existingPaths = new Set(prev.map((f) => f.path));
            const uniqueNewFiles = newFiles.filter(
               (f) => !existingPaths.has(f.path),
            );
            const allFiles = [...prev, ...uniqueNewFiles];

            // If first time adding files, find max dimensions
            if (prev.length === 0 && uniqueNewFiles.length > 0) {
               const filesWithDims = uniqueNewFiles.filter(
                  (f) => f.width && f.height,
               );
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
      [files.length, outputDir],
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

      // Reset cancellation flag before starting
      try {
         await invoke('reset_cancel_flag');
      } catch (error) {
         console.error('Failed to reset cancel flag:', error);
      }

      setIsProcessing(true);
      setProcessedFiles(0);
      setSuccessCount(0);
      setFailedCount(0);

      // Mark all files as pending
      setFiles((prev) =>
         prev.map((f) => ({
            ...f,
            status: 'pending' as const,
            error: undefined,
         })),
      );

      try {
         // If overwrite is true, use original file directory
         // Otherwise use the specified output directory
         const effectiveOutputDir = overwrite ? '' : outputDir;

         // Call Rust backend (backup will be created automatically if overwrite is true)
         const result = await invoke<BatchResult>('optimize_batch', {
            request: {
               paths: files.map((f) => f.path),
               output_dir: effectiveOutputDir,
               format: operationMode === 'convert' ? outputFormat : undefined,
               overwrite,
               operation_mode: operationMode,
               quality:
                  (operationMode === 'optimize' ||
                     operationMode === 'optimize_resize' ||
                     operationMode === 'all') &&
                  (outputFormat === 'webp' ||
                     outputFormat === 'png' ||
                     outputFormat === 'jpeg')
                     ? quality
                     : undefined,
               resize_mode:
                  operationMode === 'resize' ||
                  operationMode === 'optimize_resize' ||
                  operationMode === 'all'
                     ? resizeMode
                     : undefined,
               resize_percentage:
                  (operationMode === 'resize' ||
                     operationMode === 'optimize_resize' ||
                     operationMode === 'all') &&
                  resizeMode === 'percentage'
                     ? resizePercentage
                     : undefined,
               max_width:
                  (operationMode === 'resize' ||
                     operationMode === 'optimize_resize' ||
                     operationMode === 'all') &&
                  resizeMode === 'dimensions' &&
                  maxWidth > 0
                     ? maxWidth
                     : undefined,
               max_height:
                  (operationMode === 'resize' ||
                     operationMode === 'optimize_resize' ||
                     operationMode === 'all') &&
                  resizeMode === 'dimensions' &&
                  maxHeight > 0
                     ? maxHeight
                     : undefined,
               keep_aspect_ratio: keepAspectRatio,
               create_backup: overwrite, // Only create backup when overwriting files
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
                     outputWidth: fileResult.output_width ?? undefined,
                     outputHeight: fileResult.output_height ?? undefined,
                  };
               }
               return f;
            }),
         );

         setProcessedFiles(result.total);
         setSuccessCount(result.success_count);
         setFailedCount(result.failed_count);

         // Add to history
         // No history tracking
      } catch (error) {
         console.error('Batch optimization failed:', error);
         // Mark all files as failed
         setFiles((prev) =>
            prev.map((f) => ({
               ...f,
               status: 'failed' as const,
               error: String(error),
            })),
         );
         setProcessedFiles(files.length);
         setFailedCount(files.length);
      } finally {
         setIsProcessing(false);
      }
   };

   const handleCancel = async () => {
      try {
         await invoke('cancel_batch');
         setIsProcessing(false);
      } catch (error) {
         console.error('Failed to cancel batch:', error);
      }
   };

   const canStart =
      files.length > 0 &&
      (overwrite || outputDir.length > 0) &&
      !isProcessing &&
      files.some((f) => f.status === 'pending' || f.status === 'failed');

   return (
      <div className="h-screen flex flex-col bg-background overflow-hidden">
         {/* Custom Title Bar */}
         <TitleBar />

         {/* Main Content */}
         <main className="flex-1 flex overflow-hidden">
            <ResizablePanel
               minLeftWidth={300}
               minRightWidth={250}
               defaultRightWidth={288}
            >
               {/* Left Panel - File List */}
               <div className="flex-1 flex flex-col border-r border-border min-w-0">
                  {/* Toolbar */}
                  <div className="h-9 px-3 flex items-center gap-2 border-b border-border bg-muted/30 shrink-0">
                     <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {t('app.sourceFiles')}
                     </span>
                     {files.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                           ({files.length} {t('app.items')})
                        </span>
                     )}
                  </div>

                  {/* Drop Zone & File List */}
                  <div className="flex-1 overflow-hidden">
                     <DropZone
                        files={files}
                        onFilesAdded={handleFilesAdded}
                        onFileRemove={handleFileRemove}
                        onClearAll={handleClearAll}
                        operationMode={operationMode}
                        disabled={isProcessing}
                     />
                  </div>
               </div>

               {/* Right Panel - Settings & Actions */}
               <div className="flex flex-col h-full">
                  {/* Settings Toolbar */}
                  <div className="h-9 px-3 flex items-center border-b border-border bg-muted/30 shrink-0">
                     <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {t('app.outputSettings')}
                     </span>
                  </div>

                  {/* Settings Content - Scrollable */}
                  <div className="flex-1 overlay-scrollbar-container">
                     <div className="overlay-scrollbar">
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
                           resizeMode={resizeMode}
                           onResizeModeChange={setResizeMode}
                           resizePercentage={resizePercentage}
                           onResizePercentageChange={setResizePercentage}
                           maxWidth={maxWidth}
                           onMaxWidthChange={handleMaxWidthChange}
                           maxHeight={maxHeight}
                           onMaxHeightChange={handleMaxHeightChange}
                           keepAspectRatio={keepAspectRatio}
                           onKeepAspectRatioChange={setKeepAspectRatio}
                           files={files}
                           disabled={isProcessing}
                        />
                     </div>
                  </div>

                  {/* Progress & Actions */}
                  <div className="border-t border-border">
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
            </ResizablePanel>
         </main>

         {/* Status Bar */}
         <div className="h-6 px-3 flex items-center justify-between border-t border-border bg-muted/50 text-xs text-muted-foreground shrink-0">
            <span>Version: {config.version}</span>
            <span className="flex items-center font-semibold gradient-text">
               {config.appName} by {config.author}
            </span>
         </div>
      </div>
   );
}

export default App;
