import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import {
  AttachmentProvider,
  ActionAttachments,
} from "../../components/attachments/AttachmentProvider";
import { BlockEditor } from "../../components/editor/BlockEditor";

const qa: any = ((window as any).qa = { updates: 0 });
const paragraph = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});
const checklist = {
  type: "doc",
  content: [
    {
      type: "taskList",
      content: [
        {
          type: "taskItem",
          attrs: { id: "stable-item" },
          content: [
            paragraph(
              "A long nested checklist item with files should still use the available width.",
            ),
            {
              type: "taskList",
              content: [
                {
                  type: "taskItem",
                  attrs: { id: "nested-item" },
                  content: [paragraph("Nested work")],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
function Fixture() {
  const [taskId, setTaskId] = useState("action-a");
  const [readOnly, setReadOnly] = useState(false);
  qa.setReadOnly = setReadOnly;
  return (
    <main className="mx-auto flex max-w-3xl flex-col rounded border bg-background p-3 text-foreground">
      <button
        onClick={() =>
          setTaskId(taskId === "action-a" ? "action-b" : "action-a")
        }
      >
        Switch Action
      </button>
      <AttachmentProvider key={taskId} taskId={taskId} canEdit={!readOnly}>
        <ActionAttachments />
        <h2>Note</h2>
        <div data-test="note">
          <BlockEditor
            taskId={taskId}
            editable={!readOnly}
            hideToolbar
            initialContent={{
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Before image" }],
                },
              ],
            }}
            prepareAttachmentTarget={async () => ({ taskId, noteId: "note-a" })}
            onChange={(doc) => {
              qa.saved = doc;
              qa.updates++;
            }}
          />
        </div>
        <h2>Checklist</h2>
        <div data-test="checklist">
          <BlockEditor
            taskId={taskId}
            editable={!readOnly}
            hideToolbar
            checklistMode
            initialContent={checklist}
            className="checklist-editor"
          />
        </div>
      </AttachmentProvider>
      <Toaster />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
