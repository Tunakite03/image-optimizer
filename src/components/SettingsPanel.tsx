import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen } from 'lucide-react';
import { OutputFormat, FORMAT_OPTIONS, OperationMode, OPERATION_MODE_OPTIONS, ResizeMode } from '@/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface SettingsPanelProps {
   operationMode: OperationMode;
   onOperationModeChange: (mode: OperationMode) => void;
   outputFormat: OutputFormat;
   onFormatChange: (format: OutputFormat) => void;
   outputDir: string;
   onOutputDirChange: (dir: string) => void;
   overwrite: boolean;
   onOverwriteChange: (overwrite: boolean) => void;
   quality: number;
   onQualityChange: (quality: number) => void;
   resizeMode: ResizeMode;
   onResizeModeChange: (mode: ResizeMode) => void;
   resizePercentage: number;
   onResizePercentageChange: (percentage: number) => void;
   maxWidth: number;
   onMaxWidthChange: (width: number) => void;
   maxHeight: number;
   onMaxHeightChange: (height: number) => void;
   keepAspectRatio: boolean;
   onKeepAspectRatioChange: (keep: boolean) => void;
   files: Array<{ width?: number; height?: number }>;
   disabled?: boolean;
}

export function SettingsPanel({
   operationMode,
   onOperationModeChange,
   outputFormat,
   onFormatChange,
   outputDir,
   onOutputDirChange,
   overwrite,
   onOverwriteChange,
   quality,
   onQualityChange,
   resizeMode,
   onResizeModeChange,
   resizePercentage,
   onResizePercentageChange,
   maxWidth,
   onMaxWidthChange,
   maxHeight,
   onMaxHeightChange,
   keepAspectRatio,
   onKeepAspectRatioChange,
   files,
   disabled = false,
}: SettingsPanelProps) {
   // Calculate max dimensions from loaded files
   const filesWithDims = files.filter((f) => f.width && f.height);
   const maxOriginalWidth = filesWithDims.length > 0 ? Math.max(...filesWithDims.map((f) => f.width!)) : 0;
   const maxOriginalHeight = filesWithDims.length > 0 ? Math.max(...filesWithDims.map((f) => f.height!)) : 0;
   const handleSelectFolder = async () => {
      const selected = await open({
         directory: true,
         multiple: false,
         title: 'Select Output Directory',
      });
      if (selected && typeof selected === 'string') {
         onOutputDirChange(selected);
      }
   };

   return (
      <div className='p-3 space-y-4'>
         {/* Operation Mode */}
         <div className='space-y-1.5'>
            <label className='text-xs font-medium text-foreground'>Operation Mode</label>
            <Select
               value={operationMode}
               onValueChange={(v) => onOperationModeChange(v as OperationMode)}
               disabled={disabled}
            >
               <SelectTrigger className='w-full h-8 text-xs bg-background border hover:border-primary/50'>
                  <SelectValue placeholder='Select operation' />
               </SelectTrigger>
               <SelectContent>
                  {OPERATION_MODE_OPTIONS.map((opt) => (
                     <SelectItem
                        key={opt.value}
                        value={opt.value}
                        className='text-xs cursor-pointer'
                     >
                        <div className='flex flex-col'>
                           <span className=' font-semibold'>{opt.label}</span>
                           <span className='text-[10px] text-muted-foreground'>{opt.description}</span>
                        </div>
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
         </div>

         {/* Output Format - Only for Convert mode */}
         {operationMode === 'convert' && (
            <div className='space-y-1.5'>
               <label className='text-xs font-medium text-foreground'>Format</label>
               <Select
                  value={outputFormat}
                  onValueChange={(v) => onFormatChange(v as OutputFormat)}
                  disabled={disabled}
               >
                  <SelectTrigger className='w-full h-8 text-xs bg-background border hover:border-primary/50'>
                     <SelectValue placeholder='Select format' />
                  </SelectTrigger>
                  <SelectContent>
                     {FORMAT_OPTIONS.map((opt) => (
                        <SelectItem
                           key={opt.value}
                           value={opt.value}
                           className='text-xs cursor-pointer'
                        >
                           <span className='flex items-center gap-2 font-semibold'>
                              <span>{opt.label}</span>
                           </span>
                        </SelectItem>
                     ))}
                  </SelectContent>
               </Select>
               <p className='text-[10px] text-muted-foreground mt-1'>Convert images to a different format</p>
            </div>
         )}

         {/* Output Directory */}
         <div className='space-y-1.5'>
            <label className='text-xs font-medium text-foreground'>Output folder</label>
            <div className='flex gap-1.5'>
               <input
                  type='text'
                  value={outputDir}
                  onChange={(e) => onOutputDirChange(e.target.value)}
                  placeholder={
                     operationMode === 'convert'
                        ? 'Select output folder...'
                        : overwrite
                        ? 'Original folder (auto)'
                        : 'Select folder...'
                  }
                  disabled={disabled || (operationMode !== 'convert' && overwrite)}
                  className={cn(
                     'flex-1 h-8 px-2 text-xs rounded border bg-background',
                     'focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary',
                     'disabled:opacity-50 disabled:cursor-not-allowed',
                     'placeholder:text-muted-foreground/60'
                  )}
               />
               <Button
                  variant='outline'
                  size='sm'
                  onClick={handleSelectFolder}
                  disabled={disabled || (operationMode !== 'convert' && overwrite)}
                  className='h-8 px-2 shrink-0'
               >
                  <FolderOpen className='w-3.5 h-3.5' />
               </Button>
            </div>
            {outputDir && (operationMode === 'convert' || !overwrite) && (
               <p
                  className='text-[10px] text-muted-foreground truncate'
                  title={outputDir}
               >
                  {outputDir}
               </p>
            )}
            {overwrite && operationMode !== 'convert' && (
               <p className='text-[10px] text-muted-foreground'>Files will be overwritten in their original folders</p>
            )}
         </div>

         {/* Overwrite Option - Hidden in Convert mode */}
         {operationMode !== 'convert' && (
            <div className='space-y-1'>
               <div className='flex items-center gap-2'>
                  <Checkbox
                     id='overwrite'
                     checked={overwrite}
                     onCheckedChange={(checked) => onOverwriteChange(checked === true)}
                     disabled={disabled}
                     className='w-4 h-4 data-[state=checked]:bg-primary data-[state=checked]:border-primary'
                  />
                  <label
                     htmlFor='overwrite'
                     className='text-xs cursor-pointer'
                  >
                     Overwrite original files
                  </label>
               </div>
               <p className='text-[10px] text-muted-foreground pl-6'>
                  {overwrite ? 'Replace files in their original location' : 'Save to a different folder with suffix'}
               </p>
            </div>
         )}

         {/* Quality Control for WebP and PNG */}
         {(operationMode === 'optimize' || operationMode === 'optimize_resize' || operationMode === 'all') &&
            (outputFormat === 'webp' || outputFormat === 'png' || outputFormat === 'jpeg') && (
               <div className='space-y-1.5'>
                  <label className='text-xs font-medium text-foreground'>
                     Quality: {quality}% {outputFormat === 'png' && '(PngQuant)'}
                  </label>
                  <input
                     type='range'
                     min='1'
                     max='100'
                     value={quality}
                     onChange={(e) => onQualityChange(Number(e.target.value))}
                     disabled={disabled}
                     className='w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary'
                  />
                  <p className='text-[10px] text-muted-foreground'>
                     {outputFormat === 'png'
                        ? 'Higher quality = more colors (recommended: 85-95)'
                        : outputFormat === 'jpeg'
                        ? 'Higher quality = less compression (recommended: 80-90)'
                        : 'Lower quality = smaller file size'}
                  </p>
               </div>
            )}

         {/* Resize Options */}
         {(operationMode === 'resize' || operationMode === 'optimize_resize' || operationMode === 'all') && (
            <div className='space-y-3'>
               {/* Resize Mode Selection */}
               <div className='space-y-1.5'>
                  <label className='text-xs font-medium text-foreground'>Resize Mode</label>
                  <Select
                     value={resizeMode}
                     onValueChange={(v) => onResizeModeChange(v as ResizeMode)}
                     disabled={disabled}
                  >
                     <SelectTrigger className='w-full h-8 text-xs bg-background border hover:border-primary/50'>
                        <SelectValue placeholder='Select resize mode' />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem
                           value='percentage'
                           className='text-xs cursor-pointer'
                        >
                           <div className='flex flex-col'>
                              <span className='font-semibold'>By Percentage</span>
                              <span className='text-[10px] text-muted-foreground'>Resize to % of original size</span>
                           </div>
                        </SelectItem>
                        <SelectItem
                           value='dimensions'
                           className='text-xs cursor-pointer'
                        >
                           <div className='flex flex-col'>
                              <span className='font-semibold'>Custom Dimensions</span>
                              <span className='text-[10px] text-muted-foreground'>Set specific width/height</span>
                           </div>
                        </SelectItem>
                     </SelectContent>
                  </Select>
               </div>

               {/* Percentage Mode */}
               {resizeMode === 'percentage' && (
                  <div className='space-y-1.5'>
                     <div className='flex items-center justify-between'>
                        <label className='text-xs font-medium text-foreground'>Resize to: {resizePercentage}%</label>
                        <div className='flex gap-1'>
                           <button
                              onClick={() => onResizePercentageChange(75)}
                              disabled={disabled}
                              className={cn(
                                 'px-2 py-0.5 text-[10px] rounded border transition-colors',
                                 resizePercentage === 75
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-background hover:bg-accent hover:text-accent-foreground',
                                 'disabled:opacity-50 disabled:cursor-not-allowed'
                              )}
                           >
                              75%
                           </button>
                           <button
                              onClick={() => onResizePercentageChange(50)}
                              disabled={disabled}
                              className={cn(
                                 'px-2 py-0.5 text-[10px] rounded border transition-colors',
                                 resizePercentage === 50
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-background hover:bg-accent hover:text-accent-foreground',
                                 'disabled:opacity-50 disabled:cursor-not-allowed'
                              )}
                           >
                              50%
                           </button>
                           <button
                              onClick={() => onResizePercentageChange(25)}
                              disabled={disabled}
                              className={cn(
                                 'px-2 py-0.5 text-[10px] rounded border transition-colors',
                                 resizePercentage === 25
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-background hover:bg-accent hover:text-accent-foreground',
                                 'disabled:opacity-50 disabled:cursor-not-allowed'
                              )}
                           >
                              25%
                           </button>
                        </div>
                     </div>
                     <input
                        type='range'
                        min='1'
                        max='100'
                        value={resizePercentage}
                        onChange={(e) => onResizePercentageChange(Number(e.target.value))}
                        disabled={disabled}
                        className='w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary'
                     />
                     <input
                        type='number'
                        min='1'
                        max='100'
                        value={resizePercentage}
                        onChange={(e) => onResizePercentageChange(Number(e.target.value) || 1)}
                        disabled={disabled}
                        className={cn(
                           'w-full h-8 px-2 text-xs rounded border bg-background',
                           'focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary',
                           'disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                     />
                     <p className='text-[10px] text-muted-foreground'>
                        Images will be resized to {resizePercentage}% of their original dimensions
                     </p>
                  </div>
               )}

               {/* Custom Dimensions Mode */}
               {resizeMode === 'dimensions' && (
                  <div className='space-y-1.5'>
                     <div className='flex items-center justify-between'>
                        <label className='text-xs font-medium text-foreground'>Target Dimensions</label>
                        {filesWithDims.length > 0 && (
                           <button
                              onClick={() => {
                                 onMaxWidthChange(maxOriginalWidth);
                                 onMaxHeightChange(maxOriginalHeight);
                              }}
                              disabled={disabled}
                              className='text-[10px] text-primary hover:text-primary/80 disabled:opacity-50 disabled:cursor-not-allowed underline'
                           >
                              Use max: {maxOriginalWidth} × {maxOriginalHeight}
                           </button>
                        )}
                     </div>
                     <div className='flex gap-2'>
                        <div className='flex-1'>
                           <input
                              type='number'
                              value={maxWidth || ''}
                              onChange={(e) => onMaxWidthChange(Number(e.target.value) || 0)}
                              placeholder='Max width'
                              disabled={disabled}
                              className={cn(
                                 'w-full h-8 px-2 text-xs rounded border bg-background',
                                 'focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary',
                                 'disabled:opacity-50 disabled:cursor-not-allowed',
                                 'placeholder:text-muted-foreground/60'
                              )}
                           />
                        </div>
                        <div className='flex-1'>
                           <input
                              type='number'
                              value={maxHeight || ''}
                              onChange={(e) => onMaxHeightChange(Number(e.target.value) || 0)}
                              placeholder='Max height'
                              disabled={disabled}
                              className={cn(
                                 'w-full h-8 px-2 text-xs rounded border bg-background',
                                 'focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary',
                                 'disabled:opacity-50 disabled:cursor-not-allowed',
                                 'placeholder:text-muted-foreground/60'
                              )}
                           />
                        </div>
                     </div>
                     <div className='space-y-1 pt-1'>
                        <div className='flex items-center gap-2'>
                           <Checkbox
                              id='aspectRatio'
                              checked={keepAspectRatio}
                              onCheckedChange={(checked) => onKeepAspectRatioChange(checked === true)}
                              disabled={disabled}
                              className='w-3.5 h-3.5 data-[state=checked]:bg-primary data-[state=checked]:border-primary'
                           />
                           <label
                              htmlFor='aspectRatio'
                              className='text-[10px] text-muted-foreground cursor-pointer'
                           >
                              Keep aspect ratio
                           </label>
                        </div>
                        <p className='text-[10px] font-semibold leading-relaxed text-red-700'>
                           {filesWithDims.length > 1
                              ? 'Images larger than target will be resized down. Smaller images keep original size. !!!'
                              : 'Maximum dimensions. Image will be resized if larger.'}
                        </p>
                     </div>
                  </div>
               )}
            </div>
         )}
      </div>
   );
}
