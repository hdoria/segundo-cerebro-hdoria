// Adapted from official shadcn/ui new-york-v4 registry. See ../PROVENANCE.md.
"use client";
import { jsx } from "react/jsx-runtime";
import { cn } from "../utils.js";
import { CheckIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
function Checkbox({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    CheckboxPrimitive.Root,
    {
      "data-slot": "checkbox",
      className: cn(
        "ui-checkbox-base",
        className
      ),
      ...props,
      children: /* @__PURE__ */ jsx(
        CheckboxPrimitive.Indicator,
        {
          "data-slot": "checkbox-indicator",
          className: "ui-checkbox-indicator",
          children: /* @__PURE__ */ jsx(CheckIcon, { className: "ui-check-icon" })
        }
      )
    }
  );
}
export {
  Checkbox
};
