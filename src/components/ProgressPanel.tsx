import { openPath } from '@tauri-apps/plugin-opener';
import { Play, Square, FolderOpen, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface ProgressPanelProps {
   isProcessing: boolean;
   totalFiles: number;
   processedFiles: number;
   successCount: number;
   failedCount: number;
   outputDir: string;
   onStart: () => void;
   onCancel: () => void;
   canStart: boolean;
}

export function ProgressPanel({
   isProcessing,
   totalFiles,
   processedFiles,
   successCount,
   failedCount,
   outputDir,
   onStart,
   onCancel,
   canStart,
}: ProgressPanelProps) {
   const progress = totalFiles > 0 ? (processedFiles / totalFiles) * 100 : 0;
   const isDone = !isProcessing && processedFiles > 0 && processedFiles === totalFiles;

   const handleOpenFolder = async () => {
      if (outputDir) {
         try {
            await openPath(outputDir);
         } catch (error) {
            console.error('Failed to open folder:', error);
         }
      }
   };

   return (
      <div className='p-3 space-y-3'>
         {/* Progress Bar */}
         <div className='space-y-1'>
            <div className='flex justify-between text-xs'>
               <span className='text-muted-foreground'>
                  {isProcessing ? 'Processing...' : isDone ? 'Completed' : 'Ready'}
               </span>
               <span className='text-foreground font-medium'>{Math.round(progress)}%</span>
            </div>
            <Progress
               value={progress}
               className='h-1.5'
            />
            {totalFiles > 0 && (
               <p className='text-[10px] text-muted-foreground'>
                  {processedFiles} / {totalFiles} files
               </p>
            )}
         </div>

         {/* Stats - Compact inline */}
         {processedFiles > 0 && (
            <div className='flex gap-3 text-xs'>
               <div className='flex items-center gap-1.5 text-emerald-600'>
                  <CheckCircle2 className='w-3.5 h-3.5' />
                  <span className='font-medium'>{successCount} success</span>
               </div>
               {failedCount > 0 && (
                  <div className='flex items-center gap-1.5 text-red-600'>
                     <XCircle className='w-3.5 h-3.5' />
                     <span className='font-medium'>{failedCount} failed</span>
                  </div>
               )}
            </div>
         )}

         {/* Action Buttons */}
         <div className='flex gap-2'>
            <Button
               onClick={onStart}
               disabled={!canStart || isProcessing}
               size='sm'
               className={cn('flex-1 h-8 text-xs font-medium')}
            >
               {isProcessing ? (
                  <>
                     <Loader2 className='w-3.5 h-3.5 mr-1.5 animate-spin' />
                     Processing...
                  </>
               ) : (
                  <>
                     <Play
                        className='w-3.5 h-3.5 mr-1.5'
                        fill='currentColor'
                     />
                     Convert
                  </>
               )}
            </Button>
            {isProcessing && (
               <Button
                  variant='outline'
                  size='sm'
                  onClick={onCancel}
                  className='h-8 px-2 hover:bg-destructive/10 hover:text-destructive'
               >
                  <Square className='w-3.5 h-3.5' />
               </Button>
            )}
            {isDone && outputDir && (
               <Button
                  variant='outline'
                  size='sm'
                  onClick={handleOpenFolder}
                  className='h-8 px-2'
               >
                  <FolderOpen className='w-3.5 h-3.5' />
               </Button>
            )}
         </div>
      </div>
   );
}
