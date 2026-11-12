// Adapted from official shadcn/ui new-york-v4 registry. See ../PROVENANCE.md.
"use client";
import { jsx } from "react/jsx-runtime";
import { cn } from "../utils.js";
import { Label as LabelPrimitive } from "radix-ui";
function Label({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    LabelPrimitive.Root,
    {
      "data-slot": "label",
      className: cn(
        "ui-label-base",
        className
      ),
      ...props
    }
  );
}
export {
  Label
};
