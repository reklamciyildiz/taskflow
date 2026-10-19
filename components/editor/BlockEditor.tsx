import React, { forwardRef, useImperativeHandle } from 'react';
import { useEditor, useEditorState, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import { TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { createPortal } from 'react-dom';
import { AdvancedTaskItem } from './extensions/AdvancedTaskItem';
import { Button } from '@/components/ui/button';
import {
  Bold,
  CheckSquare,
  Code2,
  Heading1,
  Heading2,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Strikethrough,
  Type,
  Underline,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import type { NoteType } from '@/lib/types';
import { AttachmentNode } from './extensions/AttachmentNode';
import { AttachmentList, useAttachments } from '@/components/attachments/AttachmentProvider';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ATTACHMENT_ACCEPT, type AttachmentTarget } from '@/lib/attachments';
import { Paperclip, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

export interface ChecklistNoteConversionRequest {
  taskItemId: string;
  text: string;
  content: any;
  type: NoteType;
  removeAfter: boolean;
}

export interface BlockEditorRef {
  /**
   * Insert TipTap JSON (node or node array) or an HTML/text string at the end of the
   * document. When the document is still empty the content replaces the placeholder
   * paragraph instead of being appended below it.
   */
  insertContent: (content: any) => void;
  focus: () => void;
  focusTaskItem: (taskItemId: string) => boolean;
  prependTaskItem: (text: string) => boolean;
  replaceContent: (content: any) => void;
  removeTaskItem: (taskItemId: string) => boolean;
}

interface BlockEditorProps {
  editable?: boolean;
  prepareAttachmentTarget?: () => Promise<AttachmentTarget | null>;
  /** Parent Action identity used by task-item scheduling commands. */
  taskId?: string;
  initialContent?: any;
  /** Document used when `initialContent` is empty (e.g. start a checklist as a task list). */
  emptyContent?: any;
  onChange?: (content: any) => void;
  placeholder?: string;
  /** Show one placeholder only while the whole document is empty. */
  documentPlaceholder?: boolean;
  className?: string;
  /** Team member list — passed via storage to TaskItemNodeView to avoid context re-renders */
  members?: { id: string; name: string }[];
  /** Hide the "Checkboxes / Plain text" toolbar. */
  hideToolbar?: boolean;
  checklistMode?: boolean;
  hideDone?: boolean;
  canUseAdvancedReminderPresets?: boolean;
  onConvertTaskItemToNote?: (
    request: ChecklistNoteConversionRequest,
  ) => Promise<boolean>;
}

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

export type ChecklistSlashCommand =
  | 'taskItem'
  | 'section'
  | 'subheading'
  | 'text'
  | 'bulletList'
  | 'orderedList'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'code'
  | 'highlight'
  | 'image'
  | 'divider';

export type SlashCommandContext = 'document' | 'checklistItem';

export interface ChecklistSlashMenuState {
  blockFrom: number;
  blockTo: number;
  from: number;
  to: number;
  query: string;
  hasTrailingContent: boolean;
  selectedIndex: number;
  left: number;
  top: number;
  context: SlashCommandContext;
}

const CHECKLIST_SLASH_COMMANDS: Array<{
  id: ChecklistSlashCommand;
  label: string;
  keywords: string;
  icon: typeof CheckSquare;
}> = [
  { id: 'taskItem', label: 'Checklist item', keywords: 'checklist task todo', icon: CheckSquare },
  { id: 'section', label: 'Section heading', keywords: 'section heading title', icon: Heading1 },
  { id: 'subheading', label: 'Subheading', keywords: 'subheading subtitle', icon: Heading2 },
  { id: 'text', label: 'Text', keywords: 'text paragraph', icon: Type },
  { id: 'bulletList', label: 'Bulleted list', keywords: 'bullet list', icon: List },
  { id: 'orderedList', label: 'Numbered list', keywords: 'numbered ordered list', icon: ListOrdered },
  { id: 'divider', label: 'Divider', keywords: 'divider separator rule', icon: Minus },
];

const CHECKLIST_ITEM_SLASH_COMMANDS: typeof CHECKLIST_SLASH_COMMANDS = [
  { id: 'bold', label: 'Bold', keywords: 'bold strong', icon: Bold },
  { id: 'italic', label: 'Italic', keywords: 'italic emphasis', icon: Italic },
  { id: 'underline', label: 'Underline', keywords: 'underline', icon: Underline },
  { id: 'strike', label: 'Strikethrough', keywords: 'strike strikethrough', icon: Strikethrough },
  { id: 'code', label: 'Inline code', keywords: 'code inline', icon: Code2 },
  { id: 'highlight', label: 'Highlight', keywords: 'highlight marker', icon: Highlighter },
];

export function filteredSlashCommands(
  query: string,
  hasTrailingContent = false,
  context: SlashCommandContext = 'document',
) {
  const normalized = query.trim().toLowerCase();
  const commands = context === 'checklistItem'
    ? CHECKLIST_ITEM_SLASH_COMMANDS
    : CHECKLIST_SLASH_COMMANDS;
  const available = hasTrailingContent
    ? commands.filter((command) => command.id !== 'divider')
    : commands;
  if (!normalized) return [...available];
  return available.filter(({ label, keywords }) =>
    `${label} ${keywords}`.toLowerCase().includes(normalized),
  );
}

export function applyChecklistSlashCommand(
  view: EditorView,
  menu: ChecklistSlashMenuState,
  command: ChecklistSlashCommand,
): boolean {
  const { schema } = view.state;

  if (menu.context === 'checklistItem') {
    const mark = command === 'bold'
      ? schema.marks.bold
      : command === 'italic'
        ? schema.marks.italic
        : command === 'underline'
          ? schema.marks.underline
          : command === 'strike'
            ? schema.marks.strike
            : command === 'code'
              ? schema.marks.code
              : command === 'highlight'
                ? schema.marks.highlight
                : null;
    if (!mark) return false;
    const transaction = view.state.tr.delete(menu.from, menu.to);
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(menu.from)));
    transaction.addStoredMark(
      mark.create(command === 'highlight' ? { color: '#fbbf24' } : undefined),
    );
    view.dispatch(transaction.scrollIntoView());
    view.focus();
    return true;
  }

  const source = view.state.doc.nodeAt(menu.blockFrom);
  if (!source || !['paragraph', 'heading'].includes(source.type.name)) return false;

  const transaction = view.state.tr;
  const prefixSize = menu.to - menu.from;
  const remainingContent = source.content.cut(prefixSize);
  if (command === 'taskItem') {
    const taskItem = schema.nodes.taskItem.create(
      {
        checked: false,
        id: uuidv4(),
        assigneeId: null,
        dueDate: null,
        reminders: [],
        completedAt: null,
      },
      schema.nodes.paragraph.create(null, remainingContent),
    );
    transaction.replaceWith(
      menu.blockFrom,
      menu.blockTo,
      schema.nodes.taskList.create(null, taskItem),
    );
    transaction.setSelection(
      TextSelection.near(transaction.doc.resolve(menu.blockFrom + 3)),
    );
  } else if (command === 'bulletList' || command === 'orderedList') {
    const listItem = schema.nodes.listItem.create(
      null,
      schema.nodes.paragraph.create(null, remainingContent),
    );
    const listType = command === 'bulletList'
      ? schema.nodes.bulletList
      : schema.nodes.orderedList;
    transaction.replaceWith(menu.blockFrom, menu.blockTo, listType.create(null, listItem));
    transaction.setSelection(
      TextSelection.near(transaction.doc.resolve(menu.blockFrom + 3)),
    );
  } else if (command === 'divider') {
    if (menu.hasTrailingContent) return false;
    transaction.replaceWith(menu.blockFrom, menu.blockTo, schema.nodes.horizontalRule.create());
    transaction.setSelection(
      TextSelection.near(transaction.doc.resolve(menu.blockFrom + 1)),
    );
  } else {
    transaction.delete(menu.from, menu.to);
    const nodeType = command === 'text' ? schema.nodes.paragraph : schema.nodes.heading;
    const attrs = command === 'section'
      ? { level: 1 }
      : command === 'subheading'
        ? { level: 2 }
        : undefined;
    transaction.setNodeMarkup(menu.blockFrom, nodeType, attrs);
    transaction.setSelection(
      TextSelection.near(transaction.doc.resolve(menu.blockFrom + 1)),
    );
  }

  view.dispatch(transaction.scrollIntoView());
  view.focus();
  return true;
}

function normalizeLink(value: string): string | null {
  const candidate = value.trim();
  if (!candidate) return null;
  if (/^mailto:/i.test(candidate)) return candidate;
  try {
    const url = new URL(candidate.includes('://') ? candidate : `https://${candidate}`);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function FormattingButton({
  active = false,
  label,
  onPress,
  children,
}: {
  active?: boolean;
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        'grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        active && 'bg-accent text-foreground',
      )}
      onMouseDown={(event) => {
        event.preventDefault();
        onPress();
      }}
    >
      {children}
    </button>
  );
}

export const BlockEditor = forwardRef<BlockEditorRef, BlockEditorProps>(
  (
    {
      taskId,
      editable = true,
      initialContent,
      emptyContent,
      onChange,
      placeholder = 'Write something...',
      documentPlaceholder = false,
      className,
      members,
      hideToolbar = false,
      checklistMode = false,
      hideDone = false,
      canUseAdvancedReminderPresets = true,
      onConvertTaskItemToNote,
      prepareAttachmentTarget,
    },
    ref,
  ) => {
  const slashMenuRef = React.useRef<ChecklistSlashMenuState | null>(null);
  const attachments = useAttachments();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [libraryOpen,setLibraryOpen] = React.useState(false);
  const uploadAtSelectionRef = React.useRef<(files:File[])=>void>(()=>{});
  const commandsFor = (
    query: string,
    trailing = false,
    context: SlashCommandContext = 'document',
  ) => {
    const commands = filteredSlashCommands(query, trailing, context);
    if (context === 'document' && !checklistMode && prepareAttachmentTarget && attachments?.enabled && 'image file attachment'.includes(query.toLowerCase()))
      commands.unshift({id:'image',label:'Image / file',keywords:'image file attachment',icon:ImageIcon});
    return commands;
  };
  const runSlash = (view:EditorView,menu:ChecklistSlashMenuState,command:ChecklistSlashCommand) => {
    if(command==='image') {view.dispatch(view.state.tr.delete(menu.from,menu.to));fileInput.current?.click();return;}
    applyChecklistSlashCommand(view,menu,command);
  };
  const [slashMenu, setSlashMenu] = React.useState<ChecklistSlashMenuState | null>(null);
  const [linkEditorOpen, setLinkEditorOpen] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState('');
  const linkSelectionRef = React.useRef<{ from: number; to: number } | null>(null);

  const updateSlashMenu = React.useCallback(
    (next: ChecklistSlashMenuState | null) => {
      slashMenuRef.current = next;
      setSlashMenu(next);
    },
    [],
  );

  const editor = useEditor({
    editable,
    // This editor only ever mounts client-side after a user interaction (never during SSR/hydration).
    // Without this, @tiptap/react defaults to `false` under Next.js, returns `null` on the first
    // render, and the host panel paints once without the editor and once with it → visible flash.
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
        // In Checklist mode these are compact semantic section levels. Notes
        // retain StarterKit's existing heading configuration.
        heading: checklistMode ? { levels: [1, 2] } : {},
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
        },
      }),
      Highlight.configure({ multicolor: true }),
      TaskList,
      ...(!checklistMode ? [AttachmentNode] : []),
      AdvancedTaskItem.configure({
        nested: true,
      }),
      Placeholder.configure({
        placeholder: ({ editor }) =>
          documentPlaceholder && !editor.isEmpty ? '' : placeholder,
        // Checklists are `taskList > taskItem > paragraph`; without this the empty
        // paragraph inside the first task item never gets the placeholder decoration.
        // Document-style notes instead show a single placeholder only when fully empty.
        includeChildren: !documentPlaceholder,
      }),
    ],
    content: initialContent || emptyContent || EMPTY_DOC,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getJSON());
    },
    onTransaction: ({ editor }) => {
      if ((!checklistMode && !prepareAttachmentTarget) || !editor.isEditable || !editor.state.selection.empty) {
        if (slashMenuRef.current) updateSlashMenu(null);
        return;
      }

      const { $from } = editor.state.selection;
      if (!['paragraph', 'heading'].includes($from.parent.type.name)) {
        if (slashMenuRef.current) updateSlashMenu(null);
        return;
      }

      let insideTaskItem = false;
      for (let depth = $from.depth - 1; depth > 0; depth -= 1) {
        if ($from.node(depth).type.name === 'taskItem') {
          insideTaskItem = true;
          break;
        }
      }
      const context: SlashCommandContext = checklistMode && insideTaskItem
        ? 'checklistItem'
        : 'document';
      if (context === 'document' && $from.depth !== 1) {
        if (slashMenuRef.current) updateSlashMenu(null);
        return;
      }

      const beforeCursor = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
      const match = beforeCursor.match(/^\/([^\s/]*)$/);
      if (!match) {
        if (slashMenuRef.current) updateSlashMenu(null);
        return;
      }

      const commands = commandsFor(
        match[1],
        $from.parentOffset < $from.parent.content.size,
        context,
      );
      if (commands.length === 0) {
        if (slashMenuRef.current) updateSlashMenu(null);
        return;
      }

      const coords = editor.view.coordsAtPos($from.pos);
      const previous = slashMenuRef.current;
      updateSlashMenu({
        blockFrom: $from.before($from.depth),
        blockTo: $from.after($from.depth),
        from: $from.start($from.depth),
        to: $from.pos,
        query: match[1],
        hasTrailingContent: $from.parentOffset < $from.parent.content.size,
        selectedIndex: Math.min(previous?.selectedIndex ?? 0, commands.length - 1),
        left: coords.left,
        top: coords.bottom + 6,
        context,
      });
    },
    editorProps: {
      handlePaste: (_view,event) => {
        const files=Array.from(event.clipboardData?.files??[]);
        if(!prepareAttachmentTarget || !attachments?.canEdit || !files.length)return false;
        uploadAtSelectionRef.current(files);return true;
      },
      handleDrop: (view,event) => {
        const files=Array.from(event.dataTransfer?.files??[]);
        if(!prepareAttachmentTarget || !attachments?.canEdit || !files.length)return false;
        const position=view.posAtCoords({left:event.clientX,top:event.clientY});
        if(position)view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(position.pos))));
        uploadAtSelectionRef.current(files);return true;
      },
      attributes: {
        class: 'focus:outline-none min-h-[120px] max-w-none text-sm',
      },
      handleKeyDown: (view, event) => {
        const currentMenu = slashMenuRef.current;
        if (currentMenu) {
          const commands = commandsFor(
            currentMenu.query,
            currentMenu.hasTrailingContent,
            currentMenu.context,
          );
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            const selectedIndex =
              (currentMenu.selectedIndex + direction + commands.length) % commands.length;
            updateSlashMenu({ ...currentMenu, selectedIndex });
            return true;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            updateSlashMenu(null);
            return true;
          }
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            const command = commands[currentMenu.selectedIndex];
            if (command) runSlash(view, currentMenu, command.id);
            updateSlashMenu(null);
            return true;
          }
        }

        if (
          !checklistMode ||
          event.key !== 'Enter' ||
          event.shiftKey ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.isComposing ||
          view.state.selection.empty === false
        ) return false;

        const { $from } = view.state.selection;
        let insideTaskItem = false;
        for (let depth = $from.depth; depth > 0; depth -= 1) {
          if ($from.node(depth).type.name === 'taskItem') {
            insideTaskItem = true;
            break;
          }
        }
        if (insideTaskItem) {
          if (
            $from.parent.type.name !== 'paragraph' ||
            !$from.parent.textContent.trim() ||
            $from.parentOffset !== $from.parent.content.size
          ) return false;

          let taskItemDepth = 0;
          for (let depth = $from.depth; depth > 0; depth -= 1) {
            if ($from.node(depth).type.name === 'taskItem') {
              taskItemDepth = depth;
              break;
            }
          }
          if (!taskItemDepth) return false;

          const { schema } = view.state;
          const taskItem = schema.nodes.taskItem.create(
            {
              checked: false,
              id: uuidv4(),
              assigneeId: null,
              dueDate: null,
              reminders: [],
              completedAt: null,
            },
            schema.nodes.paragraph.create(),
          );
          const insertAt = $from.after(taskItemDepth);
          const transaction = view.state.tr.insert(insertAt, taskItem);
          transaction.setSelection(
            TextSelection.near(transaction.doc.resolve(insertAt + 2)),
          );
          transaction.setStoredMarks([]);
          view.dispatch(transaction.scrollIntoView());
          event.preventDefault();
          return true;
        }
        if ($from.depth !== 1) return false;
        if (!['paragraph', 'heading'].includes($from.parent.type.name)) return false;
        if (!$from.parent.textContent.trim()) return false;

        const { schema } = view.state;
        const paragraph = schema.nodes.paragraph.create();
        const taskItem = schema.nodes.taskItem.create(
          {
            checked: false,
            id: uuidv4(),
            assigneeId: null,
            dueDate: null,
            reminders: [],
            completedAt: null,
          },
          paragraph,
        );
        const afterBlock = $from.after(1);
        const blockIndex = $from.index(0);
        const nextBlock =
          blockIndex + 1 < view.state.doc.childCount
            ? view.state.doc.child(blockIndex + 1)
            : null;
        const transaction = view.state.tr;

        if (nextBlock?.type.name === 'taskList') {
          transaction.insert(afterBlock + 1, taskItem);
        } else {
          transaction.insert(
            afterBlock,
            schema.nodes.taskList.create(null, taskItem),
          );
        }
        transaction.setSelection(
          TextSelection.near(transaction.doc.resolve(afterBlock + 3)),
        );
        transaction.setStoredMarks([]);
        view.dispatch(transaction.scrollIntoView());
        event.preventDefault();
        return true;
      },
    },
  });

  uploadAtSelectionRef.current = async (files:File[]) => {
    if(!editor || !prepareAttachmentTarget || !attachments?.canEdit)return;
    // Keep the intended insertion point mapped through edits while the upload runs.
    let bookmark=editor.state.selection.getBookmark();
    const map=({transaction}:any)=>{bookmark=bookmark.map(transaction.mapping);};
    editor.on('transaction',map);
    let completed=0;
    try {
      const target=await prepareAttachmentTarget();
      if(!target || editor.isDestroyed){editor.off('transaction',map);return;}
      attachments.upload(files,target,id=>{
        if(editor.isDestroyed)return;
        const selection=bookmark.resolve(editor.state.doc);
        editor.commands.insertContentAt(selection.from,{type:'attachment',attrs:{attachmentId:id}});
        if(++completed===files.length)editor.off('transaction',map);
      });
      // Subscription lives with this editor; remove on destruction as well.
      editor.once('destroy',()=>editor.off('transaction',map));
    } catch(error){editor.off('transaction',map);toast.error((error as Error).message);}
  };

  // Sync checklist UI context into editor storage so TaskItemNodeView can read it
  // without subscribing to the global TaskContext (which would re-render
  // every row on any tasks array change, causing visible jitter).
  React.useEffect(() => {
    editor?.setEditable(editable, false);
  }, [editor, editable]);

  React.useEffect(() => {
    if (editor) {
      const storage = editor.storage as any;
      if (!storage.taskItem) storage.taskItem = {};
      storage.taskItem.members = members ?? [];
      storage.taskItem.taskId = taskId;
      storage.taskItem.checklistMode = checklistMode;
      storage.taskItem.hideDone = hideDone;
      storage.taskItem.canUseAdvancedReminderPresets = canUseAdvancedReminderPresets;
      storage.taskItem.onConvertToNote = onConvertTaskItemToNote;
    }
  }, [
    canUseAdvancedReminderPresets,
    checklistMode,
    editor,
    hideDone,
    members,
    onConvertTaskItemToNote,
    taskId,
  ]);

  React.useEffect(() => {
    if (!checklistMode && slashMenuRef.current) updateSlashMenu(null);
  }, [checklistMode, updateSlashMenu]);

  const formattingState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      hasSelection: Boolean(
        currentEditor &&
          !currentEditor.state.selection.empty &&
          currentEditor.state.selection.from !== currentEditor.state.selection.to,
      ),
      bold: Boolean(currentEditor?.isActive('bold')),
      italic: Boolean(currentEditor?.isActive('italic')),
      underline: Boolean(currentEditor?.isActive('underline')),
      strike: Boolean(currentEditor?.isActive('strike')),
      code: Boolean(currentEditor?.isActive('code')),
      link: Boolean(currentEditor?.isActive('link')),
      highlight: Boolean(currentEditor?.isActive('highlight')),
    }),
  });

  React.useEffect(() => {
    if (!formattingState?.hasSelection) setLinkEditorOpen(false);
  }, [formattingState?.hasSelection]);

  useImperativeHandle(ref, () => ({
    insertContent: (content: any) => {
      if (!editor) return;
      if (editor.isEmpty) {
        // Replace the empty placeholder paragraph rather than leaving it dangling above.
        editor.chain().setContent(content, { emitUpdate: true }).focus('end').run();
        return;
      }
      editor.chain().focus('end').insertContent(content).run();
    },
    focus: () => {
      editor?.chain().focus('end').run();
    },
    focusTaskItem: (taskItemId: string) => {
      if (!editor || !taskItemId) return false;
      let position: number | null = null;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'taskItem' && node.attrs?.id === taskItemId) {
          position = pos;
          return false;
        }
        return position === null;
      });
      if (position === null) return false;
      const transaction = editor.state.tr
        .setSelection(TextSelection.near(editor.state.doc.resolve(position + 2)))
        .scrollIntoView();
      editor.view.dispatch(transaction);
      editor.view.focus();
      const dom = editor.view.nodeDOM(position);
      if (dom instanceof HTMLElement) {
        dom.scrollIntoView({ behavior: 'smooth', block: 'center' });
        dom.dataset.plannerFocus = 'true';
        window.setTimeout(() => delete dom.dataset.plannerFocus, 1600);
      }
      return true;
    },
    prependTaskItem: (text: string) => {
      const value = text.trim();
      if (!editor || !value) return false;

      const paragraph = editor.schema.nodes.paragraph.create(
        null,
        editor.schema.text(value),
      );
      const taskItem = editor.schema.nodes.taskItem.create(
        {
          checked: false,
          id: uuidv4(),
          assigneeId: null,
          dueDate: null,
          reminders: [],
          completedAt: null,
        },
        paragraph,
      );

      const firstBlock = editor.state.doc.firstChild;
      const emptySeed =
        editor.state.doc.childCount === 1 &&
        firstBlock?.type.name === 'paragraph' &&
        firstBlock.textContent.trim().length === 0;
      if (emptySeed) {
        const taskList = editor.schema.nodes.taskList.create(null, taskItem);
        editor.commands.setContent(
          { type: 'doc', content: [taskList.toJSON()] },
          { emitUpdate: true },
        );
        return true;
      }

      if (firstBlock?.type.name !== 'taskList') {
        editor
          .chain()
          .command(({ tr, dispatch }) => {
            if (dispatch) {
              tr.insert(0, editor.schema.nodes.taskList.create(null, taskItem));
            }
            return true;
          })
          .run();
        return true;
      }

      const first = firstBlock.childCount === 1 ? firstBlock.child(0) : null;
      const firstIsBlank =
        first &&
        first.textContent.trim().length === 0 &&
        !first.attrs?.checked &&
        !first.attrs?.assigneeId &&
        !first.attrs?.dueDate &&
        (!Array.isArray(first.attrs?.reminders) || first.attrs.reminders.length === 0);

      editor
        .chain()
        .command(({ tr, dispatch }) => {
          if (!dispatch) return true;
          const listStart = 1;
          if (firstIsBlank) {
            tr.replaceWith(listStart, listStart + first.nodeSize, taskItem);
          } else {
            tr.insert(listStart, taskItem);
          }
          return true;
        })
        .run();
      return true;
    },
    replaceContent: (content: any) => {
      if (!editor) return;
      editor.commands.setContent(content || emptyContent || EMPTY_DOC, {
        emitUpdate: false,
      });
    },
    removeTaskItem: (taskItemId: string) => {
      if (!editor || !taskItemId) return false;
      let removed = false;
      const prune = (node: any): any | null => {
        if (!node || typeof node !== 'object') return node;
        if (node.type === 'taskItem' && node.attrs?.id === taskItemId) {
          removed = true;
          return null;
        }
        if (!Array.isArray(node.content)) return node;
        const content = node.content
          .map(prune)
          .filter((child: any) => child !== null);
        if (node.type === 'taskList' && content.length === 0) return null;
        return { ...node, content };
      };
      const next = prune(editor.getJSON());
      if (!removed) return false;
      editor.commands.setContent(next || emptyContent || EMPTY_DOC, {
        emitUpdate: true,
      });
      return true;
    },
  }), [editor, emptyContent]);

  const toggleAllCheckboxes = () => {
    if (!editor) return;

    const isTaskList = editor.isActive('taskList');
    editor.chain().focus().selectAll().run();
    
    if (isTaskList) {
      editor.chain().focus().liftListItem('taskItem').run();
    } else {
      editor.chain().focus().toggleList('taskList', 'taskItem').run();
    }
    editor.chain().focus().setTextSelection(editor.state.selection.to).run();
  };

  if (!editor) return null;

  const applyLink = () => {
    const selection = linkSelectionRef.current;
    const href = normalizeLink(linkUrl);
    const chain = editor.chain().focus();
    if (selection) chain.setTextSelection(selection);
    if (href) {
      chain.setLink({ href, target: '_blank', rel: 'noopener noreferrer' }).run();
    } else {
      chain.unsetLink().run();
    }
    setLinkEditorOpen(false);
  };

  const openLinkEditor = () => {
    const { from, to } = editor.state.selection;
    linkSelectionRef.current = { from, to };
    setLinkUrl(editor.getAttributes('link').href ?? '');
    setLinkEditorOpen(true);
  };

  return (
    <div data-attachment-note={prepareAttachmentTarget ? '' : undefined} className={cn('relative flex flex-col w-full', className)}>
      {prepareAttachmentTarget && attachments?.enabled && attachments.canEdit && <div className="flex py-1">
        <input ref={fileInput} type="file" multiple accept={ATTACHMENT_ACCEPT} className="sr-only" aria-label="Insert image or PDF" onChange={e=>{uploadAtSelectionRef.current(Array.from(e.target.files??[]));e.target.value='';}}/>
        <button type="button" className="flex min-h-9 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-muted" onMouseDown={e=>e.preventDefault()} onClick={()=>fileInput.current?.click()}><Paperclip className="h-3.5 w-3.5"/>Image / file</button>
        <button type="button" className="min-h-9 rounded px-2 text-xs text-muted-foreground hover:bg-muted" onMouseDown={e=>e.preventDefault()} onClick={()=>setLibraryOpen(true)}>Existing file</button>
        <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
          <DialogContent className="z-[71] w-[calc(100vw-1rem)] max-w-lg max-h-[85dvh] overflow-y-auto" overlayClassName="z-[70]">
            <DialogTitle>Action files</DialogTitle><DialogDescription>Insert an existing file into this note.</DialogDescription>
            <AttachmentList target={{taskId:attachments.taskId}} onInsert={id=>{
              void prepareAttachmentTarget().then(target=>{
                if(target&&!editor.isDestroyed){editor.chain().focus().insertContentAt(editor.state.selection.to,{type:'attachment',attrs:{attachmentId:id}}).run();setLibraryOpen(false);}
              }).catch(error=>toast.error(error.message));
            }}/>
          </DialogContent>
        </Dialog>
      </div>}
      {hideToolbar || !editable ? null : (
      <div className="flex items-center gap-1 px-1 py-1.5 opacity-40 hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={toggleAllCheckboxes}
          className="h-6 px-2 text-[11px] rounded bg-muted/50 hover:bg-muted"
          title="Toggle Checkboxes"
        >
          {editor.isActive('taskList') ? (
            <><Type className="w-3 h-3 mr-1" /> Plain Text</>
          ) : (
            <><CheckSquare className="w-3 h-3 mr-1" /> Checkboxes</>
          )}
        </Button>
      </div>
      )}

      <div className="py-1 px-0">
        <EditorContent editor={editor} className="min-h-[150px] outline-none" />
      </div>

      {checklistMode ? (
        <BubbleMenu
          editor={editor}
          shouldShow={({ state }) =>
            editor.isEditable && !state.selection.empty && state.selection.from !== state.selection.to
          }
          options={{
            placement: 'top',
            strategy: 'fixed',
            offset: 8,
            flip: true,
            shift: true,
          }}
          className="relative flex max-w-[calc(100vw-1rem)] items-center gap-0.5 rounded-lg border border-border/70 bg-popover p-1 shadow-xl"
        >
          <FormattingButton
            label="Bold"
            active={Boolean(formattingState?.bold)}
            onPress={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="h-3.5 w-3.5" aria-hidden />
          </FormattingButton>
          <FormattingButton
            label="Italic"
            active={Boolean(formattingState?.italic)}
            onPress={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-3.5 w-3.5" aria-hidden />
          </FormattingButton>
          <FormattingButton
            label="Underline"
            active={Boolean(formattingState?.underline)}
            onPress={() => editor.chain().focus().toggleUnderline().run()}
          >
            <Underline className="h-3.5 w-3.5" aria-hidden />
          </FormattingButton>
          <FormattingButton
            label="Strikethrough"
            active={Boolean(formattingState?.strike)}
            onPress={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough className="h-3.5 w-3.5" aria-hidden />
          </FormattingButton>
          <FormattingButton
            label="Inline code"
            active={Boolean(formattingState?.code)}
            onPress={() => editor.chain().focus().toggleCode().run()}
          >
            <Code2 className="h-3.5 w-3.5" aria-hidden />
          </FormattingButton>
          <FormattingButton
            label="Link"
            active={Boolean(formattingState?.link)}
            onPress={openLinkEditor}
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden />
          </FormattingButton>
          <FormattingButton
            label="Highlight"
            active={Boolean(formattingState?.highlight)}
            onPress={() =>
              editor.chain().focus().toggleHighlight({ color: '#fbbf24' }).run()
            }
          >
            <Highlighter className="h-3.5 w-3.5" aria-hidden />
          </FormattingButton>

          {linkEditorOpen ? (
            <form
              className="absolute left-0 top-[calc(100%+0.4rem)] flex w-64 gap-1 rounded-lg border border-border/70 bg-popover p-1.5 shadow-xl"
              onSubmit={(event) => {
                event.preventDefault();
                applyLink();
              }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <input
                autoFocus
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setLinkEditorOpen(false);
                    editor.commands.focus();
                  }
                }}
                placeholder="https://..."
                aria-label="Link URL"
                className="h-7 min-w-0 flex-1 rounded-md border border-border/60 bg-background px-2 text-xs outline-none focus:border-primary"
              />
              <Button type="submit" size="sm" className="h-7 px-2 text-xs">
                Apply
              </Button>
            </form>
          ) : null}
        </BubbleMenu>
      ) : null}

      {slashMenu && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="listbox"
              aria-label={slashMenu.context === 'checklistItem' ? 'Checklist item commands' : 'Editor commands'}
              className="fixed z-[100] max-h-[min(20rem,calc(100dvh-1rem))] w-52 overflow-y-auto overscroll-contain rounded-lg border border-border/70 bg-popover p-1 text-popover-foreground shadow-xl"
              style={{
                left: Math.max(8, Math.min(slashMenu.left, window.innerWidth - 216)),
                top: Math.max(8, Math.min(slashMenu.top, window.innerHeight - 328)),
              }}
              onMouseDown={(event) => event.preventDefault()}
            >
              {commandsFor(
                slashMenu.query,
                slashMenu.hasTrailingContent,
                slashMenu.context,
              ).map((command, index) => {
                const Icon = command.icon;
                return (
                  <button
                    key={command.id}
                    type="button"
                    role="option"
                    aria-selected={index === slashMenu.selectedIndex}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                      index === slashMenu.selectedIndex
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-accent/70',
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      runSlash(editor.view, slashMenu, command.id);
                      updateSlashMenu(null);
                    }}
                    onMouseEnter={() => {
                      if (index !== slashMenu.selectedIndex) {
                        updateSlashMenu({ ...slashMenu, selectedIndex: index });
                      }
                    }}
                  >
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    {command.label}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
});

BlockEditor.displayName = 'BlockEditor';
