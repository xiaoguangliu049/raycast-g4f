import { Storage } from "../api/storage.js";

import { Clipboard, showToast, Toast } from "@raycast/api";
import { getBrowserTab } from "./browser.jsx";
import { execShellNoStream } from "#root/src/api/shell.js";

export class CustomCommand {
  constructor({ name = "", prompt = "", id = Date.now().toString(), options = {} }) {
    this.name = name;
    this.prompt = prompt;
    this.id = id;
    this.options = options;
  }

  async processPrompt(prompt, query, selected) {
    this.input = query ? query : selected ? selected : "";

    // const regex = /{([^}]*)}/; // left-to-right, legacy matching method
    const regex = /\{([^{}]*)}/; // depth-first matching method; inner placeholders are processed first
    let match;

    while ((match = regex.exec(prompt))) {
      const placeholder = match[1];
      const processed_placeholder = await this.process_placeholder(placeholder);
      prompt = prompt.replace(`{${placeholder}}`, processed_placeholder);
    }
    return prompt;
  }

  // returns a function that can be passed to the processPrompt parameter of useGPT
  processPromptFunction() {
    // Note that for custom commands, context is always null, and useSelected is always true.
    // Hence, only one of query or selected will be non-null.
    return async ({ query, selected }) => await this.processPrompt(this.prompt, query, selected);
  }

  // Dynamic placeholders
  async process_placeholder(t) {
    // split using |
    const parts = t.split("|");
    const main = parts[0].trim();
    let processed;

    try {
      switch (main) {
        case "input" || "selection":
          processed = this.input;
          break;
        case "clipboard":
          processed = (await Clipboard.read()).text;
          break;
        case "date":
          // e.g. 1 June 2022
          processed = new Date().toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" });
          break;
        case "time":
          // e.g. 6:45 pm
          processed = new Date().toLocaleTimeString([], { hour: "numeric", minute: "numeric" });
          break;
        case "datetime":
          // e.g. 1 June 2022 at 6:45 pm
          processed = `${new Date().toLocaleDateString([], {
            year: "numeric",
            month: "long",
            day: "numeric",
          })} at ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "numeric" })}`;
          break;
        case "day":
          // e.g. Monday
          processed = new Date().toLocaleDateString([], { weekday: "long" });
          break;
        case "browser-tab":
          processed = await getBrowserTab();
          break;
        case "shell": {
          const toast = await showToast(Toast.Style.Animated, "Running shell command");

          const command = parts.slice(1).join("|").trim();
          processed = await execShellNoStream(command);
          console.log(command + "\n" + processed);

          await toast.hide();
          break;
        }
        default:
          processed = t;
          break;
      }
    } catch (e) {
      console.log(e);
      processed = t;
    }

    // modifiers are applied after the main processing, except for shell commands
    if (["shell"].includes(main)) return processed;

    try {
      const modifiers = parts.slice(1).map((x) => x.trim());
      for (const mod of modifiers) {
        switch (mod) {
          case "uppercase":
            processed = processed.toUpperCase();
            break;
          case "lowercase":
            processed = processed.toLowerCase();
            break;
          case "trim":
            processed = processed.trim();
            break;
          case "percent-encode":
            processed = encodeURIComponent(processed);
            break;
          case "json-stringify":
            processed = JSON.stringify(processed);
            break;
        }
      }
    } catch (e) {
      console.log(e);
    }

    return processed;
  }
}

export const getCustomCommands = async () => {
  const retrieved = await Storage.read("customCommands", "[]");
  return JSON.parse(retrieved).map((x) => new CustomCommand(x));
};

export const setCustomCommands = async (commands) => {
  if (commands) await Storage.write("customCommands", JSON.stringify(commands));
};
