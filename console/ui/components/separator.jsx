// Adapted from official shadcn/ui new-york-v4 registry. See ../PROVENANCE.md.
"use client";
import { jsx } from "react/jsx-runtime";
import { cn } from "../utils.js";
import { Separator as SeparatorPrimitive } from "radix-ui";
function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    SeparatorPrimitive.Root,
    {
      "data-slot": "separator",
      decorative,
      orientation,
      className: cn(
        "ui-separator-base",
        className
      ),
      ...props
    }
  );
}
export {
  Separator
};
