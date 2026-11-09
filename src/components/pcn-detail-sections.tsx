"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Bell, ChevronDown, FileText, History, MailOpen, SlidersHorizontal, Sparkles } from "lucide-react";

type SectionId = "invoice" | "challenge" | "history" | "notices" | "reminders" | "edit";

type Section = {
  id: SectionId;
  title: string;
  preview: string;
  defaultOpen: boolean;
  content: ReactNode;
};

const icons = {
  invoice: FileText,
  challenge: Sparkles,
  history: History,
  notices: MailOpen,
  reminders: Bell,
  edit: SlidersHorizontal,
} satisfies Record<SectionId, typeof FileText>;

export function PcnDetailSections({ sections }: { sections: Section[] }) {
  const [expanded, setExpanded] = useState<Record<SectionId, boolean>>(() => Object.fromEntries(
    sections.map((section) => [section.id, section.defaultOpen]),
  ) as Record<SectionId, boolean>);
  const allExpanded = sections.every((section) => expanded[section.id]);
  const allCollapsed = sections.every((section) => !expanded[section.id]);

  function setAll(open: boolean) {
    setExpanded(Object.fromEntries(sections.map((section) => [section.id, open])) as Record<SectionId, boolean>);
  }

  return <section aria-label="PCN workspace sections" className="pcn-section-area">
    <div className="pcn-section-controls">
      <p>Case workspace</p>
      <div aria-label="Section display controls" className="pcn-section-control-buttons" role="group">
        <button disabled={allExpanded} onClick={() => setAll(true)} type="button">Expand all</button>
        <span aria-hidden="true">·</span>
        <button disabled={allCollapsed} onClick={() => setAll(false)} type="button">Collapse all</button>
      </div>
    </div>

    <div className="pcn-section-list">
      {sections.map((section) => {
        const Icon = icons[section.id];
        const open = expanded[section.id];
        return <details className="pcn-section" key={section.id} onToggle={(event) => {
          const nextOpen = event.currentTarget.open;
          setExpanded((current) => current[section.id] === nextOpen ? current : { ...current, [section.id]: nextOpen });
        }} open={open}>
          <summary>
            <span className="pcn-section-icon"><Icon aria-hidden="true" /></span>
            <span className="pcn-section-heading">
              <strong>{section.title}</strong>
              {!open && <span>{section.preview}</span>}
            </span>
            <ChevronDown aria-hidden="true" className="pcn-section-chevron" />
          </summary>
          <div className="pcn-section-body">{section.content}</div>
        </details>;
      })}
    </div>
  </section>;
}
