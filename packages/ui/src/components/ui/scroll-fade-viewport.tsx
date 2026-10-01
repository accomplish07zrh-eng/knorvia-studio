// SPDX-License-Identifier: Apache-2.0
// Source-exposed B5 replacement candidate; inherited presentation contract retained.
import { useEffect, useImperativeHandle, useRef, useState, type ComponentProps } from "react";
import { cn } from "@/components/lib/utils.js";
import { ScrollFadeController, type ScrollFadeEdges } from "./scroll-fade-controller.js";

const fades: Record<ScrollFadeEdges, string> = {
  none: "",
  top: "[mask-image:linear-gradient(to_bottom,transparent_0,black_24px,black_100%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0,black_24px,black_100%)]",
  bottom:
    "[mask-image:linear-gradient(to_bottom,black_0,black_calc(100%_-_24px),transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0,black_calc(100%_-_24px),transparent_100%)]",
  both: "[mask-image:linear-gradient(to_bottom,transparent_0,black_24px,black_calc(100%_-_24px),transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0,black_24px,black_calc(100%_-_24px),transparent_100%)]",
};

export function ScrollFadeViewport({
  children,
  className,
  ref,
  ...attributes
}: ComponentProps<"div">) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [edges, publish] = useState<ScrollFadeEdges>("none");
  useImperativeHandle(ref, () => viewport.current!, []);

  useEffect(() => {
    if (!viewport.current || !content.current) {
      publish("none");
      return;
    }
    const controller = new ScrollFadeController(viewport.current, content.current, publish);
    controller.start();
    return () => controller.stop();
  }, [children]);

  return (
    <div
      ref={viewport}
      data-scroll-mask={edges}
      className={cn("min-h-0 flex-1 overflow-y-auto", fades[edges], className)}
      {...attributes}
    >
      <div ref={content}>{children}</div>
    </div>
  );
}
