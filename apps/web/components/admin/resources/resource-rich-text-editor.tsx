"use client";

import { Extension, mergeAttributes } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Suggestion from "@tiptap/suggestion";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type ImageAlign = "left" | "center" | "right";

type ResourceImageAttrs = {
  src?: string;
  alt?: string;
  title?: string;
  widthPct?: number | string;
  align?: string;
};

type SelectedImageControls = {
  isActive: boolean;
  widthPct: number;
  align: ImageAlign;
};

type ResizeHandlePosition = {
  left: number;
  top: number;
};

type RichTextLabels = {
  paragraph: string;
  heading2: string;
  heading3: string;
  bold: string;
  italic: string;
  underline: string;
  bulletList: string;
  orderedList: string;
  blockquote: string;
  code: string;
  link: string;
  clear: string;
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
  image: string;
  undo: string;
  redo: string;
  linkPrompt: string;
  imagePrompt: string;
  imageAltPrompt: string;
  shortcutHint: string;
  slashEmpty: string;
  slashParagraphDescription: string;
  slashHeading2Description: string;
  slashHeading3Description: string;
  slashBulletListDescription: string;
  slashOrderedListDescription: string;
  slashBlockquoteDescription: string;
  slashCodeDescription: string;
  slashImageDescription: string;
  imageControls: string;
  imageWidth: string;
};

type ResourceRichTextEditorProps = {
  value: string;
  onChange: (nextValue: string) => void;
  placeholder: string;
  ariaLabel: string;
  labels: RichTextLabels;
};

type SlashCommandItem = {
  title: string;
  description: string;
  keywords: string[];
  command: (params: { editor: Editor; range: { from: number; to: number } }) => void;
};

type SlashRenderContext = {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
};

function escapeSlashHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeMediaUrl(rawValue: string): string | null {
  const value = rawValue.trim();
  if (value.length === 0) return null;

  if (value.startsWith("/")) {
    return value;
  }

  try {
    const parsedUrl = new URL(value);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return null;
    }
    return parsedUrl.toString();
  } catch {
    return null;
  }
}

function normalizeImageWidth(value: unknown): number {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(100, Math.max(30, Math.round(parsed)));
}

function normalizeImageAlign(value: unknown): ImageAlign {
  if (value === "left" || value === "center" || value === "right") {
    return value;
  }

  return "center";
}

function getSelectedImageElement(editor: Editor): HTMLImageElement | null {
  const selectedNode = editor.view.dom.querySelector("img.ProseMirror-selectednode");
  if (selectedNode instanceof HTMLImageElement) {
    return selectedNode;
  }

  const domNodeAtSelection = editor.view.nodeDOM(editor.state.selection.from);
  return domNodeAtSelection instanceof HTMLImageElement ? domNodeAtSelection : null;
}

const RichImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      widthPct: {
        default: 100,
        parseHTML: (element) => normalizeImageWidth(element.getAttribute("data-width")),
        renderHTML: (attributes) => ({
          "data-width": String(normalizeImageWidth(attributes.widthPct)),
        }),
      },
      align: {
        default: "center",
        parseHTML: (element) => normalizeImageAlign(element.getAttribute("data-align")),
        renderHTML: (attributes) => ({
          "data-align": normalizeImageAlign(attributes.align),
        }),
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    const attrs = HTMLAttributes as ResourceImageAttrs;
    const normalizedWidth = normalizeImageWidth(attrs.widthPct);
    const normalizedAlign = normalizeImageAlign(attrs.align);
    const {
      widthPct,
      align,
      style: _style,
      ...rest
    } = attrs as ResourceImageAttrs & {
      style?: unknown;
    };

    return [
      "img",
      mergeAttributes(rest, {
        "data-width": String(normalizedWidth),
        "data-align": normalizedAlign,
        style: `width: ${normalizedWidth}%; height: auto;`,
      }),
    ];
  },
});

