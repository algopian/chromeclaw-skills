// @tool markdown
// @description Render Markdown to styled images for XHS publishing. Converts MD → HTML → screenshots via off-screen iframe + html2canvas.
// @arg {string} action - "renderMarkdown" | "publishMarkdown" | "info"
// @arg {string} [markdown] - Markdown text to render
// @arg {number} [width] - Image width in px (default: 1080)
// @arg {number} [maxPageHeight] - Max page height before split (default: 3000)
// @arg {string} [title] - Post title (for publishMarkdown)
// @arg {string} [content] - Post content/description (for publishMarkdown)
// @arg {string[]} [tags] - Hashtags (for publishMarkdown)

const { action = 'info', markdown = '', width = 1080, maxPageHeight = 3000, title = '', content: postContent = '', tags = [] } = args;

// ═══════════════════════════════════════════════════════════════════════
// Helpers (shared pure functions — same as in test-unit.js Suites 23-25)
// ═══════════════════════════════════════════════════════════════════════

function markdownToHtml(md) {
  if (!md || typeof md !== 'string') return '';
  let html = md;

  // Fenced code blocks (```lang\n...\n```) — process BEFORE inline
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<pre><code class="language-${lang || 'text'}">${escaped.trimEnd()}</code></pre>`;
  });

  // Tables
  html = html.replace(/((?:^|\n)\|.+\|(?:\n\|[-:| ]+\|)(?:\n\|.+\|)+)/g, (block) => {
    const lines = block.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return block;
    const parseRow = (line) => line.split('|').filter((_, i, a) => i > 0 && i < a.length - 1).map(c => c.trim());
    const headers = parseRow(lines[0]);
    const bodyRows = lines.slice(2).map(parseRow);
    let t = '<table><thead><tr>';
    for (const h of headers) t += `<th>${h}</th>`;
    t += '</tr></thead><tbody>';
    for (const row of bodyRows) { t += '<tr>'; for (const cell of row) t += `<td>${cell}</td>`; t += '</tr>'; }
    t += '</tbody></table>';
    return t;
  });

  // Headings
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Horizontal rule
  html = html.replace(/^---+$/gm, '<hr>');

  // Blockquotes
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  // Unordered lists
  html = html.replace(/^[\-\*]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<oli>$1</oli>');
  html = html.replace(/((?:<oli>.*<\/oli>\n?)+)/g, (m) => '<ol>' + m.replace(/<\/?oli>/g, (t) => t.replace('oli', 'li')) + '</ol>');

  // Images (before links — ! prefix distinguishes them)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Paragraphs
  html = html.replace(/^(?!<[a-z/!])((?!\s*$).+)$/gm, '<p>$1</p>');

  // Clean up
  html = html.replace(/\n{3,}/g, '\n\n');

  return html.trim();
}

function getXhsStyles(w = 1080) {
  return `
    body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; font-size: 32px; line-height: 1.8; color: #333; padding: 60px 50px; margin: 0; width: ${w}px; box-sizing: border-box; background: #fff; }
    h1 { font-size: 48px; font-weight: 700; margin: 40px 0 20px; color: #222; }
    h2 { font-size: 40px; font-weight: 700; margin: 36px 0 16px; color: #222; border-bottom: 2px solid #eee; padding-bottom: 8px; }
    h3 { font-size: 36px; font-weight: 600; margin: 28px 0 12px; color: #333; }
    h4 { font-size: 34px; font-weight: 600; margin: 24px 0 10px; color: #444; }
    h5 { font-size: 32px; font-weight: 600; margin: 20px 0 8px; color: #555; }
    h6 { font-size: 30px; font-weight: 600; margin: 16px 0 6px; color: #666; }
    p { margin: 16px 0; }
    strong { font-weight: 700; color: #d4402b; }
    em { color: #666; }
    code { background: #f5f5f5; padding: 2px 8px; border-radius: 4px; font-family: "SF Mono", Menlo, monospace; font-size: 28px; color: #d4402b; }
    pre { background: #1e1e1e; color: #d4d4d4; padding: 24px 28px; border-radius: 12px; overflow-x: auto; margin: 20px 0; }
    pre code { background: none; color: inherit; padding: 0; font-size: 26px; }
    blockquote { border-left: 4px solid #d4402b; padding-left: 20px; margin: 16px 0; color: #666; font-style: italic; }
    ul, ol { padding-left: 40px; margin: 16px 0; }
    li { margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #f8f8f8; padding: 12px 16px; border: 1px solid #ddd; font-weight: 600; text-align: left; }
    td { padding: 12px 16px; border: 1px solid #ddd; }
    tr:nth-child(even) td { background: #fafafa; }
    hr { border: none; border-top: 2px solid #eee; margin: 32px 0; }
    a { color: #d4402b; text-decoration: none; }
    img { max-width: 100%; border-radius: 8px; }
  `;
}

function splitPages(totalHeight, maxH = 3000) {
  if (!totalHeight || totalHeight <= 0) return { pageCount: 0, pages: [] };
  if (totalHeight <= maxH) return { pageCount: 1, pages: [{ index: 0, top: 0, height: totalHeight }] };
  const pages = [];
  let top = 0, idx = 0;
  while (top < totalHeight) {
    const h = Math.min(totalHeight - top, maxH);
    pages.push({ index: idx, top, height: h });
    top += h;
    idx++;
  }
  return { pageCount: pages.length, pages };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════════════════
// Load html2canvas dynamically
// ═══════════════════════════════════════════════════════════════════════

async function loadHtml2Canvas() {
  if (window.html2canvas) return window.html2canvas;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    script.onload = () => {
      if (window.html2canvas) resolve(window.html2canvas);
      else reject(new Error('html2canvas loaded but not found on window'));
    };
    script.onerror = () => reject(new Error('Failed to load html2canvas from CDN'));
    document.head.appendChild(script);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Render MD to base64 images via off-screen iframe + html2canvas
// ═══════════════════════════════════════════════════════════════════════

async function renderMarkdownToImages(md, imgWidth, maxH) {
  // 1. Convert markdown to HTML
  const htmlContent = markdownToHtml(md);
  if (!htmlContent) return { success: false, error: 'Markdown conversion produced empty HTML' };

  // 2. Load html2canvas
  let h2c;
  try {
    h2c = await loadHtml2Canvas();
  } catch (e) {
    return { success: false, error: `html2canvas load failed: ${e.message}`, hint: 'Make sure CDN is accessible' };
  }

  // 3. Create off-screen iframe
  const iframe = document.createElement('iframe');
  iframe.style.cssText = `position:fixed;left:-99999px;top:0;width:${imgWidth}px;border:none;overflow:hidden;`;
  document.body.appendChild(iframe);

  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${getXhsStyles(imgWidth)}</style></head><body>${htmlContent}</body></html>`);
    iframeDoc.close();

    // Wait for render
    await sleep(500);

    // 4. Measure content height
    const body = iframeDoc.body;
    const totalHeight = body.scrollHeight;

    // Resize iframe to full height
    iframe.style.height = totalHeight + 'px';

    // 5. Determine pages
    const { pageCount, pages } = splitPages(totalHeight, maxH);
    if (pageCount === 0) return { success: false, error: 'Content has zero height' };

    // 6. Screenshot each page
    const images = [];
    for (const page of pages) {
      const canvas = await h2c(body, {
        width: imgWidth,
        height: page.height,
        x: 0,
        y: page.top,
        windowWidth: imgWidth,
        windowHeight: page.height,
        scrollX: 0,
        scrollY: -page.top,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        scale: 1,
      });

      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      images.push({
        index: page.index,
        dataUrl,
        width: canvas.width,
        height: canvas.height,
        size: dataUrl.length,
      });
    }

    return {
      success: true,
      pageCount,
      totalHeight,
      width: imgWidth,
      maxPageHeight: maxH,
      images,
      htmlPreview: htmlContent.substring(0, 500) + (htmlContent.length > 500 ? '...' : ''),
    };

  } finally {
    // Always clean up iframe
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Action handlers
// ═══════════════════════════════════════════════════════════════════════

if (action === 'info') {
  return {
    action: 'info',
    module: 'markdown.js',
    version: '2.7.0',
    description: 'Convert Markdown to styled images for XHS publishing',
    actions: {
      renderMarkdown: 'MD text → base64 image(s). Args: markdown, width?, maxPageHeight?',
      publishMarkdown: 'MD text → render → upload → fill publish form. Args: markdown, title, content?, tags?, width?, maxPageHeight?',
      info: 'Show this help',
    },
    defaults: { width: 1080, maxPageHeight: 3000, imageFormat: 'JPEG 92%' },
    requirements: 'Must run on XHS creator publish page for publishMarkdown. html2canvas loaded from CDN.',
    supportedMarkdown: ['Headings (#-######)', 'Bold/Italic/Bold+Italic', 'Inline code + Fenced code blocks', 'Tables', 'Ordered/Unordered lists', 'Blockquotes', 'Horizontal rules', 'Links', 'Images', 'Paragraphs'],
  };
}

if (action === 'renderMarkdown') {
  if (!markdown) return { action: 'renderMarkdown', success: false, error: 'Missing "markdown" argument' };

  const result = await renderMarkdownToImages(markdown, width, maxPageHeight);
  return { action: 'renderMarkdown', ...result };
}

if (action === 'publishMarkdown') {
  if (!markdown) return { action: 'publishMarkdown', success: false, error: 'Missing "markdown" argument' };
  if (!title) return { action: 'publishMarkdown', success: false, error: 'Missing "title" argument' };

  // 1. Render markdown to images
  const renderResult = await renderMarkdownToImages(markdown, width, maxPageHeight);
  if (!renderResult.success) return { action: 'publishMarkdown', ...renderResult };

  // 2. Upload images via DataTransfer (same pattern as publish.js uploadImageBase64)
  const fileInputs = document.querySelectorAll('input[type="file"]');
  let fileInput = null;
  for (const fi of fileInputs) {
    const accept = (fi.accept || '').toLowerCase();
    if (accept.includes('image') || accept.includes('jpg') || accept.includes('png') || accept === '' || accept === '*/*') {
      fileInput = fi;
      break;
    }
  }
  if (!fileInput && fileInputs.length > 0) fileInput = fileInputs[0];
  if (!fileInput) return { action: 'publishMarkdown', success: false, error: 'No file input found. Make sure you are on the XHS publish page with 上传图文 tab selected.' };

  const dt = new DataTransfer();
  for (const img of renderResult.images) {
    const parts = img.dataUrl.split(',');
    const byteStr = atob(parts[1]);
    const ab = new ArrayBuffer(byteStr.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
    const blob = new Blob([ab], { type: 'image/jpeg' });
    const file = new File([blob], `md_page_${img.index}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
    dt.items.add(file);
  }
  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  fileInput.dispatchEvent(new Event('input', { bubbles: true }));

  // 3. Wait for editor to load
  await sleep(3000);

  // 4. Fill title
  const titleSelectors = ['input[placeholder*="标题"], input[maxlength="20"], input.c-input_inner, input[class*="titleInput"]'];
  let titleInput = null;
  for (const sel of titleSelectors) {
    titleInput = document.querySelector(sel);
    if (titleInput) break;
  }
  if (titleInput) {
    titleInput.focus();
    titleInput.value = '';
    document.execCommand('selectAll', false);
    document.execCommand('insertText', false, title.substring(0, 20));
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // 5. Fill content/description
  const desc = postContent || '';
  if (desc) {
    const editor = document.querySelector('.tiptap.ProseMirror, [contenteditable="true"]');
    if (editor) {
      editor.focus();
      document.execCommand('selectAll', false);
      document.execCommand('insertText', false, desc);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // 6. Add tags
  if (tags && tags.length > 0) {
    const editor = document.querySelector('.tiptap.ProseMirror, [contenteditable="true"]');
    if (editor) {
      editor.focus();
      for (const tag of tags) {
        const t = tag.startsWith('#') ? tag : `#${tag}`;
        document.execCommand('insertText', false, ` ${t}`);
        await sleep(600);
        // Dismiss dropdown
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await sleep(300);
      }
    }
  }

  return {
    action: 'publishMarkdown',
    success: true,
    pagesUploaded: renderResult.pageCount,
    titleFilled: !!titleInput,
    contentFilled: !!desc,
    tagsAdded: tags.length,
    hint: 'Form filled. Review and call publish.js { action: "clickPublish" } or { action: "saveDraft" } to finalize.',
  };
}

return { action, error: `Unknown action: ${action}. Available: renderMarkdown, publishMarkdown, info` };
