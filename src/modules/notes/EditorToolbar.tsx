import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  Bold,
  ChevronDown,
  Code,
  Columns3,
  FileCode2,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Plus,
  Quote,
  Rows3,
  Strikethrough,
  Table,
  Trash2,
  Underline,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Select,
} from '@/components/ui';
import { useI18n, type MessageKey } from '@/i18n';
import { cn } from '@/utils/cn';

type Block = 'paragraph' | 'h1' | 'h2' | 'h3' | 'other';

const BLOCKS: readonly { value: Exclude<Block, 'other'>; labelKey: MessageKey }[] = [
  { value: 'paragraph', labelKey: 'notes.editor.paragraph' },
  { value: 'h1', labelKey: 'notes.editor.heading1' },
  { value: 'h2', labelKey: 'notes.editor.heading2' },
  { value: 'h3', labelKey: 'notes.editor.heading3' },
];

function Separator() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line" />;
}

interface ToggleProps {
  icon: LucideIcon;
  label: string;
  active: boolean;
  keys?: readonly string[];
  onClick: () => void;
}

function Toggle({ icon, label, active, keys, onClick }: ToggleProps) {
  return (
    <IconButton
      icon={icon}
      label={label}
      size="sm"
      aria-pressed={active}
      {...(keys ? { shortcut: keys } : {})}
      className={cn(active && 'bg-steel text-fg')}
      onClick={onClick}
    />
  );
}

export interface EditorToolbarProps {
  editor: Editor;
  onLink: () => void;
  onInternalLink: () => void;
}

/**
 * Restrained formatting toolbar (spec §8.1): paragraph style, inline formats, links, lists, and the rarer
 * blocks behind « Insert ». Every action also has its keyboard shortcut.
 */
export function EditorToolbar({ editor, onLink, onInternalLink }: EditorToolbarProps) {
  const { t } = useI18n();
  const ctrl = t('keys.ctrl');
  const shift = t('keys.shift');
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      let block: Block = 'other';
      if (current.isActive('heading', { level: 1 })) block = 'h1';
      else if (current.isActive('heading', { level: 2 })) block = 'h2';
      else if (current.isActive('heading', { level: 3 })) block = 'h3';
      else if (current.isActive('paragraph')) block = 'paragraph';
      return {
        block,
        editable: current.isEditable,
        bold: current.isActive('bold'),
        italic: current.isActive('italic'),
        underline: current.isActive('underline'),
        strike: current.isActive('strike'),
        code: current.isActive('code'),
        link: current.isActive('link'),
        bulletList: current.isActive('bulletList'),
        orderedList: current.isActive('orderedList'),
        taskList: current.isActive('taskList'),
        table: current.isActive('table'),
      };
    },
  });
  const chain = () => editor.chain().focus();

  if (!state.editable) {
    return null;
  }
  return (
    <div
      role="toolbar"
      aria-label={t('notes.editor.toolbar')}
      className="flex flex-wrap items-center gap-1 rounded-card border border-line-subtle bg-graphite p-1"
    >
      <Select
        label={t('notes.editor.block')}
        hideLabel
        value={state.block === 'other' ? '' : state.block}
        onChange={(event) => {
          const value = event.target.value as Block;
          if (value === 'paragraph') {
            chain().setParagraph().run();
          } else if (value === 'h1' || value === 'h2' || value === 'h3') {
            chain()
              .setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 })
              .run();
          }
        }}
        className="w-36"
      >
        {state.block === 'other' ? <option value="" disabled /> : null}
        {BLOCKS.map((block) => (
          <option key={block.value} value={block.value}>
            {t(block.labelKey)}
          </option>
        ))}
      </Select>
      <Separator />
      <Toggle
        icon={Bold}
        label={t('notes.editor.bold')}
        active={state.bold}
        keys={[ctrl, 'B']}
        onClick={() => chain().toggleBold().run()}
      />
      <Toggle
        icon={Italic}
        label={t('notes.editor.italic')}
        active={state.italic}
        keys={[ctrl, 'I']}
        onClick={() => chain().toggleItalic().run()}
      />
      <Toggle
        icon={Underline}
        label={t('notes.editor.underline')}
        active={state.underline}
        keys={[ctrl, 'U']}
        onClick={() => chain().toggleUnderline().run()}
      />
      <Toggle
        icon={Strikethrough}
        label={t('notes.editor.strike')}
        active={state.strike}
        keys={[ctrl, shift, 'S']}
        onClick={() => chain().toggleStrike().run()}
      />
      <Toggle
        icon={Code}
        label={t('notes.editor.code')}
        active={state.code}
        keys={[ctrl, 'E']}
        onClick={() => chain().toggleCode().run()}
      />
      <Separator />
      <Toggle icon={Link2} label={t('notes.editor.link')} active={state.link} onClick={onLink} />
      <IconButton
        icon={Waypoints}
        label={t('notes.editor.internalLink')}
        size="sm"
        onClick={onInternalLink}
      />
      <Separator />
      <Toggle
        icon={List}
        label={t('notes.editor.bulletList')}
        active={state.bulletList}
        keys={[ctrl, shift, '8']}
        onClick={() => chain().toggleBulletList().run()}
      />
      <Toggle
        icon={ListOrdered}
        label={t('notes.editor.orderedList')}
        active={state.orderedList}
        keys={[ctrl, shift, '7']}
        onClick={() => chain().toggleOrderedList().run()}
      />
      <Toggle
        icon={ListChecks}
        label={t('notes.editor.taskList')}
        active={state.taskList}
        keys={[ctrl, shift, '9']}
        onClick={() => chain().toggleTaskList().run()}
      />
      <Separator />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" icon={Plus}>
            {t('notes.editor.insert')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            icon={Quote}
            shortcut={[ctrl, shift, 'B']}
            onSelect={() => chain().toggleBlockquote().run()}
          >
            {t('notes.editor.blockquote')}
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={FileCode2}
            shortcut={[ctrl, t('keys.alt'), 'C']}
            onSelect={() => chain().toggleCodeBlock().run()}
          >
            {t('notes.editor.codeBlock')}
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={Table}
            onSelect={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          >
            {t('notes.editor.table')}
          </DropdownMenuItem>
          <DropdownMenuItem icon={Minus} onSelect={() => chain().setHorizontalRule().run()}>
            {t('notes.editor.divider')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {state.table ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" icon={ChevronDown} iconPosition="end">
              {t('notes.editor.tableMenu')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem icon={Rows3} onSelect={() => chain().addRowAfter().run()}>
              {t('notes.editor.addRowAfter')}
            </DropdownMenuItem>
            <DropdownMenuItem icon={Columns3} onSelect={() => chain().addColumnAfter().run()}>
              {t('notes.editor.addColumnAfter')}
            </DropdownMenuItem>
            <DropdownMenuItem icon={Rows3} onSelect={() => chain().toggleHeaderRow().run()}>
              {t('notes.editor.toggleHeaderRow')}
            </DropdownMenuItem>
            <DropdownMenuItem icon={Trash2} onSelect={() => chain().deleteRow().run()}>
              {t('notes.editor.deleteRow')}
            </DropdownMenuItem>
            <DropdownMenuItem icon={Trash2} onSelect={() => chain().deleteColumn().run()}>
              {t('notes.editor.deleteColumn')}
            </DropdownMenuItem>
            <DropdownMenuItem icon={Trash2} onSelect={() => chain().deleteTable().run()}>
              {t('notes.editor.deleteTable')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
