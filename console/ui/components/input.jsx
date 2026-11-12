// Adapted from official shadcn/ui new-york-v4 registry. See ../PROVENANCE.md.
import { jsx } from "react/jsx-runtime";
import { cn } from "../utils.js";
function Input({ className, type, ...props }) {
  return /* @__PURE__ */ jsx(
    "input",
    {
      type,
      "data-slot": "input",
      className: cn(
        "ui-input-base",
        "ui-input-focus",
        "ui-input-invalid",
        className
      ),
      ...props
    }
  );
}
export {
  Input
};
