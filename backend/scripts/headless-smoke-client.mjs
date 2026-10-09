import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function openSmokeBrowser(origin, cookie) {
  const folder = await mkdtemp(join(tmpdir(), "reconciliation-smoke-"));
  const browser = spawn(process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=9334", "--user-data-dir=" + join(folder, "profile"), "about:blank",
  ], { windowsHide: true, stdio: "ignore" });
  let socket;
  const pending = new Map();
  const errors = [];
  let sequence = 0;
  try {
    let tabs;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try { tabs = await (await fetch("http://127.0.0.1:9334/json")).json(); break; } catch { await pause(150); }
    }
    assert(tabs, "Chrome did not start");
    socket = new WebSocket(tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    socket.onmessage = (message) => {
      const response = JSON.parse(message.data);
      if (response.id) {
        const item = pending.get(response.id);
        if (!item) return;
        clearTimeout(item.timer); pending.delete(response.id);
        if (response.error) item.reject(new Error(response.error.message)); else item.resolve(response.result);
      }
      if (response.method === "Runtime.exceptionThrown") errors.push(response.params.exceptionDetails.text);
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("CDP timeout: " + method)); }, 12000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
    const waitFor = async (expression) => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (await evaluate("Boolean(" + expression + ")")) return;
        await pause(100);
      }
      throw new Error("UI timeout: " + expression);
    };
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    const separator = cookie.indexOf("=");
    await send("Network.setCookie", { name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: origin, httpOnly: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    return {
      send, evaluate, waitFor, errors,
      input: async (selector, value) => evaluate("(() => { const el = document.querySelector(" + JSON.stringify(selector) + ");"
        + "const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;"
        + "Object.getOwnPropertyDescriptor(proto, 'value').set.call(el," + JSON.stringify(value) + ");"
        + "el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); })()"),
      click: async (selector) => evaluate("document.querySelector(" + JSON.stringify(selector) + ").click()"),
      navigate: async (path) => send("Page.navigate", { url: origin + path }),
      screenshot: async (name, width, height) => {
        await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 500 });
        await pause(150);
        assert(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Horizontal overflow");
        const { cssContentSize } = await send("Page.getLayoutMetrics");
        const { data } = await send("Page.captureScreenshot", {
          format: "png", captureBeyondViewport: true,
          clip: { x: 0, y: 0, width, height: cssContentSize.height, scale: 1 },
        });
        const path = join(folder, name);
        await writeFile(path, Buffer.from(data, "base64"));
        console.log("Screenshot: " + path);
      },
      close: async () => { try { await send("Browser.close"); } catch { browser.kill(); } socket.close(); },
    };
  } catch (error) { socket?.close(); browser.kill(); throw error; }
}
