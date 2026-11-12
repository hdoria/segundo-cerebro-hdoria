// Adapted from official shadcn/ui new-york-v4 registry. See ../PROVENANCE.md.
import { jsx, jsxs } from "react/jsx-runtime";
import { cn } from "../utils.js";
import { ChevronDownIcon } from "lucide-react";
function NativeSelect({
  className,
  size = "default",
  ...props
}) {
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: "ui-native-select-wrapper",
      "data-slot": "native-select-wrapper",
      children: [
        /* @__PURE__ */ jsx(
          "select",
          {
            "data-slot": "native-select",
            "data-size": size,
            className: cn(
              "ui-native-select-base",
              "ui-native-select-focus",
              "ui-native-select-invalid",
              className
            ),
            ...props
          }
        ),
        /* @__PURE__ */ jsx(
          ChevronDownIcon,
          {
            className: "ui-native-select-icon",
            "aria-hidden": "true",
            "data-slot": "native-select-icon"
          }
        )
      ]
    }
  );
}
function NativeSelectOption({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "option",
    {
      "data-slot": "native-select-option",
      className: cn("ui-native-select-option", className),
      ...props
    }
  );
}
function NativeSelectOptGroup({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "optgroup",
    {
      "data-slot": "native-select-optgroup",
      className: cn("ui-native-select-optgroup", className),
      ...props
    }
  );
}
export {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption
};
