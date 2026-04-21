import { cn } from "../../utils/cn";

interface ProgressBarProps {
  progress: number; // 0 to 100
  colorClass?: string;
  className?: string;
  heightClass?: string;
}

export function ProgressBar({ 
  progress, 
  colorClass = "bg-blue-500", 
  className,
  heightClass = "h-3"
}: ProgressBarProps) {
  const safeProgress = Math.min(Math.max(progress, 0), 100);
  
  return (
    <div className={cn("w-full bg-slate-100 rounded-full overflow-hidden", heightClass, className)}>
      <div 
        className={cn("h-full rounded-full transition-all duration-500 ease-out", colorClass)}
        style={{ width: `${safeProgress}%` }}
      />
    </div>
  );
}
