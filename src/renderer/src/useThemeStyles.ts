import { useEffect } from "react";

import darkMdCss from "github-markdown-css/github-markdown-dark.css?raw";
import lightMdCss from "github-markdown-css/github-markdown-light.css?raw";
import darkHljsCss from "highlight.js/styles/github-dark.css?raw";
import lightHljsCss from "highlight.js/styles/github.css?raw";

function createStyle(id: string, css: string): HTMLStyleElement {
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }
  return style;
}

export function useThemeStyles(theme: "light" | "dark"): void {
  useEffect(() => {
    const lightMd = createStyle("markdown-theme-light", lightMdCss);
    const darkMd = createStyle("markdown-theme-dark", darkMdCss);
    const lightHljs = createStyle("hljs-theme-light", lightHljsCss);
    const darkHljs = createStyle("hljs-theme-dark", darkHljsCss);

    if (theme === "dark") {
      lightMd.disabled = true;
      darkMd.disabled = false;
      lightHljs.disabled = true;
      darkHljs.disabled = false;
    } else {
      lightMd.disabled = false;
      darkMd.disabled = true;
      lightHljs.disabled = false;
      darkHljs.disabled = true;
    }
  }, [theme]);
}
