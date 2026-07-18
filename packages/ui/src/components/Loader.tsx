import * as React from "react"
import { Loader2 } from "lucide-react"
import { cn } from "../lib/utils"

export interface LoaderProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string
}

const Loader = React.forwardRef<SVGSVGElement, LoaderProps>(
  ({ className, size = 24, ...props }, ref) => {
    return (
      <Loader2
        ref={ref}
        size={size}
        className={cn("animate-spin text-muted-foreground", className)}
        {...props}
      />
    )
  }
)
Loader.displayName = "Loader"

export { Loader }