function createSlashCommandItems(labels: RichTextLabels): SlashCommandItem[] {
  return [
    {
      title: labels.paragraph,
      description: labels.slashParagraphDescription,
      keywords: ["paragraph", "text"],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setParagraph().run();
      },
    },
    {
      title: labels.heading2,
      description: labels.slashHeading2Description,
      keywords: ["h2", "heading"],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run();
      },
    },
    {
      title: labels.heading3,
      description: labels.slashHeading3Description,
      keywords: ["h3", "heading"],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run();
      },
    },
    {
      title: labels.bulletList,
      description: labels.slashBulletListDescription,
      keywords: ["bullet", "list", "unordered"],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBulletList().run();
      },
    },
    {
      title: labels.orderedList,
      description: labels.slashOrderedListDescription,
      keywords: ["ordered", "numbered", "list"],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleOrderedList().run();
      },
    },
    {
      title: labels.blockquote,
      description: labels.slashBlockquoteDescription,
      keywords: ["quote", "blockquote"],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBlockquote().run();
      },
    },
    {
      title: labels.code,
      description: labels.slashCodeDescription,
      keywords: ["code", "inline"],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleCode().run();
      },
    },
    {
      title: labels.image,
      description: labels.slashImageDescription,
      keywords: ["image", "photo", "media"],
      command: ({ editor, range }) => {
        const imageUrl = window.prompt(labels.imagePrompt, "https://");
        if (imageUrl === null) return;

        const sanitizedUrl = sanitizeMediaUrl(imageUrl);
        if (!sanitizedUrl) return;

        const altText = window.prompt(labels.imageAltPrompt, "") ?? "";

        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setImage({
            src: sanitizedUrl,
            alt: altText.trim(),
          })
          .updateAttributes("image", {
            widthPct: 100,
            align: "center",
          })
          .insertContent("<p></p>")
          .run();
      },
    },
  ];
}

function createSlashCommandExtension(labels: RichTextLabels) {
  return Extension.create({
    name: "resourceSlashCommand",
    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char: "/",
          items: ({ query }) => {
            const normalizedQuery = query.trim().toLowerCase();
            const commands = createSlashCommandItems(labels);

            if (!normalizedQuery) {
              return commands;
            }

            return commands.filter((command) => {
              const titleMatches = command.title.toLowerCase().includes(normalizedQuery);
              const keywordMatches = command.keywords.some((keyword) =>
                keyword.includes(normalizedQuery)
              );
              return titleMatches || keywordMatches;
            });
          },
          command: ({ editor, range, props }) => {
            (props as SlashCommandItem).command({
              editor,
              range,
            });
          },
          render: () => {
            let selectedIndex = 0;
            let popupElement: HTMLDivElement | null = null;
            let currentItems: SlashCommandItem[] = [];
            let executeCommand: ((item: SlashCommandItem) => void) | null = null;

            const destroyPopup = () => {
              if (popupElement) {
                popupElement.remove();
                popupElement = null;
              }
            };

            const updatePopupPosition = (clientRect?: (() => DOMRect | null) | null) => {
              if (!popupElement || !clientRect) return;

              const rect = clientRect();
              if (!rect) return;
              popupElement.style.top = `${rect.bottom + window.scrollY + 8}px`;
              popupElement.style.left = `${rect.left + window.scrollX}px`;
            };

            const renderItems = (props: SlashRenderContext) => {
              if (!popupElement) return;

              const items = props.items;

              if (items.length === 0) {
                popupElement.innerHTML = `<div class="px-3 py-2 text-xs text-[#A1A1AA]">${escapeSlashHtml(labels.slashEmpty)}</div>`;
                return;
              }

              selectedIndex = Math.max(0, Math.min(selectedIndex, items.length - 1));

              popupElement.innerHTML = items
                .map((item, index) => {
                  const selectedClass =
                    index === selectedIndex
                      ? "border-[#007eff] bg-[#0F2236]"
                      : "border-transparent bg-transparent";

                  const title = escapeSlashHtml(item.title);
                  const description = escapeSlashHtml(item.description);

                  return `<button type="button" data-command-index="${index}" class="flex w-full items-start justify-between gap-3 rounded-md border px-2 py-2 text-left text-xs text-white transition-colors hover:border-[#007eff] hover:bg-[#0F2236] ${selectedClass}"><span class="font-semibold">${title}</span><span class="text-[11px] text-[#A1A1AA]">${description}</span></button>`;
                })
                .join("");

              const buttons = popupElement.querySelectorAll<HTMLButtonElement>(
                "button[data-command-index]"
              );
              for (const button of buttons) {
                button.onclick = () => {
                  const index = Number.parseInt(button.dataset.commandIndex ?? "0", 10);
                  const selected = items[index];
                  if (!selected) return;
                  props.command(selected);
                };
              }
            };

            return {
              onStart: (props) => {
                selectedIndex = 0;
                currentItems = props.items as SlashCommandItem[];
                executeCommand = (item) => props.command(item);

                popupElement = document.createElement("div");
                popupElement.className =
                  "z-[80] min-w-[18rem] max-w-[24rem] space-y-1 rounded-lg border border-white/10 bg-[#090909] p-1 shadow-2xl";
                document.body.appendChild(popupElement);

                renderItems(props);
                updatePopupPosition(props.clientRect);
              },
              onUpdate: (props) => {
                currentItems = props.items as SlashCommandItem[];
                executeCommand = (item) => props.command(item);
                renderItems(props);
                updatePopupPosition(props.clientRect);
              },
              onKeyDown: (props) => {
                const items = currentItems;

                if (props.event.key === "Escape") {
                  destroyPopup();
                  return true;
                }

                if (items.length === 0) {
                  return false;
                }

                if (props.event.key === "ArrowDown") {
                  selectedIndex = (selectedIndex + 1) % items.length;
                  if (executeCommand) {
                    renderItems({
                      items,
                      command: executeCommand,
                    });
                  }
                  return true;
                }

                if (props.event.key === "ArrowUp") {
                  selectedIndex = (selectedIndex + items.length - 1) % items.length;
                  if (executeCommand) {
                    renderItems({
                      items,
                      command: executeCommand,
                    });
                  }
                  return true;
                }

                if (props.event.key === "Enter" || props.event.key === "Tab") {
                  executeCommand?.(items[selectedIndex]);
                  return true;
                }

                return false;
              },
              onExit: () => {
                destroyPopup();
              },
            };
          },
        }),
      ];
    },
  });
}

