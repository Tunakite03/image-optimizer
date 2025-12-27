import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function TitleBar() {
   const handleMinimize = async () => {
      const appWindow = getCurrentWindow();
      await appWindow.minimize();
   };

   const handleMaximize = async () => {
      const appWindow = getCurrentWindow();
      await appWindow.toggleMaximize();
   };

   const handleClose = async () => {
      try {
         const appWindow = getCurrentWindow();
         await appWindow.close();
      } catch (error) {
         console.error('Failed to close window:', error);
      }
   };

   return (
      <div
         data-tauri-drag-region
         className='h-8 bg-background border-b border-border flex items-center justify-between select-none shrink-0'
      >
         {/* App Icon & Title */}
         <div
            data-tauri-drag-region
            className='flex items-center gap-2 px-3 h-full'
         >
            <div className='w-4 h-4 rounded bg-primary/90 flex items-center justify-center'>
               <ImageIcon className='w-2.5 h-2.5 text-white' />
            </div>
            <span
               data-tauri-drag-region
               className='text-xs font-medium text-foreground/80'
            >
               Bulk Image Optimizer
            </span>
         </div>

         {/* Window Controls */}
         <div className='flex h-full'>
            <WindowButton
               onClick={handleMinimize}
               aria-label='Minimize'
            >
               <Minus className='w-3.5 h-3.5' />
            </WindowButton>
            <WindowButton
               onClick={handleMaximize}
               aria-label='Maximize'
            >
               <Square className='w-3 h-3' />
            </WindowButton>
            <WindowButton
               onClick={handleClose}
               variant='close'
               aria-label='Close'
            >
               <X className='w-4 h-4' />
            </WindowButton>
         </div>
      </div>
   );
}

function WindowButton({
   children,
   onClick,
   variant = 'default',
   ...props
}: {
   children: React.ReactNode;
   onClick: () => void;
   variant?: 'default' | 'close';
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
   return (
      <button
         onClick={onClick}
         type='button'
         style={{ WebkitAppRegion: 'no-drag' } as any}
         className={cn(
            'w-11 h-full flex items-center justify-center transition-colors cursor-pointer',
            'text-foreground/60 hover:text-foreground',
            variant === 'default' && 'hover:bg-accent',
            variant === 'close' && 'hover:bg-red-500 hover:text-white'
         )}
         {...props}
      >
         {children}
      </button>
   );
}
