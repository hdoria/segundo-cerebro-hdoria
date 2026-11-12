// Adapted from official shadcn/ui new-york-v4 registry. See ../PROVENANCE.md.
import { jsx } from "react/jsx-runtime";
import { cn } from "../utils.js";
function Textarea({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "textarea",
    {
      "data-slot": "textarea",
      className: cn(
        "ui-textarea-base",
        className
      ),
      ...props
    }
  );
}
export {
  Textarea
};
