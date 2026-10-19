'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// GitHub-flavoured Markdown: headings, lists, task lists, links, tables, code blocks, strikethrough.
// Raw HTML in the text is NOT rendered (react-markdown's default), so a description can't inject scripts.
export default function Markdown({ text }: { text: string }) {
  if (!text.trim()) return <p className="muted">No description.</p>;
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: props => <a {...props} target="_blank" rel="noreferrer noopener" /> }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
