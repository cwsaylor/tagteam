import React, { useState } from "react";
import { render, Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { loadConfig, setConfigValue } from "./config.js";
import type { TagTeamConfig } from "./config.js";

interface ConfigField {
  key: string;
  label: string;
  get: (c: TagTeamConfig) => string;
  type: "string" | "number";
}

const CONFIG_FIELDS: ConfigField[] = [
  {
    key: "claude.model",
    label: "Claude model",
    get: (c) => c.claude.model,
    type: "string",
  },
  {
    key: "codex.model",
    label: "Codex model",
    get: (c) => c.codex.model,
    type: "string",
  },
  {
    key: "discussion.max_rounds",
    label: "Discussion max rounds",
    get: (c) => String(c.discussion.max_rounds),
    type: "number",
  },
];

const LABEL_WIDTH = Math.max(...CONFIG_FIELDS.map((f) => f.label.length));

type EditMode = "select" | "edit";

interface InlineConfigEditorProps {
  isActive: boolean;
  onClose: () => void;
}

export function InlineConfigEditor({ isActive, onClose }: InlineConfigEditorProps) {
  const [config, setConfig] = useState(() => loadConfig());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<EditMode>("select");
  const [editValue, setEditValue] = useState("");
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useInput(
    (input, key) => {
      if (key.upArrow) {
        setSavedMessage(null);
        setSelectedIndex((i) => (i > 0 ? i - 1 : CONFIG_FIELDS.length - 1));
      } else if (key.downArrow) {
        setSavedMessage(null);
        setSelectedIndex((i) => (i < CONFIG_FIELDS.length - 1 ? i + 1 : 0));
      } else if (key.return) {
        const field = CONFIG_FIELDS[selectedIndex];
        setEditValue(field.get(config));
        setSavedMessage(null);
        setMode("edit");
      } else if (key.escape || input === "q") {
        onClose();
      }
    },
    { isActive: isActive && mode === "select" }
  );

  useInput(
    (_input, key) => {
      if (key.escape) {
        setMode("select");
      }
    },
    { isActive: isActive && mode === "edit" }
  );

  const handleEditSubmit = (value: string) => {
    const field = CONFIG_FIELDS[selectedIndex];

    if (field.type === "number") {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1) {
        setSavedMessage("Error: must be a positive integer");
        setMode("select");
        return;
      }
    }

    try {
      const updated = setConfigValue(field.key, value);
      setConfig(updated);
      setSavedMessage(`Saved ${field.key} = ${value}`);
    } catch (e: any) {
      setSavedMessage(`Error: ${e.message}`);
    }

    setMode("select");
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Configuration</Text>
        <Text dimColor> ── edit values inline</Text>
      </Box>

      {CONFIG_FIELDS.map((field, i) => {
        const selected = i === selectedIndex;
        const pointer = selected ? "> " : "  ";
        const currentValue = field.get(config);

        return (
          <Box key={field.key} marginLeft={1}>
            <Text color={selected ? "cyan" : undefined} bold={selected}>
              {pointer}
              {field.label.padEnd(LABEL_WIDTH)}
            </Text>
            <Text dimColor> = </Text>
            {mode === "edit" && selected ? (
              <TextInput
                value={editValue}
                onChange={setEditValue}
                onSubmit={handleEditSubmit}
                showCursor
              />
            ) : (
              <Text color="white">{currentValue}</Text>
            )}
          </Box>
        );
      })}

      {savedMessage && (
        <Box marginTop={1} marginLeft={1}>
          <Text color={savedMessage.startsWith("Error") ? "red" : "green"}>
            {savedMessage}
          </Text>
        </Box>
      )}

      <Box marginTop={1} marginLeft={1}>
        <Text dimColor>
          {mode === "edit"
            ? "Enter save  Esc cancel"
            : "↑↓ navigate  Enter edit  Esc/q quit"}
        </Text>
      </Box>
    </Box>
  );
}

// Standalone entrypoint for `tagteam config edit`
function StandaloneConfigEditor() {
  const { exit } = useApp();
  return <InlineConfigEditor isActive={true} onClose={exit} />;
}

export function startConfigEditor() {
  return render(<StandaloneConfigEditor />);
}
