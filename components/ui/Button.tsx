import { forwardRef } from "react";
import { cn } from "../../utils/cn";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-xl font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
          {
            "bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-500": variant === "primary",
            "bg-teal-400 text-slate-900 hover:bg-teal-500 focus:ring-teal-400": variant === "secondary",
            "border-2 border-slate-200 bg-transparent hover:bg-slate-100 focus:ring-slate-200": variant === "outline",
            "bg-transparent hover:bg-slate-100 focus:ring-slate-200": variant === "ghost",
            "bg-red-500 text-white hover:bg-red-600 focus:ring-red-500": variant === "danger",
            "h-9 px-4 text-sm": size === "sm",
            "h-12 px-6 text-base": size === "md",
            "h-14 px-8 text-lg": size === "lg",
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
