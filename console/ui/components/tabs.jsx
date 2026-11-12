// Adapted from official shadcn/ui new-york-v4 registry. See ../PROVENANCE.md.
"use client";
import { jsx } from "react/jsx-runtime";
import { cva } from "class-variance-authority";
import { cn } from "../utils.js";
import { Tabs as TabsPrimitive } from "radix-ui";
function Tabs({
  className,
  orientation = "horizontal",
  ...props
}) {
  return /* @__PURE__ */ jsx(
    TabsPrimitive.Root,
    {
      "data-slot": "tabs",
      "data-orientation": orientation,
      orientation,
      className: cn(
        "ui-tabs-root",
        className
      ),
      ...props
    }
  );
}
const tabsListVariants = cva(
  "ui-tabs-list",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "ui-tabs-line"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);
function TabsList({
  className,
  variant = "default",
  ...props
}) {
  return /* @__PURE__ */ jsx(
    TabsPrimitive.List,
    {
      "data-slot": "tabs-list",
      "data-variant": variant,
      className: cn(tabsListVariants({ variant }), className),
      ...props
    }
  );
}
function TabsTrigger({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    TabsPrimitive.Trigger,
    {
      "data-slot": "tabs-trigger",
      className: cn(
        "ui-tabs-trigger",
        "ui-tabs-trigger-active",
        "ui-tabs-trigger-line",
        "ui-tabs-trigger-focus",
        className
      ),
      ...props
    }
  );
}
function TabsContent({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    TabsPrimitive.Content,
    {
      "data-slot": "tabs-content",
      className: cn("ui-tabs-content", className),
      ...props
    }
  );
}
export {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  tabsListVariants
};
