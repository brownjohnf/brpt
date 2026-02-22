import { useEffect, useState, type RefObject } from "react";

function headingLevel(el: Element): number {
  return parseInt(el.tagName[1], 10);
}

export function useCurrentHeading(
  scrollRef: RefObject<HTMLDivElement | null>,
  contentKey: string | undefined,
): string[] {
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || contentKey === undefined) {
      setBreadcrumbs([]);
      return;
    }

    let rafId = 0;

    function computeHeading(): void {
      const el = scrollRef.current;
      if (!el) {
        return;
      }

      const headings = el.querySelectorAll(".markdown-body :is(h1, h2, h3)");
      const containerTop = el.getBoundingClientRect().top;

      const stack: (string | null)[] = [null, null, null];

      // Seed with the first heading so scrolled-to-top still shows a title
      if (headings.length > 0) {
        const first = headings[0];
        const firstIndex = headingLevel(first) - 1;
        stack[firstIndex] = first.textContent;
      }

      for (const h of headings) {
        const rect = h.getBoundingClientRect();
        if (rect.top > containerTop) {
          break;
        }

        const level = headingLevel(h);
        const index = level - 1;
        stack[index] = h.textContent;

        // Clear all levels below this one
        for (let i = index + 1; i < stack.length; i++) {
          stack[i] = null;
        }
      }

      const result = stack.filter((s): s is string => s !== null);
      setBreadcrumbs(result);
    }

    function onScroll(): void {
      if (rafId) {
        return;
      }
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        computeHeading();
      });
    }

    // Compute immediately for tab switches and file updates.
    // Use rAF to ensure the DOM has been painted with the new content.
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      computeHeading();
    });

    container.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", onScroll);
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [scrollRef, contentKey]);

  return breadcrumbs;
}
