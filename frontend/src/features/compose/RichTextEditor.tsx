import {
  AlignCenter, AlignLeft, Bold, ChevronsUpDown, Indent, Italic, List, ListOrdered, Outdent, Quote, Redo2, Strikethrough, Type, Underline, Undo2,
} from 'lucide-react';
import { forwardRef, ReactNode, useCallback, useImperativeHandle, useRef, useState } from 'react';

export interface EditorHandle {
  getHtml: () => string;
  isEmpty: () => boolean;
}

const ALIGNS = ['justifyLeft', 'justifyCenter', 'justifyRight'] as const;
const SIZES = [
  { label: 'Small', value: '2' },
  { label: 'Normal', value: '3' },
  { label: 'Large', value: '5' },
  { label: 'Huge', value: '6' },
];

function Tool({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()} // keep the text selection in the editor
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-white hover:text-slate-900"
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-4 w-px bg-slate-300" />;

/** Lightweight rich-text editor (contentEditable + execCommand). Output is sanitized server-side. */
export const RichTextEditor = forwardRef<EditorHandle>(function RichTextEditor(_, ref) {
  const el = useRef<HTMLDivElement>(null);
  const saved = useRef<Range | null>(null);
  const alignIdx = useRef(0);
  const [empty, setEmpty] = useState(true);

  const syncEmpty = () => setEmpty(!(el.current?.textContent ?? '').trim() && !el.current?.querySelector('img,li'));

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && el.current?.contains(sel.anchorNode)) saved.current = sel.getRangeAt(0).cloneRange();
  };

  const exec = useCallback((cmd: string, value?: string) => {
    const node = el.current;
    if (!node) return;
    node.focus();
    const sel = window.getSelection();
    if (saved.current && sel) {
      sel.removeAllRanges();
      sel.addRange(saved.current);
    }
    document.execCommand(cmd, false, value);
    saveSelection();
    syncEmpty();
  }, []);

  useImperativeHandle(ref, () => ({
    getHtml: () => el.current?.innerHTML ?? '',
    isEmpty: () => !(el.current?.textContent ?? '').trim(),
  }));

  return (
    <div className="rounded-xl bg-[#FAFAFA] px-4 pb-4 pt-3">
      <p className={`h-5 text-sm text-slate-400 ${empty ? '' : 'invisible'}`}>Type Your Reply…</p>

      <div className="mt-2 flex flex-wrap items-center gap-0.5 rounded-full bg-white px-3 py-1.5">
        <Tool label="Undo" onClick={() => exec('undo')}><Undo2 size={15} /></Tool>
        <Tool label="Redo" onClick={() => exec('redo')}><Redo2 size={15} /></Tool>
        <Divider />
        <label className="relative flex h-7 w-9 cursor-pointer items-center justify-center gap-0.5 rounded text-slate-500 hover:bg-slate-100" title="Font size">
          <Type size={15} />
          <ChevronsUpDown size={10} />
          <select
            aria-label="Font size"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) exec('fontSize', e.target.value);
              e.target.value = '';
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            <option value="" disabled>Size</option>
            {SIZES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <Divider />
        <Tool label="Bold" onClick={() => exec('bold')}><Bold size={15} /></Tool>
        <Tool label="Italic" onClick={() => exec('italic')}><Italic size={15} /></Tool>
        <Tool label="Underline" onClick={() => exec('underline')}><Underline size={15} /></Tool>
        <Divider />
        <Tool label="Align (cycles left / center / right)" onClick={() => { alignIdx.current = (alignIdx.current + 1) % 3; exec(ALIGNS[alignIdx.current]); }}>
          <AlignCenter size={15} />
        </Tool>
        <Divider />
        <Tool label="Numbered list" onClick={() => exec('insertOrderedList')}><ListOrdered size={15} /></Tool>
        <Tool label="Bullet list" onClick={() => exec('insertUnorderedList')}><List size={15} /></Tool>
        <Tool label="Indent" onClick={() => exec('indent')}><Indent size={15} /></Tool>
        <Tool label="Outdent" onClick={() => exec('outdent')}><Outdent size={15} /></Tool>
        <Tool label="Quote" onClick={() => exec('formatBlock', 'blockquote')}><Quote size={15} /></Tool>
        <Tool label="Align left" onClick={() => { alignIdx.current = 0; exec('justifyLeft'); }}><AlignLeft size={15} /></Tool>
        <Divider />
        <Tool label="Strikethrough" onClick={() => exec('strikeThrough')}><Strikethrough size={15} /></Tool>
      </div>

      <div
        ref={el}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Email body"
        onInput={syncEmpty}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onBlur={saveSelection}
        className="mt-3 min-h-[320px] px-1 text-sm leading-relaxed focus:outline-none [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc"
      />
    </div>
  );
});
