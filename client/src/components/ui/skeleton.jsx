import { cn } from "cn"

function Skeleton({
  className,
  ...props
}) {
  return (
    // span + block so it is valid inside labels and paragraphs; project rule wants shimmer, not pulse.
    <span
      aria-hidden="true"
      data-slot="skeleton"
      className={cn("skeleton block rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
