const menuSelector = "ul.bpx-player-contextmenu";
const entrySelector = "li[data-action='biliCdnSettings']";

export function installContextMenuEntry(openPanel: () => void): void {
  function attach(menu: HTMLUListElement): void {
    if (menu.querySelector(entrySelector)) return;

    const entry = document.createElement("li");
    entry.dataset.action = "biliCdnSettings";
    entry.textContent = "CDN 节点设置";
    entry.tabIndex = 0;
    entry.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPanel();
    });
    entry.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        entry.click();
      }
    });

    const info = menu.querySelector("li[data-action='info']");
    if (info) info.after(entry);
    else menu.append(entry);
  }

  function attachExisting(): void {
    document.querySelectorAll<HTMLUListElement>(menuSelector).forEach(attach);
  }

  function start(): void {
    attachExisting();
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.target instanceof Element) {
          const menu = record.target.closest<HTMLUListElement>(menuSelector);
          if (menu) attach(menu);
        }
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches(menuSelector)) attach(node as HTMLUListElement);
          node.querySelectorAll<HTMLUListElement>(menuSelector).forEach(attach);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.documentElement) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}
