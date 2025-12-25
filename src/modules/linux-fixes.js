/**
 * Linux 特定问题修复模块
 * 
 * 修复的问题：
 * 1. 双击选中整行问题（WebKitGTK 行为差异）
 * 2. a 标签下载问题（WebKitGTK 下载处理）
 */

import { isLinux } from './utils/dom.js';

/**
 * 初始化 Linux 修复
 */
export function initLinuxFixes(log) {
  if (!isLinux()) {
    log('ℹ️  非 Linux 系统，跳过 Linux 修复');
    return;
  }

  log('🐧 检测到 Linux 系统，应用修复...');

  // 修复1: 双击选中行为
  fixDoubleClickSelection(log);

  // 修复2: input 边框显示问题（轻量版）
  fixInputBorderRendering(log);

  log('✅ Linux 修复已应用');
}

/**
 * 在 iframe 中应用 Linux 修复
 */
export function applyLinuxFixesToIframe(iframeDoc, log) {
  if (!isLinux() || !iframeDoc) return;

  try {
    // 注入 Linux 修复样式到 iframe
    injectLinuxStyles(iframeDoc, log);

    // 修复双击选中行为
    fixDoubleClickInDocument(iframeDoc, log);

    // 修复 a 标签下载问题
    fixDownloadInDocument(iframeDoc, log);

    log('✅ iframe Linux 修复已应用');
  } catch (err) {
    log(`⚠️  iframe Linux 修复失败: ${err.message}`);
  }
}

/**
 * 修复1: 双击选中行为
 * Linux WebKitGTK 双击会选中更多内容（类似三击选中整行）
 */
function fixDoubleClickSelection(log) {
  // 在主文档中应用修复
  fixDoubleClickInDocument(document, log);
}

function fixDoubleClickInDocument(doc, log) {
  doc.addEventListener('dblclick', (e) => {
    // 只处理文本内容，不处理输入框
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    // 获取选中内容
    const selection = doc.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const selectedText = selection.toString();
    
    // 如果选中的文本包含换行符或超过50个字符，说明选中了整行/多行
    // 这是 Linux WebKitGTK 的异常行为
    if (selectedText.includes('\n') || selectedText.length > 50) {
      log(`🔧 检测到 Linux 双击选中过多: "${selectedText.substring(0, 30)}..."`);
      
      // 尝试智能选择单词
      const range = selection.getRangeAt(0);
      const textNode = range.startContainer;
      
      if (textNode.nodeType === Node.TEXT_NODE) {
        const text = textNode.textContent;
        const clickOffset = range.startOffset;
        
        // 找到单词边界
        const wordBoundary = findWordBoundary(text, clickOffset);
        if (wordBoundary) {
          // 重新选择单词
          range.setStart(textNode, wordBoundary.start);
          range.setEnd(textNode, wordBoundary.end);
          selection.removeAllRanges();
          selection.addRange(range);
          log(`🔧 已修正选中: "${text.substring(wordBoundary.start, wordBoundary.end)}"`);
        }
      }
    }
  }, true);
}

/**
 * 找到单词边界
 */
function findWordBoundary(text, offset) {
  if (!text || offset < 0 || offset > text.length) return null;

  // 单词字符：字母、数字、下划线、中文字符
  const isWordChar = (char) => /[\w\u4e00-\u9fa5]/.test(char);

  let start = offset;
  let end = offset;

  // 向前查找单词开始
  while (start > 0 && isWordChar(text[start - 1])) {
    start--;
  }

  // 向后查找单词结束
  while (end < text.length && isWordChar(text[end])) {
    end++;
  }

  // 如果找到了有效的单词
  if (start < end) {
    return { start, end };
  }

  return null;
}

/**
 * 修复2: input 边框显示问题
 * Linux WebKitGTK 在某些缩放比例下 1px 边框可能显示不完整
 */
function fixInputBorderRendering(log) {
  injectLinuxStyles(document, log);
}

/**
 * 修复 a 标签下载问题
 * Linux WebKitGTK 对于 JS 触发的 a 标签点击下载可能无法正常工作
 */
function fixDownloadInDocument(doc, log) {
  // 监听动态创建的 a 标签下载
  // 拦截 createElement 来监控下载链接的创建
  const originalCreateElement = doc.createElement.bind(doc);
  
  doc.createElement = function(tagName) {
    const element = originalCreateElement(tagName);
    
    if (tagName.toLowerCase() === 'a') {
      // 监听 click 事件
      element.addEventListener('click', function(e) {
        const href = this.href || '';
        const hasDownload = this.hasAttribute('download');
        const isBlobUrl = href.startsWith('blob:');
        const isDataUrl = href.startsWith('data:');
        
        if ((hasDownload || isBlobUrl || isDataUrl) && (isBlobUrl || isDataUrl)) {
          log(`📥 拦截下载: ${href.substring(0, 50)}...`);
          
          e.preventDefault();
          e.stopPropagation();
          
          const filename = this.download || 'download';
          
          // 使用 Blob 转 ArrayBuffer 然后保存
          fetch(href)
            .then(res => res.blob())
            .then(blob => {
              // 尝试通过 Tauri 的 dialog API 保存文件
              if (window.__TAURI__ && window.__TAURI__.dialog) {
                blob.arrayBuffer().then(buffer => {
                  const uint8Array = new Uint8Array(buffer);
                  // 这里可以调用 Tauri 保存文件 API
                  log(`📥 Blob 大小: ${uint8Array.length} bytes`);
                });
              }
              
              // 回退方案：直接打开 URL
              const newUrl = URL.createObjectURL(blob);
              window.open(newUrl, '_blank');
              
              setTimeout(() => URL.revokeObjectURL(newUrl), 5000);
              log(`✅ 已打开下载窗口: ${filename}`);
            })
            .catch(err => {
              log(`❌ 下载处理失败: ${err.message}`);
              // 最后尝试直接打开
              window.open(href, '_blank');
            });
        }
      }, true);
    }
    
    return element;
  };

  log('🔧 Linux 下载修复已启用');
}

/**
 * 注入 Linux 专用样式
 * 注意：边框问题是由缩放引起的，不需要额外的边框样式修复
 */
function injectLinuxStyles(doc, log) {
  if (!doc.head) return;

  // 检查是否已经注入
  if (doc.getElementById('tauri-linux-fixes-style')) return;

  const style = doc.createElement('style');
  style.id = 'tauri-linux-fixes-style';
  style.textContent = `
    /* ========== Linux 专用修复样式（轻量版） ========== */

    /* 防止亚像素渲染问题导致的边框闪烁 */
    input, textarea, select {
      -webkit-transform: translateZ(0);
      transform: translateZ(0);
    }

    /* 防止双击选中整行 - 限制选择范围 */
    p, div, span, li, td, th, label {
      word-break: break-word;
      overflow-wrap: break-word;
    }
  `;
  doc.head.appendChild(style);
  log('🎨 Linux 轻量修复样式已注入');
}

