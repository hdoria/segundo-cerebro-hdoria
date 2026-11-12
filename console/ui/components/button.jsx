// Adapted from official shadcn/ui new-york-v4 registry. See ../PROVENANCE.md.
import { jsx } from "react/jsx-runtime";
import { cva } from "class-variance-authority";
import { cn } from "../utils.js";
import { Slot } from "radix-ui";
const buttonVariants = cva(
  "ui-button-base",
  {
    variants: {
      variant: {
        default: "ui-button-primary",
        destructive: "ui-button-destructive",
        outline: "ui-button-outline",
        secondary: "ui-button-secondary",
        ghost: "ui-button-ghost",
        link: "ui-button-link"
      },
      size: {
        default: "ui-button-size-default",
        xs: "ui-button-size-xs",
        sm: "ui-button-size-sm",
        lg: "ui-button-size-lg",
        icon: "ui-icon-default",
        "icon-xs": "ui-button-icon-xs",
        "icon-sm": "ui-icon-small",
        "icon-lg": "ui-icon-large"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot.Root : "button";
  return /* @__PURE__ */ jsx(
    Comp,
    {
      "data-slot": "button",
      "data-variant": variant,
      "data-size": size,
      className: cn(buttonVariants({ variant, size, className })),
      ...props
    }
  );
}
export {
  Button,
  buttonVariants
};