function ResourceRichTextEditorInner({
  value,
  onChange,
  placeholder,
  ariaLabel,
  labels,
}: ResourceRichTextEditorProps) {
  const [selectedImageControls, setSelectedImageControls] = useState<SelectedImageControls>({
    isActive: false,
    widthPct: 100,
    align: "center",
  });
  const [resizeHandlePosition, setResizeHandlePosition] = useState<ResizeHandlePosition | null>(
    null
  );
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const selectedImageRef = useRef<HTMLImageElement | null>(null);
  const isDraggingImageRef = useRef(false);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
        link: false,
        underline: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: {
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
      }),
      RichImage.configure({
        allowBase64: false,
        HTMLAttributes: {
          loading: "lazy",
          decoding: "async",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      createSlashCommandExtension(labels),
    ],
    [placeholder, labels]
  );

  const editor = useEditor({
    extensions,
    content: value || "<p></p>",
    editorProps: {
      attributes: {
        class:
          "min-h-[14rem] rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-[#D4D4D8] focus:outline-none",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": ariaLabel,
      },
    },
    immediatelyRender: false,
    onUpdate({ editor: updatedEditor }) {
      if (updatedEditor.isActive("image")) {
        const selectedImage = getSelectedImageElement(updatedEditor);
        selectedImageRef.current = selectedImage;
        const imageAttrs = updatedEditor.getAttributes("image") as ResourceImageAttrs;

        if (selectedImage && editorContainerRef.current) {
          const containerRect = editorContainerRef.current.getBoundingClientRect();
          const imageRect = selectedImage.getBoundingClientRect();
          setResizeHandlePosition({
            left: imageRect.right - containerRect.left,
            top: imageRect.bottom - containerRect.top,
          });
        }

        setSelectedImageControls({
          isActive: true,
          widthPct: normalizeImageWidth(imageAttrs.widthPct),
          align: normalizeImageAlign(imageAttrs.align),
        });
      }

      onChange(updatedEditor.getHTML());
    },
    onSelectionUpdate({ editor: updatedEditor }) {
      if (!updatedEditor.isActive("image")) {
        selectedImageRef.current = null;
        setResizeHandlePosition(null);
        setSelectedImageControls((previous) =>
          previous.isActive
            ? {
                isActive: false,
                widthPct: previous.widthPct,
                align: previous.align,
              }
            : previous
        );
        return;
      }

      const selectedImage = getSelectedImageElement(updatedEditor);
      selectedImageRef.current = selectedImage;
      const imageAttrs = updatedEditor.getAttributes("image") as ResourceImageAttrs;

      if (selectedImage && editorContainerRef.current) {
        const containerRect = editorContainerRef.current.getBoundingClientRect();
        const imageRect = selectedImage.getBoundingClientRect();
        setResizeHandlePosition({
          left: imageRect.right - containerRect.left,
          top: imageRect.bottom - containerRect.top,
        });
      }

      setSelectedImageControls({
        isActive: true,
        widthPct: normalizeImageWidth(imageAttrs.widthPct),
        align: normalizeImageAlign(imageAttrs.align),
      });
    },
  });

  useEffect(() => {
    if (!editor) return;

    const current = editor.getHTML();
    const next = value || "<p></p>";

    if (current !== next) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [editor, value]);

  useEffect(() => {
    if (!editor || !selectedImageControls.isActive) return;

    const syncHandle = () => {
      if (!editorContainerRef.current) return;

      const selectedImage = getSelectedImageElement(editor);
      selectedImageRef.current = selectedImage;

      if (!selectedImage) {
        setResizeHandlePosition(null);
        return;
      }

      const containerRect = editorContainerRef.current.getBoundingClientRect();
      const imageRect = selectedImage.getBoundingClientRect();

      setResizeHandlePosition({
        left: imageRect.right - containerRect.left,
        top: imageRect.bottom - containerRect.top,
      });
    };

    syncHandle();
    window.addEventListener("resize", syncHandle);
    window.addEventListener("scroll", syncHandle, true);

    return () => {
      window.removeEventListener("resize", syncHandle);
      window.removeEventListener("scroll", syncHandle, true);
    };
  }, [editor, selectedImageControls.isActive]);

  const startImageResizeDrag = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (!editor) return;

    const editorDomWidth = editor.view.dom.clientWidth;
    if (!editorDomWidth) return;

    const initialWidthPct = normalizeImageWidth(editor.getAttributes("image").widthPct);
    const dragStartX = event.clientX;
    const initialPixelWidth = (initialWidthPct / 100) * editorDomWidth;

    isDraggingImageRef.current = true;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingImageRef.current) return;

      const deltaX = moveEvent.clientX - dragStartX;
      const nextPixelWidth = Math.min(
        editorDomWidth,
        Math.max(editorDomWidth * 0.3, initialPixelWidth + deltaX)
      );
      const nextWidthPct = normalizeImageWidth((nextPixelWidth / editorDomWidth) * 100);

      setSelectedImageControls((previous) => ({
        ...previous,
        widthPct: nextWidthPct,
      }));

      editor
        .chain()
        .focus()
        .updateAttributes("image", {
          widthPct: nextWidthPct,
        })
        .run();
    };

    const onMouseUp = () => {
      isDraggingImageRef.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  if (!editor) {
    return (
      <div className="space-y-3">
        <div className="h-10 w-full animate-pulse rounded-md bg-white/10" />
        <div className="h-56 w-full animate-pulse rounded-md bg-white/10" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 md:min-h-9 border-[#2A2A2A] bg-[#000000] text-white hover:border-[#007eff] hover:bg-[#101010]"
          aria-label={labels.paragraph}
          onClick={() => editor.chain().focus().setParagraph().run()}
        >
          {labels.paragraph}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 md:min-h-9 border-[#2A2A2A] bg-[#000000] text-white hover:border-[#007eff] hover:bg-[#101010]"
          aria-label={labels.undo}
          disabled={!editor.can().chain().focus().undo().run()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          {labels.undo}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 md:min-h-9 border-[#2A2A2A] bg-[#000000] text-white hover:border-[#007eff] hover:bg-[#101010]"
          aria-label={labels.redo}
          disabled={!editor.can().chain().focus().redo().run()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          {labels.redo}
        </Button>
        <Button
          type="button"
          variant={editor.isActive("heading", { level: 2 }) ? "secondary" : "outline"}
          size="sm"
          className="min-h-11 md:min-h-9 border-[#2A2A2A] bg-[#000000] text-white hover:border-[#007eff] hover:bg-[#101010]"
          aria-label={labels.heading2}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          {labels.heading2}
        </Button>
        <Button
          type="button"
          variant={editor.isActive("heading", { level: 3 }) ? "secondary" : "outline"}
          size="sm"
          className="min-h-11 md:min-h-9 border-[#2A2A2A] bg-[#000000] text-white hover:border-[#007eff] hover:bg-[#101010]"
          aria-label={labels.heading3}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          {labels.heading3}
        </Button>
        <Button
          type="button"
          variant={editor.isActive("bold") ? "secondary" : "outline"}
          size="sm"
          className="min-h-11 md:min-h-9 border-[#2A2A2A] bg-[#000000] text-white hover:border-[#007eff] hover:bg-[#101010]"
          aria-label={labels.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          {labels.bold}
        </Button>
        <Button
          type="button"
          variant={editor.isActive("italic") ? "secondary" : "outline"}
          size="sm"
          className="min-h-11 md:min-h-9 border-[#2A2A2A] bg-[#000000] text-white hover:border-[#007eff] hover:bg-[#101010]"
          aria-label={labels.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          {labels.italic}
        </Button>
        <Button
          type="button"
          variant={editor.isActive("underline") ? "secondary" : "outline"}
          size="sm"
          className="min-h-11 md:min-h-9 border-[#2A2A2A] bg-[#000000] text-white hover:border-[#007eff] hover:bg-[#101010]"
          aria-label={labels.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          {labels.underline}
        </Button>
        <Button
          type="button"
          variant={editor.isActive("bulletList") ? "secondary" : "outline"}
          size="sm"
          className="min-h-11 md:min-h-9 border-[#2A2A2A] bg-[#000000] text-white hover:border-[#007eff] hover:bg-[#101010]"
          aria-label={labels.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          {labels.bulletList}
        </Button>
        <Button
          type="button"
          variant={editor.isActive("orderedList") ? "secondary" : "outline"}
          size="sm"
          className="min-h-11 md:min-h-9 border-[#2A2A2A] bg-[#000000] text-white hover:border-[#007eff] hover:bg-[#101010]"
          aria-label={labels.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          {labels.orderedList}
        </Button>
        <Button
          type="button"
          variant={editor.isActive("blockquote") ? "secondary" : "outline"}
          size="sm"
          className="min-h-11 md:min-h-9 border-[#2A2A2A] bg-[#000000] text-white hover:border-[#007eff] hover:bg-[#101010]"
          aria-label={labels.blockquote}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          {labels.blockquote}
        </Button>
        <Button
          type="button"
          variant={editor.isActive("code") ? "secondary" : "outline"}
          size="sm"
          className="min-h-11 md:min-h-9 border-[#2A2A2A] bg-[#000000] text-white hover:border-[#007eff] hover:bg-[#101010]"
          aria-label={labels.code}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          {labels.code}
        </Button>
        <Button
          type="button"
          variant={editor.isActive("link") ? "secondary" : "outline"}
          size="sm"
          className="min-h-11 md:min-h-9 border-[#2A2A2A] bg-[#000000] text-white hover:border-[#007eff] hover:bg-[#101010]"
          aria-label={labels.link}
          onClick={() => {
            const existing = editor.getAttributes("link").href as string | undefined;
            const href = window.prompt(labels.linkPrompt, existing ?? "https://");

            if (href === null) return;
            if (href.trim().length === 0) {
              editor.chain().focus().unsetLink().run();
              return;
            }

            const sanitizedUrl = sanitizeMediaUrl(href);
            if (!sanitizedUrl) return;

            editor.chain().focus().setLink({ href: sanitizedUrl }).run();
          }}
        >
          {labels.link}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 md:min-h-9 border-[#2A2A2A] bg-[#000000] text-white hover:border-[#007eff] hover:bg-[#101010]"
          aria-label={labels.image}
          onClick={() => {
            const imageUrl = window.prompt(labels.imagePrompt, "https://");
            if (imageUrl === null) return;

            const sanitizedUrl = sanitizeMediaUrl(imageUrl);
            if (!sanitizedUrl) return;

            const altText = window.prompt(labels.imageAltPrompt, "") ?? "";

            editor
              .chain()
              .focus()
              .setImage({
                src: sanitizedUrl,
                alt: altText.trim(),
              })
              .updateAttributes("image", {
                widthPct: 100,
                align: "center",
              })
              .insertContent("<p></p>")
              .run();
          }}
        >
          {labels.image}
        </Button>
        <Button
          type="button"
          variant={editor.isActive({ textAlign: "left" }) ? "secondary" : "outline"}
          size="sm"
          className="min-h-11 md:min-h-9 border-[#2A2A2A] bg-[#000000] text-white hover:border-[#007eff] hover:bg-[#101010]"
          aria-label={labels.alignLeft}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          {labels.alignLeft}
        </Button>
        <Button
          type="button"
          variant={editor.isActive({ textAlign: "center" }) ? "secondary" : "outline"}
          size="sm"
          className="min-h-11 md:min-h-9 border-[#2A2A2A] bg-[#000000] text-white hover:border-[#007eff] hover:bg-[#101010]"
          aria-label={labels.alignCenter}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          {labels.alignCenter}
        </Button>
        <Button
          type="button"
          variant={editor.isActive({ textAlign: "right" }) ? "secondary" : "outline"}
          size="sm"
          className="min-h-11 md:min-h-9 border-[#2A2A2A] bg-[#000000] text-white hover:border-[#007eff] hover:bg-[#101010]"
          aria-label={labels.alignRight}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          {labels.alignRight}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 md:min-h-9 border-[#2A2A2A] bg-[#000000] text-white hover:border-[#007eff] hover:bg-[#101010]"
          aria-label={labels.clear}
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
        >
          {labels.clear}
        </Button>
      </div>
      {selectedImageControls.isActive ? (
        <div className="space-y-2 rounded-md border border-white/10 bg-black/25 p-3">
          <p className="font-sans text-xs font-semibold text-white">{labels.imageControls}</p>
          <label className="flex items-center gap-3 font-sans text-xs text-[#A1A1AA]">
            <span className="min-w-24">{labels.imageWidth}</span>
            <input
              type="range"
              min={30}
              max={100}
              step={5}
              value={selectedImageControls.widthPct}
              onChange={(event) => {
                const nextWidth = normalizeImageWidth(event.target.value);
                setSelectedImageControls((previous) => ({ ...previous, widthPct: nextWidth }));

                editor
                  .chain()
                  .focus()
                  .updateAttributes("image", {
                    widthPct: nextWidth,
                  })
                  .run();
              }}
            />
            <span className="w-10 text-right text-white">{selectedImageControls.widthPct}%</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={selectedImageControls.align === "left" ? "secondary" : "outline"}
              className="min-h-11 md:min-h-9 border-[#2A2A2A] bg-[#000000] text-white hover:border-[#007eff] hover:bg-[#101010]"
              onClick={() => {
                setSelectedImageControls((previous) => ({ ...previous, align: "left" }));
                editor.chain().focus().updateAttributes("image", { align: "left" }).run();
              }}
            >
              {labels.alignLeft}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={selectedImageControls.align === "center" ? "secondary" : "outline"}
              className="min-h-11 md:min-h-9 border-[#2A2A2A] bg-[#000000] text-white hover:border-[#007eff] hover:bg-[#101010]"
              onClick={() => {
                setSelectedImageControls((previous) => ({ ...previous, align: "center" }));
                editor.chain().focus().updateAttributes("image", { align: "center" }).run();
              }}
            >
              {labels.alignCenter}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={selectedImageControls.align === "right" ? "secondary" : "outline"}
              className="min-h-11 md:min-h-9 border-[#2A2A2A] bg-[#000000] text-white hover:border-[#007eff] hover:bg-[#101010]"
              onClick={() => {
                setSelectedImageControls((previous) => ({ ...previous, align: "right" }));
                editor.chain().focus().updateAttributes("image", { align: "right" }).run();
              }}
            >
              {labels.alignRight}
            </Button>
          </div>
        </div>
      ) : null}
      <p className="font-sans text-xs text-[#A1A1AA]">{labels.shortcutHint}</p>
      <div ref={editorContainerRef} className="relative">
        <EditorContent editor={editor} />
        {selectedImageControls.isActive && resizeHandlePosition ? (
          <button
            type="button"
            aria-label={labels.imageWidth}
            className="absolute z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-se-resize rounded-sm border border-[#007eff] bg-[#007eff] shadow-[0_0_0_2px_rgba(9,9,9,0.85)]"
            style={{
              left: `${resizeHandlePosition.left}px`,
              top: `${resizeHandlePosition.top}px`,
            }}
            onMouseDown={startImageResizeDrag}
          />
        ) : null}
      </div>
    </div>
  );
}

export const ResourceRichTextEditor = memo(ResourceRichTextEditorInner);
