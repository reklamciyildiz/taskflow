/* eslint-disable @next/next/no-img-element -- Private signed URLs are fetched directly, never through a shared image cache. */
import React from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import {
  useAttachments,
  useAttachmentUrl,
} from "@/components/attachments/AttachmentProvider";

function AttachmentView({
  node,
  updateAttributes,
  selected,
  editor,
}: NodeViewProps) {
  const ctx = useAttachments();
  const root = React.useRef<HTMLElement>(null);
  const [visible, setVisible] = React.useState(false);
  const retried = React.useRef(false);
  React.useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const {
    url,
    file: remote,
    error,
    retry,
  } = useAttachmentUrl(visible ? node.attrs.attachmentId : undefined);
  const file =
    ctx?.files.find((file) => file.id === node.attrs.attachmentId) ?? remote;
  const align = ["left", "center", "right"].includes(node.attrs.align)
    ? node.attrs.align
    : "left";
  const width = Math.max(25, Math.min(100, Number(node.attrs.width) || 100));
  return (
    <NodeViewWrapper
      className="my-3 min-w-0"
      contentEditable={false}
      data-attachment-id={node.attrs.attachmentId}
    >
      <figure
        ref={root}
        className="max-w-full rounded border p-2"
        style={{
          width: `${width}%`,
          marginLeft: align === "left" ? 0 : "auto",
          marginRight: align === "right" ? 0 : "auto",
        }}
      >
        <button
          type="button"
          className="block w-full text-left text-xs"
          onClick={() => file && ctx?.open(file)}
          aria-label={`Preview ${file?.filename ?? "file"}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {file?.mime_type.startsWith("image/") && url ? (
            <img
              src={url}
              alt={node.attrs.caption || file.filename}
              loading="lazy"
              onError={() => {
                if (!retried.current) {
                  retried.current = true;
                  retry();
                }
              }}
              className="max-h-[32rem] w-full object-contain"
            />
          ) : (
            <span>{file?.filename || "Attached file"}</span>
          )}
        </button>
        {error && (
          <button
            type="button"
            onClick={retry}
            className="text-xs text-muted-foreground"
          >
            Preview unavailable · Retry
          </button>
        )}
        {node.attrs.caption && (
          <figcaption className="mt-1 break-words text-xs text-muted-foreground">
            {node.attrs.caption}
          </figcaption>
        )}
        {selected && editor.isEditable && ctx?.canEdit && (
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <select
              aria-label="Image alignment"
              value={align}
              onChange={(e) => updateAttributes({ align: e.target.value })}
              className="max-w-full rounded border bg-background p-1"
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
            <input
              aria-label="Image width"
              type="range"
              min={25}
              max={100}
              step={5}
              value={width}
              className="w-24"
              onChange={(e) =>
                updateAttributes({ width: Number(e.target.value) })
              }
            />
            <input
              aria-label="Image caption"
              placeholder="Caption"
              maxLength={240}
              className="min-w-0 w-full rounded border bg-background p-1"
              value={node.attrs.caption || ""}
              onChange={(e) => updateAttributes({ caption: e.target.value })}
            />
          </div>
        )}
      </figure>
    </NodeViewWrapper>
  );
}
export const AttachmentNode = Node.create({
  name: "attachment",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      attachmentId: { default: null },
      align: { default: "left" },
      width: { default: 100 },
      caption: { default: "" },
    };
  },
  // No external <img> / base64 parsing; only explicit attachment references.
  parseHTML() {
    return [
      {
        tag: "div[data-attachment-id]",
        getAttrs: (element) => ({
          attachmentId: (element as HTMLElement).getAttribute(
            "data-attachment-id",
          ),
        }),
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-attachment-id": node.attrs.attachmentId,
      }),
      "Attached file",
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(AttachmentView);
  },
});
