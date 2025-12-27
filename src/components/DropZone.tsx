import { useCallback, useState } from 'react';
import { Upload, X, FileImage, AlertCircle, CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { stat } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { TrackedFile, SUPPORTED_EXTENSIONS, FileStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DropZoneProps {
   files: TrackedFile[];
   onFilesAdded: (files: TrackedFile[]) => void;
   onFileRemove: (id: string) => void;
   onClearAll: () => void;
   disabled?: boolean;
}

function formatFileSize(bytes: number): string {
   if (bytes === 0) return '0 B';
   const k = 1024;
   const sizes = ['B', 'KB', 'MB', 'GB'];
   const i = Math.floor(Math.log(bytes) / Math.log(k));
   return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function isValidImageFile(filename: string): boolean {
   const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
   return SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number]);
}

function generateId(): string {
   return Math.random().toString(36).substring(2, 11);
}

function getStatusIcon(status: FileStatus) {
   switch (status) {
      case 'pending':
         return <FileImage className='w-4 h-4 text-muted-foreground' />;
      case 'processing':
         return <Loader2 className='w-4 h-4 text-primary animate-spin' />;
      case 'success':
         return <CheckCircle2 className='w-4 h-4 text-emerald-600' />;
      case 'failed':
         return <AlertCircle className='w-4 h-4 text-red-600' />;
   }
}

function getStatusText(status: FileStatus, originalSize?: number, outputSize?: number) {
   switch (status) {
      case 'pending':
         return null;
      case 'processing':
         return <span className='text-[10px] text-primary font-medium'>Converting...</span>;
      case 'success':
         if (originalSize && outputSize) {
            const reduction = (((originalSize - outputSize) / originalSize) * 100).toFixed(1);
            const isReduced = originalSize > outputSize;
            return (
               <span className='text-[10px] text-emerald-600 font-medium'>{isReduced ? `-${reduction}%` : 'Done'}</span>
            );
         }
         return <span className='text-[10px] text-emerald-600 font-medium'>Done</span>;
      case 'failed':
         return <span className='text-[10px] text-red-600 font-medium'>Failed</span>;
   }
}

export function DropZone({ files, onFilesAdded, onFileRemove, onClearAll, disabled = false }: DropZoneProps) {
   const [isDragging, setIsDragging] = useState(false);

   const handleDrop = useCallback(
      async (e: React.DragEvent<HTMLDivElement>) => {
         e.preventDefault();
         e.stopPropagation();
         setIsDragging(false);

         if (disabled) return;

         const droppedFiles = Array.from(e.dataTransfer.files);
         const trackedFiles: TrackedFile[] = [];

         for (const file of droppedFiles) {
            if (isValidImageFile(file.name)) {
               // In Tauri desktop, file.path should be available
               const path = (file as any).path || file.name;

               try {
                  const fileInfo = await stat(path);
                  let dimensions = undefined;
                  try {
                     dimensions = await invoke<{ width: number; height: number }>('get_image_dimensions', { path });
                  } catch (e) {
                     console.error('Failed to get dimensions:', e);
                  }

                  trackedFiles.push({
                     id: generateId(),
                     name: file.name,
                     path: path,
                     size: fileInfo.size,
                     width: dimensions?.width,
                     height: dimensions?.height,
                     status: 'pending' as FileStatus,
                  });
               } catch (e) {
                  // Fallback if stat fails
                  trackedFiles.push({
                     id: generateId(),
                     name: file.name,
                     path: path,
                     size: file.size,
                     status: 'pending' as FileStatus,
                  });
               }
            }
         }

         if (trackedFiles.length > 0) {
            onFilesAdded(trackedFiles);
         }
      },
      [disabled, onFilesAdded]
   );

   const handleDragOver = useCallback(
      (e: React.DragEvent<HTMLDivElement>) => {
         e.preventDefault();
         e.stopPropagation();
         if (!disabled) {
            setIsDragging(true);
         }
      },
      [disabled]
   );

   const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
   }, []);

   const handleFileInput = useCallback(async () => {
      if (disabled) return;

      const selected = await open({
         multiple: true,
         filters: [
            {
               name: 'Images',
               extensions: ['png', 'jpg', 'jpeg', 'webp', 'tiff', 'tif', 'bmp', 'qoi', 'gif'],
            },
         ],
      });

      if (!selected) return;

      const paths = Array.isArray(selected) ? selected : [selected];
      const trackedFiles: TrackedFile[] = [];

      for (const path of paths) {
         try {
            const fileInfo = await stat(path);
            const name = path.split(/[\\/]/).pop() || path;

            let dimensions = undefined;
            try {
               dimensions = await invoke<{ width: number; height: number }>('get_image_dimensions', { path });
            } catch (e) {
               console.error('Failed to get dimensions:', e);
            }

            trackedFiles.push({
               id: generateId(),
               name,
               path,
               size: fileInfo.size,
               width: dimensions?.width,
               height: dimensions?.height,
               status: 'pending' as FileStatus,
            });
         } catch (e) {
            console.error('Failed to stat file:', path, e);
         }
      }

      if (trackedFiles.length > 0) {
         onFilesAdded(trackedFiles);
      }
   }, [disabled, onFilesAdded]);

   const totalSize = files.reduce((acc, f) => acc + f.size, 0);

   return (
      <div className='h-full flex flex-col'>
         {/* Drop Zone Area - Compact */}
         {files.length === 0 ? (
            <div
               onDrop={handleDrop}
               onDragOver={handleDragOver}
               onDragLeave={handleDragLeave}
               onClick={handleFileInput}
               className={cn(
                  'flex-1 flex flex-col items-center justify-center cursor-pointer border-2 border-dashed m-3 rounded transition-colors',
                  isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
                  disabled && 'opacity-50 cursor-not-allowed'
               )}
            >
               <Upload className={cn('w-10 h-10 mb-3', isDragging ? 'text-primary' : 'text-muted-foreground')} />
               <p className='text-sm font-medium text-foreground'>
                  {isDragging ? 'Drop files here' : 'Drop images or click to browse'}
               </p>
               <p className='text-xs text-muted-foreground mt-1'>PNG, JPG, WebP, TIFF, BMP, QOI, GIF</p>
            </div>
         ) : (
            <>
               {/* Small drop zone when files exist */}
               <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={handleFileInput}
                  className={cn(
                     'h-14 mx-3 mt-3 flex items-center justify-center cursor-pointer border border-dashed rounded transition-colors shrink-0',
                     isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
                     disabled && 'opacity-50 cursor-not-allowed'
                  )}
               >
                  <Upload className='w-4 h-4 mr-2 text-muted-foreground' />
                  <span className='text-xs text-muted-foreground'>Add more files</span>
               </div>

               {/* File List Header */}
               <div className='h-8 mx-3 mt-2 flex items-center px-2 bg-muted/50 rounded-t border border-b-0 border-border'>
                  <span className='w-6 shrink-0'></span>
                  <span className='flex-1 min-w-0 px-2 text-xs text-muted-foreground'>Name</span>
                  <span className='w-20  text-xs text-muted-foreground shrink-0 text-center'>Size</span>
                  <span className='w-20  text-xs text-muted-foreground shrink-0 text-center'>Status</span>
                  <div className='w-16 flex items-center justify-center shrink-0'>
                     <Button
                        variant='ghost'
                        size='sm'
                        onClick={onClearAll}
                        disabled={disabled}
                        className='h-6 px-2 text-xs text-muted-foreground hover:text-destructive'
                     >
                        <Trash2 className='w-3 h-3' />
                        Clear
                     </Button>
                  </div>
               </div>

               {/* File List - Table Style */}
               <div className='flex-1 mx-3 mb-3 overflow-y-auto border border-border rounded-b bg-background'>
                  {files.map((file, index) => (
                     <div
                        key={file.id}
                        className={cn(
                           ' flex items-center px-2 text-xs group hover:bg-accent/50 transition-colors',
                           index !== files.length - 1 && 'border-b border-border',
                           file.status === 'failed' && 'bg-red-50 dark:bg-red-950/20',
                           file.status === 'success' && 'bg-emerald-50/50 dark:bg-emerald-950/10'
                        )}
                     >
                        <div className='w-6 flex items-center justify-center shrink-0'>
                           {getStatusIcon(file.status)}
                        </div>
                        <div className='flex-1 min-w-0 px-2 py-1'>
                           <div className='truncate block'>{file.name}</div>
                           {file.status === 'success' && file.outputSize && (
                              <div className='text-[10px] text-muted-foreground mt-0.5'>
                                 {formatFileSize(file.size)} → {formatFileSize(file.outputSize)}
                              </div>
                           )}
                        </div>
                        <div className='w-20  text-muted-foreground shrink-0 text-center'>
                           {formatFileSize(file.size)}
                        </div>
                        <div className='w-20  shrink-0 text-center'>
                           {getStatusText(file.status, file.size, file.outputSize)}
                        </div>
                        <div className='w-16 flex items-center justify-center shrink-0'>
                           <button
                              onClick={() => onFileRemove(file.id)}
                              disabled={disabled || file.status === 'processing'}
                              className='opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-opacity disabled:opacity-0'
                           >
                              <X className='w-3.5 h-3.5' />
                           </button>
                        </div>
                     </div>
                  ))}
               </div>

               {/* Footer Stats */}
               <div className='h-7 mx-3 mb-3 px-3 flex items-center justify-between bg-muted/30 rounded border border-border text-xs text-muted-foreground shrink-0'>
                  <span>{files.length} files selected</span>
                  <span>Total: {formatFileSize(totalSize)}</span>
               </div>
            </>
         )}
      </div>
   );
}
